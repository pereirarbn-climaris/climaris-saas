"""WhatsApp da operação Climaris — conexão Evolution global e envio comercial."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import PLATFORM_OPERATOR_WHATSAPP
from app.database import get_db
from app.demo_appointment_notifications import (
    build_demo_client_whatsapp_preview,
    build_demo_operator_whatsapp_preview,
    send_demo_whatsapp_confirmation,
    send_demo_whatsapp_status,
    send_demo_whatsapp_text,
)
from app.dependencies import require_platform_operator
from app.platform_whatsapp import (
    PLATFORM_PROVIDER_EVOLUTION,
    available_platform_providers,
    disconnect_platform_connection,
    get_platform_connection,
    platform_send_text,
    resolve_platform_provider,
    resolve_platform_instance_name,
    safe_normalize_whatsapp,
    setup_platform_connection,
)
from app.schemas_platform_whatsapp import (
    PlatformDemoWhatsappSendIn,
    PlatformDemoWhatsappSendOut,
    PlatformWhatsappConnectionOut,
    PlatformWhatsappConnectionSetupIn,
    PlatformWhatsappSendResultOut,
    PlatformWhatsappSendTextIn,
    PlatformWhatsappSettingsOut,
)
from models import DemoAppointment, PlatformWebsiteSettings, User

router = APIRouter(prefix="/platform/whatsapp", tags=["platform-whatsapp"])

_WEBSITE_SETTINGS_ID = 1


def _resolve_operator_whatsapp(db: Session) -> tuple[str | None, str]:
    from_env = safe_normalize_whatsapp(PLATFORM_OPERATOR_WHATSAPP)
    if from_env:
        return from_env, "env"
    row = db.get(PlatformWebsiteSettings, _WEBSITE_SETTINGS_ID)
    if row and row.contact_phone:
        normalized = safe_normalize_whatsapp(row.contact_phone)
        if normalized:
            return normalized, "website_settings"
    return None, "none"


@router.get("/connection", response_model=PlatformWhatsappConnectionOut)
def get_connection(
    _: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_db)],
    provider: str | None = None,
) -> PlatformWhatsappConnectionOut:
    payload = get_platform_connection(provider=provider, db=db)
    return PlatformWhatsappConnectionOut(**payload)


@router.post("/connection/setup", response_model=PlatformWhatsappConnectionOut)
def setup_connection(
    payload: PlatformWhatsappConnectionSetupIn,
    _: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_db)],
) -> PlatformWhatsappConnectionOut:
    result = setup_platform_connection(payload.instance_name, provider=payload.provider, db=db)
    return PlatformWhatsappConnectionOut(**result)


@router.post("/connection/disconnect", response_model=PlatformWhatsappConnectionOut)
def disconnect_connection(
    _: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_db)],
    provider: str | None = None,
) -> PlatformWhatsappConnectionOut:
    result = disconnect_platform_connection(provider=provider, db=db)
    return PlatformWhatsappConnectionOut(**result)


@router.get("/settings", response_model=PlatformWhatsappSettingsOut)
def get_settings(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_platform_operator)],
) -> PlatformWhatsappSettingsOut:
    operator_whatsapp, source = _resolve_operator_whatsapp(db)
    conn = get_platform_connection(provider=PLATFORM_PROVIDER_EVOLUTION, db=db)
    return PlatformWhatsappSettingsOut(
        default_provider=resolve_platform_provider(None),
        available_providers=available_platform_providers(),
        operator_whatsapp=operator_whatsapp,
        operator_whatsapp_source=source,
        evolution_instance_name=resolve_platform_instance_name(),
        evolution_configured=bool(conn.get("evolution_configured")),
        official_configured=bool(conn.get("official_configured")),
        demo_client_message_preview=build_demo_client_whatsapp_preview(),
        demo_operator_message_preview=build_demo_operator_whatsapp_preview(),
    )


@router.post("/send-text", response_model=PlatformWhatsappSendResultOut)
def send_text_message(
    payload: PlatformWhatsappSendTextIn,
    _: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_db)],
) -> PlatformWhatsappSendResultOut:
    number = safe_normalize_whatsapp(payload.recipient_whatsapp)
    if not number:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="WhatsApp inválido.")
    selected_provider = resolve_platform_provider(payload.provider)
    result = platform_send_text(number, payload.message.strip(), provider=selected_provider, db=db)
    provider_message_id = result.get("provider_message_id")
    return PlatformWhatsappSendResultOut(
        provider=selected_provider,
        ok=True,
        provider_message_id=provider_message_id,
        recipient_whatsapp=number,
        message=payload.message.strip(),
        sent_at=datetime.now(timezone.utc),
    )


@router.post(
    "/demo-appointments/{appointment_id}/send",
    response_model=PlatformDemoWhatsappSendOut,
)
def send_demo_appointment_whatsapp(
    appointment_id: int,
    payload: PlatformDemoWhatsappSendIn,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_platform_operator)],
) -> PlatformDemoWhatsappSendOut:
    appointment = db.get(DemoAppointment, appointment_id)
    if appointment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demonstração não encontrada.")

    if payload.template == "confirmation":
        message, number, msg_id = send_demo_whatsapp_confirmation(db, appointment)
    elif payload.template and payload.template.startswith("status_"):
        status_key = payload.template.removeprefix("status_")
        try:
            message, number, msg_id = send_demo_whatsapp_status(db, appointment, status_key)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    elif payload.message and payload.message.strip():
        message, number, msg_id = send_demo_whatsapp_text(db, appointment, payload.message.strip())
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe `message` ou `template`.",
        )

    if not number:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Demonstração sem telefone/WhatsApp cadastrado.",
        )

    return PlatformDemoWhatsappSendOut(
        ok=True,
        recipient_whatsapp=number,
        message=message,
        provider_message_id=msg_id,
    )
