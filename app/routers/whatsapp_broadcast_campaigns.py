from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.marketplace_util import tenant_has_marketplace_app
from app.plan_rules import get_plan_definition
from app.schemas_whatsapp_broadcast_campaigns import (
    WhatsappBroadcastCampaignCreate,
    WhatsappBroadcastCampaignOut,
    WhatsappBroadcastCampaignPatch,
    WhatsappBroadcastCampaignPreviewOut,
    WhatsappBroadcastCampaignRunOut,
    WhatsappBroadcastCampaignRunResultOut,
)
from app.whatsapp_broadcast_campaigns import (
    campaign_to_out,
    create_campaign,
    delete_campaign,
    get_campaign,
    list_campaigns,
    list_runs,
    preview_campaign,
    run_campaign,
    update_campaign,
)
from models import Tenant, User, UserRole

router = APIRouter(prefix="/whatsapp/broadcast-campaigns", tags=["whatsapp-broadcast-campaigns"])


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


@router.get(
    "",
    response_model=list[WhatsappBroadcastCampaignOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def list_broadcast_campaigns(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[dict]:
    _require_whatsapp_module(db, current_user.tenant_id)
    return list_campaigns(db, tenant_id=current_user.tenant_id)


@router.post(
    "",
    response_model=WhatsappBroadcastCampaignOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def create_broadcast_campaign(
    payload: WhatsappBroadcastCampaignCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return create_campaign(db, tenant_id=current_user.tenant_id, payload=payload.model_dump())


@router.get(
    "/{campaign_id}/preview",
    response_model=WhatsappBroadcastCampaignPreviewOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def get_broadcast_campaign_preview(
    campaign_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    sample_limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return preview_campaign(db, tenant_id=current_user.tenant_id, campaign_id=campaign_id, sample_limit=sample_limit)


@router.post(
    "/{campaign_id}/run",
    response_model=WhatsappBroadcastCampaignRunResultOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def post_broadcast_campaign_run(
    campaign_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return run_campaign(db, tenant_id=current_user.tenant_id, campaign_id=campaign_id, user=current_user)


@router.get(
    "/{campaign_id}/runs",
    response_model=list[WhatsappBroadcastCampaignRunOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def get_broadcast_campaign_runs(
    campaign_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> list[dict]:
    _require_whatsapp_module(db, current_user.tenant_id)
    return list_runs(db, tenant_id=current_user.tenant_id, campaign_id=campaign_id, limit=limit)


@router.get(
    "/{campaign_id}",
    response_model=WhatsappBroadcastCampaignOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def get_broadcast_campaign(
    campaign_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return campaign_to_out(get_campaign(db, tenant_id=current_user.tenant_id, campaign_id=campaign_id))


@router.patch(
    "/{campaign_id}",
    response_model=WhatsappBroadcastCampaignOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def patch_broadcast_campaign(
    campaign_id: int,
    payload: WhatsappBroadcastCampaignPatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return update_campaign(
        db,
        tenant_id=current_user.tenant_id,
        campaign_id=campaign_id,
        patch=payload.model_dump(exclude_unset=True),
    )


@router.delete(
    "/{campaign_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def remove_broadcast_campaign(
    campaign_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    _require_whatsapp_module(db, current_user.tenant_id)
    delete_campaign(db, tenant_id=current_user.tenant_id, campaign_id=campaign_id)
    return None
