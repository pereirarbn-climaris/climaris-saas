from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.marketplace_util import tenant_has_marketplace_app
from app.plan_rules import normalize_plan_key
from app.schemas_whatsapp_bot import (
    WhatsappBotFlowCreate,
    WhatsappBotFlowOut,
    WhatsappBotFlowPatch,
    WhatsappBotSeedDefaultsResponse,
    WhatsappBotSessionOut,
    WhatsappBotSettingsOut,
    WhatsappBotSettingsPatch,
    WhatsappBotStepCreate,
    WhatsappBotStepOut,
    WhatsappBotStepPatch,
    WhatsappBotTestRequest,
    WhatsappBotTestResponse,
)
from app.whatsapp_bot import (
    create_flow,
    create_step,
    delete_flow,
    delete_step,
    get_flow,
    get_or_create_settings,
    list_flows,
    seed_default_flows,
    test_message,
    update_flow,
    update_settings,
    update_step,
)
from models import Tenant, User, UserRole, WhatsappBotSession

router = APIRouter(prefix="/whatsapp/bot", tags=["whatsapp-bot"])


def _require_whatsapp_module(db: Session, tenant_id: int) -> None:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    plan = normalize_plan_key(tenant.active_plan)
    if plan == "beta_internal":
        return
    if tenant_has_marketplace_app(db, tenant_id, "whatsapp"):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Módulo WhatsApp não contratado. Solicite na Loja de integrações.",
    )


@router.get(
    "/settings",
    response_model=WhatsappBotSettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def get_bot_settings(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    from app.whatsapp_bot import _setting_to_out

    return _setting_to_out(get_or_create_settings(db, tenant_id=current_user.tenant_id))


@router.patch(
    "/settings",
    response_model=WhatsappBotSettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def patch_bot_settings(
    payload: WhatsappBotSettingsPatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return update_settings(db, tenant_id=current_user.tenant_id, patch=payload.model_dump(exclude_unset=True))


@router.post(
    "/seed-defaults",
    response_model=WhatsappBotSeedDefaultsResponse,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def seed_bot_default_flows(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return seed_default_flows(db, tenant_id=current_user.tenant_id)


@router.get(
    "/flows",
    response_model=list[WhatsappBotFlowOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def list_bot_flows(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[dict]:
    _require_whatsapp_module(db, current_user.tenant_id)
    return list_flows(db, tenant_id=current_user.tenant_id)


@router.post(
    "/flows",
    response_model=WhatsappBotFlowOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def create_bot_flow(
    payload: WhatsappBotFlowCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return create_flow(db, tenant_id=current_user.tenant_id, payload=payload.model_dump())


@router.get(
    "/flows/{flow_id}",
    response_model=WhatsappBotFlowOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def get_bot_flow(
    flow_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    from app.whatsapp_bot import flow_to_out

    return flow_to_out(get_flow(db, tenant_id=current_user.tenant_id, flow_id=flow_id))


@router.patch(
    "/flows/{flow_id}",
    response_model=WhatsappBotFlowOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def patch_bot_flow(
    flow_id: int,
    payload: WhatsappBotFlowPatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return update_flow(
        db,
        tenant_id=current_user.tenant_id,
        flow_id=flow_id,
        patch=payload.model_dump(exclude_unset=True),
    )


@router.delete(
    "/flows/{flow_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def delete_bot_flow(
    flow_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    _require_whatsapp_module(db, current_user.tenant_id)
    delete_flow(db, tenant_id=current_user.tenant_id, flow_id=flow_id)
    return None


@router.post(
    "/flows/{flow_id}/steps",
    response_model=WhatsappBotStepOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def create_bot_step(
    flow_id: int,
    payload: WhatsappBotStepCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return create_step(db, tenant_id=current_user.tenant_id, flow_id=flow_id, payload=payload.model_dump())


@router.patch(
    "/flows/{flow_id}/steps/{step_id}",
    response_model=WhatsappBotStepOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def patch_bot_step(
    flow_id: int,
    step_id: int,
    payload: WhatsappBotStepPatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return update_step(
        db,
        tenant_id=current_user.tenant_id,
        flow_id=flow_id,
        step_id=step_id,
        patch=payload.model_dump(exclude_unset=True),
    )


@router.delete(
    "/flows/{flow_id}/steps/{step_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def delete_bot_step(
    flow_id: int,
    step_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    _require_whatsapp_module(db, current_user.tenant_id)
    delete_step(db, tenant_id=current_user.tenant_id, flow_id=flow_id, step_id=step_id)
    return None


@router.post(
    "/test",
    response_model=WhatsappBotTestResponse,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def test_bot_message(
    payload: WhatsappBotTestRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return test_message(
        db,
        tenant_id=current_user.tenant_id,
        message_text=payload.message_text,
        client_whatsapp=payload.client_whatsapp,
        context=payload.context,
        reset_session=payload.reset_session,
    )


@router.get(
    "/sessions",
    response_model=list[WhatsappBotSessionOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def list_bot_sessions(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[dict]:
    _require_whatsapp_module(db, current_user.tenant_id)
    rows = db.execute(
        select(WhatsappBotSession)
        .where(WhatsappBotSession.tenant_id == current_user.tenant_id)
        .options(selectinload(WhatsappBotSession.current_flow))
        .order_by(WhatsappBotSession.updated_at.desc(), WhatsappBotSession.id.desc())
        .limit(100)
    ).scalars().all()
    result: list[dict] = []
    for row in rows:
        try:
            context = json.loads(row.context_json or "{}")
        except (TypeError, ValueError):
            context = {}
        result.append(
            {
                "id": row.id,
                "tenant_id": row.tenant_id,
                "client_whatsapp": row.client_whatsapp,
                "current_flow_id": row.current_flow_id,
                "current_flow_name": row.current_flow.name if row.current_flow else None,
                "current_step_key": row.current_step_key,
                "context": context if isinstance(context, dict) else {},
                "paused_until": row.paused_until,
                "last_incoming_at": row.last_incoming_at,
                "last_outgoing_at": row.last_outgoing_at,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
        )
    return result


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def clear_bot_session(
    session_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    _require_whatsapp_module(db, current_user.tenant_id)
    row = db.execute(
        select(WhatsappBotSession).where(
            WhatsappBotSession.id == session_id,
            WhatsappBotSession.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sessão do bot não encontrada.")
    db.delete(row)
    db.commit()
    return None
