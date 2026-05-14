from __future__ import annotations

import logging
from typing import Annotated
from datetime import datetime, timezone

import jwt as pyjwt
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import (
    EVOLUTION_API_KEY,
    EVOLUTION_WEBHOOK_JWT_SECRET,
    EVOLUTION_WEBHOOK_JWT_USE_APIKEY,
    EVOLUTION_WEBHOOK_TOKEN,
    WHATSAPP_WEBHOOK_ENABLED,
)
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.marketplace_util import tenant_has_marketplace_app
from app.plan_rules import normalize_plan_key
from app.security import JWT_ALGORITHM, JWT_SECRET_KEY
from app.schemas_whatsapp import (
    WhatsappAppointmentMessageSettingsOut,
    WhatsappAppointmentMessageSettingsPatch,
    WhatsappAppointmentReminderSendRequest,
    WhatsappReminderRulesOut,
    WhatsappReminderRulesPatch,
    WhatsappMessageJobOut,
    WhatsappTenantConnectionConfigureRequest,
    WhatsappTenantConnectionOut,
    WhatsappTemplateOut,
    WhatsappTemplateSendRequest,
    WhatsappWebhookAck,
    WhatsappChatbotRequest,
    WhatsappChatbotReplyOut,
)
from app.whatsapp import (
    TEMPLATES,
    chatbot_reply_for_message,
    consume_evolution_webhook,
    disconnect_instance,
    dispatch_appointment_reminder,
    dispatch_due_appointment_reminders,
    dispatch_template,
    ensure_tenant_instance,
    evolution_connect_qrcode_fields,
    get_instance_qrcode,
    get_instance_state,
    get_tenant_appointment_message_settings,
    get_tenant_reminder_rules,
    tenant_id_from_webhook_payload,
    update_tenant_appointment_message_settings,
    update_tenant_reminder_rules,
)
from models import Tenant, User, UserRole, WhatsappMessageJob

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])
logger = logging.getLogger(__name__)


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
    "/templates",
    response_model=list[WhatsappTemplateOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def list_templates(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[dict]:
    _require_whatsapp_module(db, current_user.tenant_id)
    return [
        {"key": key, "description": str(meta["description"]), "variables": list(meta["variables"])}
        for key, meta in TEMPLATES.items()
    ]


@router.get(
    "/jobs",
    response_model=list[WhatsappMessageJobOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def list_jobs(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[WhatsappMessageJob]:
    _require_whatsapp_module(db, current_user.tenant_id)
    return db.execute(
        select(WhatsappMessageJob)
        .where(WhatsappMessageJob.tenant_id == current_user.tenant_id)
        .order_by(WhatsappMessageJob.id.desc())
        .offset(skip)
        .limit(limit)
    ).scalars().all()


@router.post(
    "/send-template",
    response_model=WhatsappMessageJobOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def send_template_message(
    payload: WhatsappTemplateSendRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> WhatsappMessageJob:
    _require_whatsapp_module(db, current_user.tenant_id)
    return dispatch_template(
        db,
        tenant_id=current_user.tenant_id,
        created_by_user=current_user,
        template_key=payload.template_key,
        recipient_whatsapp=payload.recipient_whatsapp,
        variables=payload.variables,
        reference_type=payload.reference_type,
        reference_id=payload.reference_id,
        scheduled_for=payload.scheduled_for,
    )


@router.get(
    "/connection",
    response_model=WhatsappTenantConnectionOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def get_tenant_connection(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> WhatsappTenantConnectionOut:
    _require_whatsapp_module(db, current_user.tenant_id)
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    instance_name = tenant.whatsapp_instance_name or ""
    if not instance_name:
        return WhatsappTenantConnectionOut(tenant_id=current_user.tenant_id, instance_name="", status="not_configured")
    state = get_instance_state(instance_name)
    state_value = state.get("instance", {}).get("state") if isinstance(state.get("instance"), dict) else state.get("state")
    if isinstance(state_value, str):
        tenant.whatsapp_connection_status = state_value
        if state_value.lower() in ("open", "connected") and tenant.whatsapp_connected_at is None:
            tenant.whatsapp_connected_at = datetime.now(timezone.utc)
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
    return WhatsappTenantConnectionOut(
        tenant_id=current_user.tenant_id,
        instance_name=instance_name,
        status=tenant.whatsapp_connection_status,
        connected_at=tenant.whatsapp_connected_at,
        raw=state,
    )


@router.post(
    "/connection/setup",
    response_model=WhatsappTenantConnectionOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def setup_tenant_connection(
    payload: WhatsappTenantConnectionConfigureRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> WhatsappTenantConnectionOut:
    _require_whatsapp_module(db, current_user.tenant_id)
    instance_name = ensure_tenant_instance(
        db, tenant_id=current_user.tenant_id, requested_instance_name=payload.instance_name
    )
    qr = get_instance_qrcode(instance_name)
    if not isinstance(qr, dict):
        qr = {}
    b64, pairing, evo_state = evolution_connect_qrcode_fields(qr)

    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")

    if evo_state in ("open", "connected"):
        tenant.whatsapp_connection_status = "open" if evo_state == "open" else "connected"
        if tenant.whatsapp_connected_at is None:
            tenant.whatsapp_connected_at = datetime.now(timezone.utc)
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
        return WhatsappTenantConnectionOut(
            tenant_id=current_user.tenant_id,
            instance_name=instance_name,
            status="connected",
            connected_at=tenant.whatsapp_connected_at,
            qrcode_base64=None,
            pairing_code=None,
            raw=qr,
        )

    tenant.whatsapp_connection_status = "connecting"
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return WhatsappTenantConnectionOut(
        tenant_id=current_user.tenant_id,
        instance_name=instance_name,
        status="connecting",
        qrcode_base64=b64,
        pairing_code=pairing,
        raw=qr,
    )


@router.post(
    "/connection/disconnect",
    response_model=WhatsappTenantConnectionOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def disconnect_tenant_whatsapp(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> WhatsappTenantConnectionOut:
    _require_whatsapp_module(db, current_user.tenant_id)
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    instance_name = (tenant.whatsapp_instance_name or "").strip()
    if not instance_name:
        return WhatsappTenantConnectionOut(
            tenant_id=current_user.tenant_id,
            instance_name="",
            status="not_configured",
            connected_at=None,
        )
    disconnect_instance(instance_name)
    tenant.whatsapp_connection_status = "close"
    tenant.whatsapp_connected_at = None
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return WhatsappTenantConnectionOut(
        tenant_id=current_user.tenant_id,
        instance_name=instance_name,
        status=tenant.whatsapp_connection_status,
        connected_at=None,
        raw={},
    )


@router.get(
    "/message-settings",
    response_model=WhatsappAppointmentMessageSettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def get_appointment_message_settings(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return get_tenant_appointment_message_settings(db, tenant_id=current_user.tenant_id)


@router.patch(
    "/message-settings",
    response_model=WhatsappAppointmentMessageSettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def patch_appointment_message_settings(
    payload: WhatsappAppointmentMessageSettingsPatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    if (
        payload.template_body is None
        and payload.confirm_keyword is None
        and payload.reschedule_keyword is None
    ):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nada para atualizar.")
    return update_tenant_appointment_message_settings(
        db,
        tenant_id=current_user.tenant_id,
        template_body=payload.template_body,
        confirm_keyword=payload.confirm_keyword,
        reschedule_keyword=payload.reschedule_keyword,
    )


@router.post(
    "/send-appointment-reminder",
    response_model=WhatsappMessageJobOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def send_appointment_reminder_message(
    payload: WhatsappAppointmentReminderSendRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> WhatsappMessageJob:
    _require_whatsapp_module(db, current_user.tenant_id)
    return dispatch_appointment_reminder(
        db,
        tenant_id=current_user.tenant_id,
        created_by_user=current_user,
        recipient_whatsapp=payload.recipient_whatsapp,
        nome_cliente=payload.nome_cliente,
        data_hora=payload.data_hora,
        empresa=payload.empresa,
        reference_id=payload.reference_id,
    )


@router.get(
    "/reminder-rules",
    response_model=WhatsappReminderRulesOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def get_reminder_rules(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return get_tenant_reminder_rules(db, tenant_id=current_user.tenant_id)


@router.patch(
    "/reminder-rules",
    response_model=WhatsappReminderRulesOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def patch_reminder_rules(
    payload: WhatsappReminderRulesPatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return update_tenant_reminder_rules(
        db,
        tenant_id=current_user.tenant_id,
        offset_15m=payload.offset_15m,
        offset_30m=payload.offset_30m,
        offset_1h=payload.offset_1h,
        offset_1d=payload.offset_1d,
        custom_enabled=payload.custom_enabled,
        custom_minutes=payload.custom_minutes,
    )


@router.post(
    "/dispatch-due-reminders",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def dispatch_due_reminders_now() -> dict[str, int]:
    return dispatch_due_appointment_reminders()


@router.post(
    "/chatbot/reply",
    response_model=WhatsappChatbotReplyOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def chatbot_reply(
    payload: WhatsappChatbotRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, str]:
    _require_whatsapp_module(db, current_user.tenant_id)
    return chatbot_reply_for_message(
        db,
        tenant_id=current_user.tenant_id,
        message_text=payload.message_text,
        client_name=payload.client_name,
    )


def _looks_like_jwt(value: str) -> bool:
    parts = value.split(".")
    return len(parts) == 3 and all(len(p) > 0 for p in parts)


def _verify_hs256_jwt_webhook(token: str, secret: str) -> bool:
    if not secret or not _looks_like_jwt(token):
        return False
    try:
        pyjwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"verify_signature": True, "verify_exp": True},
            leeway=120,
        )
        return True
    except pyjwt.PyJWTError:
        return False


def _verify_climaris_session_jwt_webhook(token: str, query_tenant_id: int | None) -> bool:
    """JWT emitido pelo login Climaris (HS256 + JWT_SECRET_KEY). Alguns setups colocam esse token na URL do webhook na Evolution."""
    if not JWT_SECRET_KEY or JWT_SECRET_KEY == "change-me-in-production" or not _looks_like_jwt(token):
        return False
    try:
        payload = pyjwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM] if JWT_ALGORITHM else ["HS256"],
            options={"verify_signature": True, "verify_exp": True},
            leeway=120,
        )
    except pyjwt.PyJWTError:
        return False
    tid = payload.get("tenant_id")
    if tid is None:
        return False
    try:
        tid_int = int(tid)
    except (TypeError, ValueError):
        return False
    if query_tenant_id is not None and tid_int != int(query_tenant_id):
        return False
    return True


def _tenant_id_from_climaris_jwt_token(token: str | None) -> int | None:
    """Extrai tenant_id de um JWT Climaris válido (segunda decodificação; volume baixo em webhook)."""
    if not token or not str(token).strip():
        return None
    p = str(token).strip()
    if not JWT_SECRET_KEY or JWT_SECRET_KEY == "change-me-in-production" or not _looks_like_jwt(p):
        return None
    try:
        payload = pyjwt.decode(
            p,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM] if JWT_ALGORITHM else ["HS256"],
            options={"verify_signature": True, "verify_exp": True},
            leeway=120,
        )
    except pyjwt.PyJWTError:
        return None
    tid = payload.get("tenant_id")
    if tid is None:
        return None
    try:
        return int(tid)
    except (TypeError, ValueError):
        return None


def _evolution_webhook_auth_configured() -> bool:
    return bool(
        EVOLUTION_WEBHOOK_TOKEN
        or EVOLUTION_WEBHOOK_JWT_SECRET
        or (EVOLUTION_WEBHOOK_JWT_USE_APIKEY and EVOLUTION_API_KEY)
    )


def _evolution_webhook_token_valid(provided: str | None, *, query_tenant_id: int | None) -> bool:
    """Aceita token estático, JWT da Evolution (HS256 com segredo configurado) ou JWT de sessão Climaris (login)."""
    if not provided or not str(provided).strip():
        return False
    p = str(provided).strip()
    if EVOLUTION_WEBHOOK_TOKEN and p == EVOLUTION_WEBHOOK_TOKEN:
        return True
    if _looks_like_jwt(p):
        # JWT de sessão do ERP (?token= no cadastro do webhook) antes de HS256 com API key:
        # com EVOLUTION_WEBHOOK_JWT_USE_APIKEY=true, assinaturas diferentes falhariam na Evolution antes de chegar aqui.
        if _verify_climaris_session_jwt_webhook(p, query_tenant_id):
            return True
        if EVOLUTION_WEBHOOK_JWT_SECRET and _verify_hs256_jwt_webhook(p, EVOLUTION_WEBHOOK_JWT_SECRET):
            return True
        if EVOLUTION_WEBHOOK_JWT_USE_APIKEY and EVOLUTION_API_KEY and _verify_hs256_jwt_webhook(p, EVOLUTION_API_KEY):
            return True
    return False


@router.post("/webhook/evolution", response_model=WhatsappWebhookAck, include_in_schema=False)
def evolution_webhook(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    payload: dict = Body(default_factory=dict),
    tenant_id: int | None = Query(default=None, ge=1),
    token: str | None = Query(default=None),
    x_webhook_token: str | None = Header(default=None),
    # Evolution API v2 envia AUTHENTICATION_API_KEY como header "apikey" no webhook.
    apikey: str | None = Header(default=None, alias="apikey"),
) -> dict:
    auth_hdr = (request.headers.get("authorization") or request.headers.get("Authorization") or "").strip()
    bearer: str | None = None
    if auth_hdr.lower().startswith("bearer "):
        bearer = auth_hdr[7:].strip()

    if not WHATSAPP_WEBHOOK_ENABLED:
        return {"status": "ignored"}
    provided_token = token or x_webhook_token or apikey or bearer
    if _evolution_webhook_auth_configured():
        if not _evolution_webhook_token_valid(provided_token, query_tenant_id=tenant_id):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Webhook token inválido.")
    resolved_tenant_id = (
        tenant_id
        or tenant_id_from_webhook_payload(db, payload if isinstance(payload, dict) else {})
        or _tenant_id_from_climaris_jwt_token(provided_token)
    )
    if not resolved_tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant do webhook não identificado.")
    try:
        consume_evolution_webhook(db, tenant_id=resolved_tenant_id, payload=payload if isinstance(payload, dict) else {})
    except Exception:
        logger.exception(
            "Falha ao processar webhook Evolution (tenant_id=%s); rollback e ACK 200 para não derrubar o worker.",
            resolved_tenant_id,
        )
        try:
            db.rollback()
        except Exception:
            logger.exception("Rollback após falha no webhook Evolution.")
        # ACK para a Evolution parar retry agressivo; evento pode ser reprocessado manualmente ou via logs.
        return {"status": "ok", "handler_error": True}
    return {"status": "ok"}
