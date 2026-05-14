from __future__ import annotations

from secrets import compare_digest
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import PREVENTIVE_CRON_SECRET
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.marketplace_util import tenant_has_marketplace_app
from app.plan_rules import get_plan_definition
from app.preventive_maintenance import (
    build_preventive_reminder_send_bundle,
    build_preview,
    create_historico,
    create_historicos_from_service_order,
    dispatch_preventive_due_today,
    dispatch_preventive_reminder,
    dispatch_preventive_reminders_bulk,
    get_preventive_settings,
    list_interest_leads,
    list_preventive_items,
    patch_preventive_settings,
    register_manual_preventive_entry,
    spawn_preventive_reminder_send_thread,
    spawn_preventive_reminders_bulk_thread,
)
from app.security import JWT_ALGORITHM, JWT_SECRET_KEY
from app.schemas_whatsapp import WhatsappMessageJobOut
from app.schemas_preventive import (
    HistoricoServicoCreate,
    HistoricoServicoOut,
    PreventiveBulkSendOut,
    PreventiveBulkSendRequest,
    PreventiveHistoricoFromOsCreate,
    PreventiveItemOut,
    PreventiveLeadOut,
    PreventivePreviewOut,
    PreventiveRegisterEntryCreate,
    PreventiveRegisterEntryOut,
    PreventiveSendReminderOut,
    PreventiveSendRequest,
    PreventiveSettingsOut,
    PreventiveSettingsPatch,
)
from models import Tenant, User, UserRole

router = APIRouter(prefix="/preventive-maintenance", tags=["preventive-maintenance"])

_optional_bearer = HTTPBearer(auto_error=False)


def _admin_user_from_token(db: Session, token: str) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_error
    except jwt.InvalidTokenError as exc:
        raise credentials_error from exc

    user = db.execute(select(User).where(User.id == int(user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_error
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions.")
    return user


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


@router.get("/settings", response_model=PreventiveSettingsOut)
def get_settings(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return get_preventive_settings(db, current_user.tenant_id)


@router.patch("/settings", response_model=PreventiveSettingsOut)
def patch_settings(
    payload: PreventiveSettingsPatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    if not payload.model_fields_set:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nada para atualizar.")
    return patch_preventive_settings(db, current_user.tenant_id, payload)


@router.get("/items", response_model=list[PreventiveItemOut])
def list_items(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    days: Annotated[int, Query(ge=1, le=400)] = 7,
) -> list[PreventiveItemOut]:
    _require_whatsapp_module(db, current_user.tenant_id)
    rows = list_preventive_items(db, tenant_id=current_user.tenant_id, window_days=days)
    return [PreventiveItemOut.model_validate(r) for r in rows]


@router.get("/preview", response_model=PreventivePreviewOut)
def preview_message(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    historico_servico_id: Annotated[int, Query(ge=1)],
    technical_problem_hint: Annotated[str | None, Query()] = None,
) -> PreventivePreviewOut:
    _require_whatsapp_module(db, current_user.tenant_id)
    return build_preview(
        db,
        tenant_id=current_user.tenant_id,
        historico_servico_id=historico_servico_id,
        override_problem=technical_problem_hint,
    )


@router.post("/historico", response_model=HistoricoServicoOut, status_code=status.HTTP_201_CREATED)
def post_historico(
    payload: HistoricoServicoCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Cadastro de histórico (vencimento preventivo); não exige módulo WhatsApp — só envio de campanha exige."""
    row = create_historico(
        db,
        tenant_id=current_user.tenant_id,
        client_id=payload.client_id,
        service_id=payload.service_id,
        data_realizacao=payload.data_realizacao,
        service_order_id=payload.service_order_id,
        notes=payload.notes,
    )
    return row


@router.post(
    "/historico/from-service-order/{service_order_id}",
    response_model=list[HistoricoServicoOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def post_historico_from_service_order(
    service_order_id: Annotated[int, Path(ge=1)],
    payload: PreventiveHistoricoFromOsCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Registra histórico preventivo a partir da OS; não exige módulo WhatsApp."""
    rows = create_historicos_from_service_order(
        db,
        tenant_id=current_user.tenant_id,
        service_order_id=service_order_id,
        data_realizacao=payload.data_realizacao,
        notes=payload.notes,
    )
    return rows


@router.post(
    "/send-reminder",
    response_model=PreventiveSendReminderOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def send_reminder(
    payload: PreventiveSendRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PreventiveSendReminderOut:
    _require_whatsapp_module(db, current_user.tenant_id)
    build_preventive_reminder_send_bundle(
        db,
        tenant_id=current_user.tenant_id,
        historico_servico_id=payload.historico_servico_id,
        promo_image_url=payload.promo_image_url,
        promo_image_base64=payload.promo_image_base64,
        promo_image_mimetype=payload.promo_image_mimetype,
        technical_problem_hint=payload.technical_problem_hint,
    )
    spawn_preventive_reminder_send_thread(
        current_user.tenant_id,
        current_user.id,
        payload.historico_servico_id,
        payload.promo_image_url,
        payload.promo_image_base64,
        payload.promo_image_mimetype,
        payload.technical_problem_hint,
    )
    return PreventiveSendReminderOut(processing_in_background=True, whatsapp_job=None)


@router.post(
    "/register-entry",
    response_model=PreventiveRegisterEntryOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def post_register_entry(
    payload: PreventiveRegisterEntryCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PreventiveRegisterEntryOut:
    """Registra última realização + opcionalmente envia ou agenda lembrete WhatsApp."""
    if payload.reminder_send != "none":
        _require_whatsapp_module(db, current_user.tenant_id)
    hist, job = register_manual_preventive_entry(
        db,
        tenant_id=current_user.tenant_id,
        created_by_user=current_user,
        client_id=payload.client_id,
        new_client=payload.new_client,
        service_id=payload.service_id,
        data_realizacao=payload.data_realizacao,
        notes=payload.notes,
        reminder_send=payload.reminder_send,
        reminder_local_date=payload.reminder_local_date,
        reminder_local_time=payload.reminder_local_time,
        promo_image_url=payload.promo_image_url,
        promo_image_base64=payload.promo_image_base64,
        promo_image_mimetype=payload.promo_image_mimetype,
        technical_problem_hint=payload.technical_problem_hint,
    )
    return PreventiveRegisterEntryOut(
        historico=HistoricoServicoOut.model_validate(hist),
        whatsapp_job=WhatsappMessageJobOut.model_validate(job) if job is not None else None,
    )


@router.get("/leads", response_model=list[PreventiveLeadOut])
def list_leads(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[PreventiveLeadOut]:
    _require_whatsapp_module(db, current_user.tenant_id)
    rows = list_interest_leads(db, tenant_id=current_user.tenant_id, limit=limit)
    return [PreventiveLeadOut.model_validate(r) for r in rows]


@router.post(
    "/send-reminders-bulk",
    response_model=PreventiveBulkSendOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def send_reminders_bulk(
    payload: PreventiveBulkSendRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PreventiveBulkSendOut:
    _require_whatsapp_module(db, current_user.tenant_id)
    ids = list(payload.historico_servico_ids)
    if not ids:
        wd = int(payload.window_days_if_empty or 7)
        rows = list_preventive_items(db, tenant_id=current_user.tenant_id, window_days=wd)
        ids = [int(r["historico_servico_id"]) for r in rows if r.get("whatsapp_valido")]
    if len(ids) >= 2:
        spawn_preventive_reminders_bulk_thread(
            current_user.tenant_id,
            current_user.id,
            ids,
            payload.promo_image_url,
        )
        return PreventiveBulkSendOut(
            attempted=len(ids),
            sent=0,
            failed=0,
            errors=[],
            processing_in_background=True,
        )
    result = dispatch_preventive_reminders_bulk(
        db,
        tenant_id=current_user.tenant_id,
        created_by_user=current_user,
        historico_servico_ids=ids,
        promo_image_url=payload.promo_image_url,
    )
    return PreventiveBulkSendOut.model_validate(result)


@router.post("/run-due-cron")
def run_due_cron(
    db: Annotated[Session, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_optional_bearer)] = None,
    x_preventive_cron_secret: Annotated[str | None, Header(alias="X-Preventive-Cron-Secret")] = None,
) -> dict:
    """Lembretes automáticos (vencimento + antecipados). Use JWT admin ou `X-Preventive-Cron-Secret` se configurado."""
    cfg = (PREVENTIVE_CRON_SECRET or "").strip()
    hdr = (x_preventive_cron_secret or "").strip()
    if cfg and compare_digest(hdr, cfg):
        return dispatch_preventive_due_today()
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Informe Bearer de administrador ou X-Preventive-Cron-Secret.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    _admin_user_from_token(db, credentials.credentials)
    return dispatch_preventive_due_today()
