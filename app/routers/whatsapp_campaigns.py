from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.campaign_analytics import compare_campaigns_analytics, get_campaign_analytics
from app.campaign_leads_import import (
    build_import_template_xlsx,
    confirm_external_leads,
    import_external_leads,
    validate_leads_from_file,
)
from app.campaign_dispatch import get_campaign_dispatch_status, schedule_campaign_dispatch
from app.campaign_processor import (
    create_campaign,
    delete_campaign_asset,
    initiate_campaign_run,
    list_campaigns,
    preview_campaign,
    preview_recipients,
    run_campaign,
    upload_campaign_asset,
)
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.marketplace_util import tenant_has_marketplace_app
from app.plan_rules import get_plan_definition
from app.schemas_campaigns import (
    CampaignAnalyticsOut,
    CampaignAssetOut,
    CampaignCompareItemOut,
    CampaignCreate,
    CampaignLeadsConfirmIn,
    CampaignLeadsImportOut,
    CampaignLeadsValidateOut,
    CampaignOut,
    CampaignPreviewOut,
    CampaignPreviewRequest,
    CampaignDispatchStatusOut,
    CampaignRunOut,
    CampaignRunRequest,
    CampaignRunStartedOut,
)
from models import Tenant, User, UserRole

router = APIRouter(prefix="/whatsapp/campaigns", tags=["whatsapp-campaigns"])


def _require_whatsapp_module(db: Session, tenant_id: int) -> None:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    if get_plan_definition(tenant.active_plan).is_beta_internal:
        return
    if tenant_has_marketplace_app(db, tenant_id, "whatsapp"):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Módulo WhatsApp não contratado. Solicite na Loja de integrações.",
    )


@router.get("", response_model=list[CampaignOut], dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))])
def list_whatsapp_campaigns(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[dict]:
    _require_whatsapp_module(db, current_user.tenant_id)
    return list_campaigns(db, tenant_id=current_user.tenant_id)


@router.post("", response_model=CampaignOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_roles(UserRole.ADMIN))])
def create_whatsapp_campaign(
    payload: CampaignCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return create_campaign(db, tenant_id=current_user.tenant_id, user=current_user, payload=payload.model_dump())


@router.post("/assets", response_model=CampaignAssetOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def upload_whatsapp_campaign_asset(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    raw = await file.read()
    try:
        return upload_campaign_asset(
            db,
            tenant_id=current_user.tenant_id,
            user=current_user,
            file_bytes=raw,
            source_filename=file.filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.get(
    "/leads/import/template",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def download_campaign_leads_template() -> Response:
    content = build_import_template_xlsx()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="modelo-leads-campanha.xlsx"'},
    )


@router.post(
    "/leads/import/validate",
    response_model=CampaignLeadsValidateOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def validate_campaign_leads_import(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo vazio.")
    return validate_leads_from_file(file_bytes=raw, filename=file.filename)


@router.post(
    "/leads/import/confirm",
    response_model=CampaignLeadsImportOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def confirm_campaign_leads_import(
    payload: CampaignLeadsConfirmIn,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return confirm_external_leads(
        db,
        tenant_id=current_user.tenant_id,
        user=current_user,
        leads=[item.model_dump() for item in payload.leads],
        source_filename=payload.source_filename,
        discarded_invalid_count=payload.discarded_invalid_count,
    )


@router.post("/leads/import", response_model=CampaignLeadsImportOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def import_campaign_leads(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo vazio.")
    return import_external_leads(
        db,
        tenant_id=current_user.tenant_id,
        user=current_user,
        file_bytes=raw,
        source_filename=file.filename,
    )


@router.post("/preview", response_model=CampaignPreviewOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))])
def preview_recipients_endpoint(
    payload: CampaignPreviewRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return preview_recipients(
        db,
        tenant_id=current_user.tenant_id,
        selection_mode=payload.selection_mode,
        client_ids=payload.client_ids,
        inactive_days=payload.inactive_days,
        message_template=payload.message_template,
        external_lead_ids=payload.external_lead_ids,
        import_batch_id=payload.import_batch_id,
        send_speed=payload.send_speed,
    )


@router.delete("/assets/{asset_id}", status_code=status.HTTP_200_OK, dependencies=[Depends(require_roles(UserRole.ADMIN))])
def delete_whatsapp_campaign_asset(
    asset_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return delete_campaign_asset(db, tenant_id=current_user.tenant_id, asset_id=asset_id)


@router.get(
    "/analytics/compare",
    response_model=list[CampaignCompareItemOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def compare_whatsapp_campaigns(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    campaign_ids: str | None = None,
    limit: int = 8,
) -> list[dict]:
    _require_whatsapp_module(db, current_user.tenant_id)
    ids: list[int] | None = None
    if campaign_ids:
        ids = [int(x.strip()) for x in campaign_ids.split(",") if x.strip().isdigit()]
    return compare_campaigns_analytics(
        db,
        tenant_id=current_user.tenant_id,
        campaign_ids=ids,
        limit=limit,
    )


@router.get(
    "/{campaign_id}/analytics",
    response_model=CampaignAnalyticsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def whatsapp_campaign_analytics(
    campaign_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return get_campaign_analytics(db, tenant_id=current_user.tenant_id, campaign_id=campaign_id)


@router.get("/{campaign_id}/preview", response_model=CampaignPreviewOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))])
def preview_whatsapp_campaign(
    campaign_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return preview_campaign(db, tenant_id=current_user.tenant_id, campaign_id=campaign_id)


@router.get(
    "/{campaign_id}/dispatch-status",
    response_model=CampaignDispatchStatusOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def whatsapp_campaign_dispatch_status(
    campaign_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    status_row = get_campaign_dispatch_status(
        db, tenant_id=current_user.tenant_id, campaign_id=campaign_id
    )
    if status_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campanha não encontrada.")
    return status_row


@router.post(
    "/{campaign_id}/run",
    response_model=CampaignRunStartedOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def run_whatsapp_campaign(
    campaign_id: int,
    payload: CampaignRunRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    if not payload.run_async:
        result = run_campaign(
            db,
            tenant_id=current_user.tenant_id,
            campaign_id=campaign_id,
            user=current_user,
            selection_mode=payload.selection_mode,
            client_ids=payload.client_ids,
            inactive_days=payload.inactive_days,
            external_lead_ids=payload.external_lead_ids,
            import_batch_id=payload.import_batch_id,
            send_speed=payload.send_speed,
            scheduled_at=payload.scheduled_at,
        )
        return {
            **result,
            "campaign_id": result["campaign"]["id"],
            "status": result["campaign"]["status"],
            "scheduled_at": result["campaign"].get("scheduled_at"),
            "async_dispatch": False,
        }

    started = initiate_campaign_run(
        db,
        tenant_id=current_user.tenant_id,
        campaign_id=campaign_id,
        user=current_user,
        selection_mode=payload.selection_mode,
        client_ids=payload.client_ids,
        inactive_days=payload.inactive_days,
        external_lead_ids=payload.external_lead_ids,
        import_batch_id=payload.import_batch_id,
        send_speed=payload.send_speed,
        scheduled_at=payload.scheduled_at,
    )
    if started.get("status") != "scheduled":
        schedule_campaign_dispatch(
            campaign_id=int(started["campaign_id"]),
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
        )
    return {**started, "async_dispatch": started.get("async_dispatch", True)}
