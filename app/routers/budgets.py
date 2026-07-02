from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.budget_pdf import build_budget_pdf
from app.budget_signature import process_and_upload_budget_signature
from app.budget_template_settings import (
    _get_or_create_row,
    apply_budget_defaults_from_settings,
    build_budget_template_preview_pdf,
    get_budget_template_settings,
    patch_budget_template_settings,
)
from app.schemas_budget_template import BudgetTemplateSettingsOut, BudgetTemplateSettingsPatch
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.limiter import limiter
from app.schemas import BudgetCreate, BudgetRejectRequest, BudgetSendRequest, BudgetUpdate
from app.config import public_app_base_url
from app.storage_integrity import normalize_budget_status
from app.tenant_logo import (
    delete_tenant_logo_if_exists,
    fetch_s3_image_bytes,
    generate_tenant_logo_presigned_url,
)
from models import (
    Budget,
    BudgetProductItem,
    BudgetServiceItem,
    BudgetTemplateSettings,
    BudgetStatus,
    Client,
    OrderStatus,
    Product,
    Service,
    ServiceOrder,
    ServiceOrderProductItem,
    ServiceOrderServiceItem,
    Tenant,
    User,
    UserRole,
)

router = APIRouter(tags=["budgets"])


def _budget_tracking_url(budget: Budget) -> str:
    stored = getattr(budget, "tracking_url", None)
    if stored and str(stored).strip():
        return str(stored).strip()
    return f"{public_app_base_url().rstrip('/')}/app/budgets/{budget.id}"


def _budget_to_out(budget: Budget) -> dict:
    service_items = [
        {
            "id": item.id,
            "service_id": item.service_id,
            "quantity": item.quantity,
            "unit_price": float(item.unit_price),
            "duration_minutes": item.duration_minutes,
        }
        for item in budget.service_items
    ]
    product_items = [
        {
            "id": item.id,
            "product_id": item.product_id,
            "quantity": item.quantity,
            "unit_price": float(item.unit_price),
        }
        for item in budget.product_items
    ]
    return {
        "id": budget.id,
        "tenant_id": budget.tenant_id,
        "client_id": budget.client_id,
        "scope_text": budget.scope_text,
        "observation": budget.description,
        "status": budget.status.value if hasattr(budget.status, "value") else str(budget.status),
        "payment_method": budget.payment_method,
        "payment_terms": budget.payment_terms,
        "warranty_terms": budget.warranty_terms,
        "validity_days": budget.validity_days,
        "sent_at": budget.sent_at,
        "approved_at": budget.approved_at,
        "created_at": budget.created_at,
        "generated_service_order_id": budget.generated_service_order.id if budget.generated_service_order is not None else None,
        "tracking_url": _budget_tracking_url(budget),
        "pdf_file_missing": False,
        "storage_alert": None,
        "service_items": service_items,
        "product_items": product_items,
    }


def _budget_query_for_tenant(tenant_id: int):
    return (
        select(Budget)
        .where(Budget.tenant_id == tenant_id)
        .options(
            selectinload(Budget.service_items),
            selectinload(Budget.product_items),
            selectinload(Budget.generated_service_order),
        )
    )


@router.get(
    "/budgets",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def list_budgets(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status_filter: Annotated[BudgetStatus | None, Query(alias="status")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    include_storage_alerts: Annotated[
        bool,
        Query(description="Se true, retorna { items, storage_alerts } em vez de array (painel de orçamentos)."),
    ] = False,
) -> list[dict] | dict:
    query = _budget_query_for_tenant(current_user.tenant_id)
    if status_filter is not None:
        query = query.where(Budget.status == status_filter)
    rows = db.execute(query.order_by(Budget.id.desc()).offset(skip).limit(limit)).scalars().all()
    for row in rows:
        normalized = normalize_budget_status(row.status)
        if normalized is not None and normalized != row.status:
            row.status = normalized
    if rows:
        db.commit()
    payload = [_budget_to_out(row) for row in rows]
    if include_storage_alerts:
        return JSONResponse(content=jsonable_encoder({"items": payload, "storage_alerts": []}))
    return JSONResponse(content=jsonable_encoder(payload))


@router.get(
    "/budgets/template-settings",
    response_model=BudgetTemplateSettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def get_budget_template_settings_route(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> BudgetTemplateSettingsOut:
    data = get_budget_template_settings(db, tenant_id=current_user.tenant_id)
    return BudgetTemplateSettingsOut.model_validate(data)


@router.patch(
    "/budgets/template-settings",
    response_model=BudgetTemplateSettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def patch_budget_template_settings_route(
    payload: BudgetTemplateSettingsPatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> BudgetTemplateSettingsOut:
    data = patch_budget_template_settings(db, tenant_id=current_user.tenant_id, payload=payload)
    return BudgetTemplateSettingsOut.model_validate(data)


@router.post(
    "/budgets/template-settings/signature",
    response_model=BudgetTemplateSettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("20/minute")
async def upload_budget_template_signature(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> BudgetTemplateSettingsOut:
    row = _get_or_create_row(db, tenant_id=current_user.tenant_id)
    raw = await file.read()
    try:
        uploaded = process_and_upload_budget_signature(
            tenant_id=current_user.tenant_id,
            file_bytes=raw,
            source_filename=file.filename,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao processar ou enviar assinatura: {str(exc)}",
        ) from exc

    previous_key = row.signature_s3_key
    row.signature_s3_key = uploaded.s3_key
    row.signature_url = uploaded.public_url
    row.signature_content_type = uploaded.content_type
    db.commit()
    db.refresh(row)
    if previous_key and previous_key != uploaded.s3_key:
        delete_tenant_logo_if_exists(previous_key, db=db)
    data = get_budget_template_settings(db, tenant_id=current_user.tenant_id)
    return BudgetTemplateSettingsOut.model_validate(data)


@router.get(
    "/budgets/template-settings/signature/file",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def get_budget_template_signature_file(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Response:
    row = db.execute(
        select(BudgetTemplateSettings).where(BudgetTemplateSettings.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if row is None or not row.signature_s3_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assinatura não cadastrada.")
    try:
        data, content_type = fetch_s3_image_bytes(row.signature_s3_key, db=db)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "private, max-age=300"})


@router.delete(
    "/budgets/template-settings/signature",
    response_model=BudgetTemplateSettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("30/minute")
def delete_budget_template_signature(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> BudgetTemplateSettingsOut:
    row = _get_or_create_row(db, tenant_id=current_user.tenant_id)
    old_key = row.signature_s3_key
    row.signature_s3_key = None
    row.signature_url = None
    row.signature_content_type = None
    db.commit()
    if old_key:
        delete_tenant_logo_if_exists(old_key, db=db)
    data = get_budget_template_settings(db, tenant_id=current_user.tenant_id)
    return BudgetTemplateSettingsOut.model_validate(data)


@router.post(
    "/budgets/template-settings/preview-pdf",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def post_budget_template_preview_pdf(
    payload: BudgetTemplateSettingsPatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Response:
    tenant = db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id)).scalar_one()
    logo_url: str | None = getattr(tenant, "logo_url", None)
    logo_s3_key = getattr(tenant, "logo_s3_key", None)
    if logo_s3_key:
        try:
            logo_url = generate_tenant_logo_presigned_url(logo_s3_key, db=db, expires_seconds=600)
        except Exception:
            pass
    draft = BudgetTemplateSettingsPatch(
        template_key=payload.template_key or "classic",
        brand_color=payload.brand_color or getattr(tenant, "pdf_primary_color", None) or "#0B7FAF",
        font_color=payload.font_color or "#000000",
        default_warranty_terms=payload.default_warranty_terms,
        default_payment_terms=payload.default_payment_terms,
        default_technical_notes=payload.default_technical_notes,
    )
    pdf_bytes = build_budget_template_preview_pdf(
        db,
        tenant_id=current_user.tenant_id,
        payload=draft,
        logo_url=logo_url,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="orcamento-modelo-preview.pdf"'},
    )


@router.get(
    "/budgets/{budget_id}",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def get_budget(
    budget_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    budget = db.execute(_budget_query_for_tenant(current_user.tenant_id).where(Budget.id == budget_id)).scalar_one_or_none()
    if budget is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found.")
    return JSONResponse(content=jsonable_encoder(_budget_to_out(budget)))


@router.post(
    "/budgets",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def create_budget(
    request: Request,
    payload: BudgetCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, int | str]:
    client = db.execute(
        select(Client).where(Client.id == payload.client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")
    if not payload.services:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Budget requires at least one service.")
    if payload.validity_days < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="validity_days must be at least 1.")

    payment_terms, warranty_terms, scope_text, observation, payment_method = apply_budget_defaults_from_settings(
        db,
        tenant_id=current_user.tenant_id,
        payment_terms=payload.payment_terms,
        warranty_terms=payload.warranty_terms,
        scope_text=payload.scope_text,
        observation=payload.observation,
        payment_method=payload.payment_method,
    )

    budget = Budget(
        tenant_id=current_user.tenant_id,
        client_id=payload.client_id,
        title=f"Orcamento - {client.name}",
        scope_text=scope_text,
        description=observation,
        status=BudgetStatus.DRAFT,
        payment_method=payment_method,
        payment_terms=payment_terms,
        warranty_terms=warranty_terms,
        validity_days=payload.validity_days,
    )
    db.add(budget)
    db.flush()

    for service_item in payload.services:
        service = db.execute(
            select(Service).where(Service.id == service_item.service_id, Service.tenant_id == current_user.tenant_id)
        ).scalar_one_or_none()
        if service is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Service {service_item.service_id} not found.")
        db.add(
            BudgetServiceItem(
                budget_id=budget.id,
                service_id=service.id,
                quantity=max(service_item.quantity, 1),
                unit_price=service.price,
                duration_minutes=service.duration_minutes,
            )
        )

    for product_item in payload.products:
        product = db.execute(
            select(Product).where(Product.id == product_item.product_id, Product.tenant_id == current_user.tenant_id)
        ).scalar_one_or_none()
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product {product_item.product_id} not found.")
        db.add(
            BudgetProductItem(
                budget_id=budget.id,
                product_id=product.id,
                quantity=max(product_item.quantity, 1),
                unit_price=product.sale_price,
            )
        )

    db.commit()
    return {"id": budget.id, "status": budget.status.value}


def _replace_budget_line_items(
    db: Session,
    *,
    budget: Budget,
    tenant_id: int,
    services: list,
    products: list,
) -> None:
    for item in list(budget.service_items):
        db.delete(item)
    for item in list(budget.product_items):
        db.delete(item)
    db.flush()

    for service_item in services:
        service = db.execute(
            select(Service).where(Service.id == service_item.service_id, Service.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if service is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Service {service_item.service_id} not found.")
        db.add(
            BudgetServiceItem(
                budget_id=budget.id,
                service_id=service.id,
                quantity=max(service_item.quantity, 1),
                unit_price=service.price,
                duration_minutes=service.duration_minutes,
            )
        )

    for product_item in products:
        product = db.execute(
            select(Product).where(Product.id == product_item.product_id, Product.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product {product_item.product_id} not found.")
        db.add(
            BudgetProductItem(
                budget_id=budget.id,
                product_id=product.id,
                quantity=max(product_item.quantity, 1),
                unit_price=product.sale_price,
            )
        )


@router.patch(
    "/budgets/{budget_id}",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def update_budget(
    request: Request,
    budget_id: int,
    payload: BudgetUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    budget = db.execute(_budget_query_for_tenant(current_user.tenant_id).where(Budget.id == budget_id)).scalar_one_or_none()
    if budget is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found.")
    if budget.status == BudgetStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Approved budget cannot be edited.")

    client = db.execute(
        select(Client).where(Client.id == payload.client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")
    if not payload.services:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Budget requires at least one service.")
    if payload.validity_days < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="validity_days must be at least 1.")

    budget.client_id = payload.client_id
    budget.title = f"Orcamento - {client.name}"
    budget.scope_text = payload.scope_text
    budget.description = payload.observation
    budget.payment_method = payload.payment_method
    budget.payment_terms = payload.payment_terms
    budget.warranty_terms = payload.warranty_terms
    budget.validity_days = payload.validity_days

    _replace_budget_line_items(
        db,
        budget=budget,
        tenant_id=current_user.tenant_id,
        services=payload.services,
        products=payload.products,
    )

    db.commit()
    db.refresh(budget)
    return JSONResponse(content=jsonable_encoder(_budget_to_out(budget)))


@router.post(
    "/budgets/{budget_id}/send",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def send_budget_to_client(
    request: Request,
    budget_id: int,
    payload: BudgetSendRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    budget = db.execute(
        _budget_query_for_tenant(current_user.tenant_id)
        .where(Budget.id == budget_id)
        .options(
            selectinload(Budget.client),
            selectinload(Budget.service_items).selectinload(BudgetServiceItem.service),
            selectinload(Budget.product_items).selectinload(BudgetProductItem.product),
        )
    ).scalar_one_or_none()
    if budget is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found.")
    if budget.status == BudgetStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Approved budget cannot be sent again.")
    budget.status = BudgetStatus.SENT
    budget.sent_at = payload.sent_at or datetime.now(timezone.utc)
    budget.tracking_url = _budget_tracking_url(budget)
    budget.pdf_file_missing = False
    db.commit()
    db.refresh(budget)
    return JSONResponse(content=jsonable_encoder(_budget_to_out(budget)))


@router.post(
    "/budgets/{budget_id}/reject",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def reject_budget(
    request: Request,
    budget_id: int,
    payload: BudgetRejectRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    budget = db.execute(_budget_query_for_tenant(current_user.tenant_id).where(Budget.id == budget_id)).scalar_one_or_none()
    if budget is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found.")
    if budget.status == BudgetStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Approved budget cannot be rejected.")
    budget.status = BudgetStatus.REJECTED
    if payload.reason:
        budget.description = f"{budget.description or ''}\nReprovado: {payload.reason}".strip()
    db.commit()
    db.refresh(budget)
    return JSONResponse(content=jsonable_encoder(_budget_to_out(budget)))


@router.post(
    "/budgets/{budget_id}/approve",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def approve_budget(
    request: Request,
    budget_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, int | str]:
    budget = db.execute(_budget_query_for_tenant(current_user.tenant_id).where(Budget.id == budget_id)).scalar_one_or_none()
    if budget is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found.")
    if budget.generated_service_order is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Budget already generated a service order.")
    if not budget.service_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Budget has no services.")

    order = ServiceOrder(
        tenant_id=current_user.tenant_id,
        client_id=budget.client_id,
        source_budget_id=budget.id,
        title=budget.title,
        description=budget.description,
        status=OrderStatus.OPEN,
    )
    db.add(order)
    db.flush()

    for item in budget.service_items:
        db.add(
            ServiceOrderServiceItem(
                service_order_id=order.id,
                service_id=item.service_id,
                quantity=max(item.quantity, 1),
                unit_price=item.unit_price,
                duration_minutes=max(item.duration_minutes, 1),
            )
        )
    for item in budget.product_items:
        db.add(
            ServiceOrderProductItem(
                service_order_id=order.id,
                product_id=item.product_id,
                quantity=max(item.quantity, 1),
                unit_price=item.unit_price,
            )
        )

    budget.status = BudgetStatus.APPROVED
    budget.approved_at = datetime.now(timezone.utc)
    if budget.sent_at is None:
        budget.sent_at = budget.approved_at

    from app.campaign_analytics import INTERACTION_BUDGET_CREATED, INTERACTION_OS_CLOSED, link_conversion_to_campaign

    link_conversion_to_campaign(
        db,
        client_id=budget.client_id,
        interaction_type=INTERACTION_BUDGET_CREATED,
        tenant_id=current_user.tenant_id,
    )
    link_conversion_to_campaign(
        db,
        client_id=budget.client_id,
        interaction_type=INTERACTION_OS_CLOSED,
        tenant_id=current_user.tenant_id,
    )

    db.commit()
    from app.notifications import dispatch_budget_approved_notification, safe_commit_notification_dispatch

    safe_commit_notification_dispatch(
        db,
        dispatch_budget_approved_notification,
        budget=budget,
        service_order_id=order.id,
        actor=current_user,
    )
    return {
        "budget_id": budget.id,
        "budget_status": budget.status.value,
        "service_order_id": order.id,
        "service_order_status": order.status.value,
    }


@router.get(
    "/budgets/{budget_id}/pdf",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def budget_pdf(
    budget_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Response:
    budget = db.execute(
        _budget_query_for_tenant(current_user.tenant_id)
        .where(Budget.id == budget_id)
        .options(
            selectinload(Budget.client),
            selectinload(Budget.service_items).selectinload(BudgetServiceItem.service),
            selectinload(Budget.product_items).selectinload(BudgetProductItem.product),
        )
    ).scalar_one_or_none()
    if budget is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found.")
    tenant = db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id)).scalar_one()
    logo_url: str | None = getattr(tenant, "logo_url", None)
    logo_s3_key = getattr(tenant, "logo_s3_key", None)
    if logo_s3_key:
        try:
            logo_url = generate_tenant_logo_presigned_url(logo_s3_key, db=db, expires_seconds=600)
        except Exception:
            logo_url = logo_url
    pdf_bytes = build_budget_pdf(budget, tenant, logo_url=logo_url, db=db)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="orcamento-{budget.id}.pdf"'},
    )
