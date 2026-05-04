from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.budget_pdf import build_budget_pdf
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.limiter import limiter
from app.schemas import BudgetCreate, BudgetRejectRequest, BudgetSendRequest
from app.tenant_logo import generate_tenant_logo_presigned_url
from models import (
    Budget,
    BudgetProductItem,
    BudgetServiceItem,
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
) -> list[dict]:
    query = _budget_query_for_tenant(current_user.tenant_id)
    if status_filter is not None:
        query = query.where(Budget.status == status_filter)
    rows = db.execute(query.order_by(Budget.id.desc()).offset(skip).limit(limit)).scalars().all()
    payload = [_budget_to_out(row) for row in rows]
    return JSONResponse(content=jsonable_encoder(payload))


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

    budget = Budget(
        tenant_id=current_user.tenant_id,
        client_id=payload.client_id,
        title=f"Orcamento - {client.name}",
        description=payload.observation,
        status=BudgetStatus.DRAFT,
        payment_method=payload.payment_method,
        payment_terms=payload.payment_terms,
        warranty_terms=payload.warranty_terms,
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
    budget = db.execute(_budget_query_for_tenant(current_user.tenant_id).where(Budget.id == budget_id)).scalar_one_or_none()
    if budget is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found.")
    if budget.status == BudgetStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Approved budget cannot be sent again.")
    budget.status = BudgetStatus.SENT
    budget.sent_at = payload.sent_at or datetime.now(timezone.utc)
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

    db.commit()
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
    pdf_bytes = build_budget_pdf(budget, tenant, logo_url=logo_url)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="orcamento-{budget.id}.pdf"'},
    )
