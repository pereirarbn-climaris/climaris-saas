"""Notificações de demonstração agendada — e-mail e WhatsApp (cliente + operação)."""

from __future__ import annotations

import logging
import threading
from datetime import datetime

from sqlalchemy.orm import Session

from app.config import (
    APP_PUBLIC_URL,
    EVOLUTION_API_BASE_URL,
    EVOLUTION_API_KEY,
    EVOLUTION_INSTANCE,
    PLATFORM_OPERATOR_EMAIL,
    PLATFORM_OPERATOR_WHATSAPP,
)
from app.demo_scheduling import DEMO_TZ
from app.emailer import send_email, smtp_is_configured
from models import DemoAppointment, PlatformWebsiteSettings

logger = logging.getLogger("erp.demo_appointments")

_SINGLETON_WEBSITE_SETTINGS_ID = 1


def _format_scheduled_label(scheduled_at: datetime) -> str:
    local = scheduled_at.astimezone(DEMO_TZ)
    return local.strftime("%d/%m/%Y às %H:%M")


def _safe_normalize_whatsapp(value: str | None) -> str | None:
    if not value:
        return None
    digits = "".join(ch for ch in value if ch.isdigit())
    if not digits:
        return None
    if digits.startswith("55") and len(digits) in (12, 13):
        return digits
    if len(digits) in (10, 11):
        return f"55{digits}"
    if len(digits) in (12, 13):
        return digits
    return None


def _resolve_operator_whatsapp(db: Session) -> str | None:
    from_env = _safe_normalize_whatsapp(PLATFORM_OPERATOR_WHATSAPP)
    if from_env:
        return from_env
    row = db.get(PlatformWebsiteSettings, _SINGLETON_WEBSITE_SETTINGS_ID)
    if row and row.contact_phone:
        return _safe_normalize_whatsapp(row.contact_phone)
    return None


def _agenda_url() -> str:
    base = APP_PUBLIC_URL.rstrip("/")
    return f"{base}/operacao/agenda-demonstracoes"


def _build_client_email(*, name: str, scheduled_label: str, duration_minutes: int) -> tuple[str, str, str]:
    subject = f"Demonstração Climaris confirmada — {scheduled_label}"
    text_body = (
        f"Olá, {name}!\n\n"
        f"Sua demonstração do Climaris está confirmada para {scheduled_label} (horário de Brasília).\n"
        f"Duração prevista: {duration_minutes} minutos.\n\n"
        "Nossa equipe comercial entrará em contato para confirmar os detalhes da apresentação.\n\n"
        "Equipe Climaris\n"
        "https://climaris.com.br"
    )
    html_body = (
        "<!doctype html><html lang=\"pt-BR\"><body style=\"margin:0;padding:0;background:#f3f6fb;"
        "font-family:Arial,Helvetica,sans-serif;color:#0f172a;\">"
        "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" "
        "style=\"background:#f3f6fb;padding:24px 12px;\"><tr><td align=\"center\">"
        "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" "
        "style=\"max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;\">"
        "<tr><td style=\"padding:18px 24px;background:linear-gradient(135deg,#0284c7,#0ea5e9);color:#ffffff;\">"
        "<div style=\"font-size:20px;font-weight:700;\">Climaris</div>"
        "<div style=\"font-size:13px;opacity:.95;margin-top:2px;\">Demonstração agendada</div>"
        "</td></tr><tr><td style=\"padding:24px;\">"
        f"<p style=\"margin:0 0 14px;font-size:16px;\">Olá, {name}!</p>"
        f"<p style=\"margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;\">"
        f"Sua demonstração está confirmada para <strong>{scheduled_label}</strong> "
        f"(horário de Brasília). Duração prevista: {duration_minutes} minutos."
        "</p>"
        "<p style=\"margin:0;font-size:14px;line-height:1.6;color:#64748b;\">"
        "Nossa equipe comercial entrará em contato para confirmar os detalhes da apresentação."
        "</p></td></tr></table></td></tr></table></body></html>"
    )
    return subject, text_body, html_body


def _build_operator_email(*, appointment: DemoAppointment, scheduled_label: str) -> tuple[str, str, str]:
    subject = f"[Climaris] Nova demonstração — {appointment.name} ({scheduled_label})"
    lines = [
        "Nova demonstração agendada pelo site institucional.",
        "",
        f"Data/hora: {scheduled_label} (Brasília)",
        f"Cliente: {appointment.name}",
        f"E-mail: {appointment.email}",
    ]
    if appointment.phone:
        lines.append(f"WhatsApp: {appointment.phone}")
    if appointment.company:
        lines.append(f"Empresa: {appointment.company}")
    if appointment.job_title:
        lines.append(f"Cargo: {appointment.job_title}")
    if appointment.technicians_count:
        lines.append(f"Técnicos na equipe: {appointment.technicians_count}")
    if appointment.selected_plan:
        lines.append(f"Plano de interesse: {appointment.selected_plan}")
    lines.extend(["", f"Ver na agenda: {_agenda_url()}"])
    text_body = "\n".join(lines)
    html_body = (
        "<!doctype html><html lang=\"pt-BR\"><body style=\"font-family:Arial,sans-serif;color:#0f172a;\">"
        "<h2 style=\"color:#0284c7;\">Nova demonstração agendada</h2>"
        f"<p><strong>{appointment.name}</strong> agendou uma demonstração para "
        f"<strong>{scheduled_label}</strong> (horário de Brasília).</p>"
        "<ul>"
        f"<li>E-mail: {appointment.email}</li>"
        + (f"<li>WhatsApp: {appointment.phone}</li>" if appointment.phone else "")
        + (f"<li>Empresa: {appointment.company}</li>" if appointment.company else "")
        + (f"<li>Cargo: {appointment.job_title}</li>" if appointment.job_title else "")
        + (
            f"<li>Técnicos na equipe: {appointment.technicians_count}</li>"
            if appointment.technicians_count
            else ""
        )
        + (f"<li>Plano: {appointment.selected_plan}</li>" if appointment.selected_plan else "")
        + "</ul>"
        f"<p><a href=\"{_agenda_url()}\" style=\"color:#0284c7;\">Abrir agenda de demonstrações</a></p>"
        "</body></html>"
    )
    return subject, text_body, html_body


def _build_client_whatsapp(*, name: str, scheduled_label: str, duration_minutes: int) -> str:
    first_name = name.strip().split()[0] if name.strip() else "Olá"
    return (
        f"Olá, {first_name}! 👋\n\n"
        f"Sua demonstração do *Climaris* está confirmada para *{scheduled_label}* "
        f"(horário de Brasília).\n"
        f"Duração prevista: {duration_minutes} min.\n\n"
        "Nossa equipe entrará em contato para confirmar os detalhes. "
        "Até lá!"
    )


def build_demo_client_whatsapp_preview() -> str:
    return _build_client_whatsapp(
        name="Maria",
        scheduled_label="16/06/2026 às 09:00",
        duration_minutes=45,
    )


def build_demo_operator_whatsapp_preview() -> str:
    return _build_operator_whatsapp(
        appointment=DemoAppointment(
            id=0,
            name="Maria Silva",
            email="maria@empresa.com.br",
            phone="16999998888",
            company="Empresa Exemplo",
            technicians_count="5",
            scheduled_at=datetime.now(DEMO_TZ),
            duration_minutes=45,
        ),
        scheduled_label="16/06/2026 às 09:00",
    )


def _build_operator_whatsapp(*, appointment: DemoAppointment, scheduled_label: str) -> str:
    parts = [
        "📅 *Nova demonstração agendada*",
        "",
        f"*{appointment.name}* — {scheduled_label}",
        f"E-mail: {appointment.email}",
    ]
    if appointment.phone:
        parts.append(f"WhatsApp: {appointment.phone}")
    if appointment.company:
        parts.append(f"Empresa: {appointment.company}")
    if appointment.technicians_count:
        parts.append(f"Equipe: {appointment.technicians_count} técnicos")
    parts.append(f"\nAgenda: {_agenda_url()}")
    return "\n".join(parts)


def _send_whatsapp(number: str, message: str) -> str | None:
    if not (EVOLUTION_API_BASE_URL and EVOLUTION_API_KEY):
        logger.info("WhatsApp não configurado — notificação de demonstração ignorada para %s", number)
        return None
    from app.platform_whatsapp import platform_send_text

    result = platform_send_text(number, message)
    msg_id = result.get("provider_message_id")
    return str(msg_id) if msg_id else None


def _build_status_whatsapp(*, appointment: DemoAppointment, status_key: str, scheduled_label: str) -> str | None:
    first_name = appointment.name.strip().split()[0] if appointment.name.strip() else "Olá"
    if status_key == "confirmed":
        return (
            f"Olá, {first_name}! ✅\n\n"
            f"Sua demonstração do *Climaris* em *{scheduled_label}* (horário de Brasília) "
            f"foi *confirmada* pela nossa equipe.\n\n"
            "Aguardamos você! Em caso de imprevisto, responda esta mensagem."
        )
    if status_key == "cancelled":
        return (
            f"Olá, {first_name}.\n\n"
            f"Sua demonstração do *Climaris* prevista para *{scheduled_label}* foi *cancelada*.\n\n"
            "Se quiser reagendar, acesse climaris.com.br ou responda esta mensagem."
        )
    if status_key == "completed":
        return (
            f"Olá, {first_name}! 🙏\n\n"
            "Obrigado por participar da demonstração do *Climaris*.\n\n"
            "Ficamos à disposição para tirar dúvidas e apoiar a implantação da sua equipe."
        )
    if status_key == "no_show":
        return (
            f"Olá, {first_name}.\n\n"
            f"Notamos que você não pôde comparecer à demonstração de *{scheduled_label}*.\n\n"
            "Podemos reagendar em outro horário — responda esta mensagem ou acesse climaris.com.br."
        )
    return None


def send_demo_whatsapp_confirmation(
    db: Session, appointment: DemoAppointment
) -> tuple[str, str | None, str | None]:
    scheduled_label = _format_scheduled_label(appointment.scheduled_at)
    message = _build_client_whatsapp(
        name=appointment.name,
        scheduled_label=scheduled_label,
        duration_minutes=appointment.duration_minutes,
    )
    number = _safe_normalize_whatsapp(appointment.phone)
    if not number:
        return message, None, None
    msg_id = _send_whatsapp(number, message)
    return message, number, msg_id


def send_demo_whatsapp_text(
    db: Session, appointment: DemoAppointment, message: str
) -> tuple[str, str | None, str | None]:
    number = _safe_normalize_whatsapp(appointment.phone)
    if not number:
        return message, None, None
    msg_id = _send_whatsapp(number, message)
    return message, number, msg_id


def send_demo_whatsapp_status(
    db: Session, appointment: DemoAppointment, status_key: str
) -> tuple[str, str | None, str | None]:
    scheduled_label = _format_scheduled_label(appointment.scheduled_at)
    message = _build_status_whatsapp(
        appointment=appointment,
        status_key=status_key,
        scheduled_label=scheduled_label,
    )
    if not message:
        raise ValueError(f"Status WhatsApp inválido: {status_key}")
    number = _safe_normalize_whatsapp(appointment.phone)
    if not number:
        return message, None, None
    msg_id = _send_whatsapp(number, message)
    return message, number, msg_id


def notify_demo_status_change_whatsapp(db: Session, appointment: DemoAppointment, new_status: str) -> None:
    if new_status not in ("confirmed", "cancelled", "completed", "no_show"):
        return
    number = _safe_normalize_whatsapp(appointment.phone)
    if not number:
        return
    try:
        send_demo_whatsapp_status(db, appointment, new_status)
    except Exception:
        logger.exception(
            "Falha ao enviar WhatsApp de status '%s' da demonstração id=%s",
            new_status,
            appointment.id,
        )


def _notify_demo_appointment(db: Session, appointment: DemoAppointment) -> None:
    scheduled_label = _format_scheduled_label(appointment.scheduled_at)

    if smtp_is_configured(db):
        try:
            subject, text_body, html_body = _build_client_email(
                name=appointment.name,
                scheduled_label=scheduled_label,
                duration_minutes=appointment.duration_minutes,
            )
            send_email(
                to_email=appointment.email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
                db=db,
            )
        except Exception:
            logger.exception(
                "Falha ao enviar e-mail de confirmação da demonstração id=%s para %s",
                appointment.id,
                appointment.email,
            )

        try:
            subject, text_body, html_body = _build_operator_email(
                appointment=appointment,
                scheduled_label=scheduled_label,
            )
            send_email(
                to_email=PLATFORM_OPERATOR_EMAIL,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
                db=db,
            )
        except Exception:
            logger.exception(
                "Falha ao enviar e-mail de alerta da demonstração id=%s para operação",
                appointment.id,
            )
    else:
        logger.info("SMTP não configurado — e-mails da demonstração id=%s não enviados", appointment.id)

    client_whatsapp = _safe_normalize_whatsapp(appointment.phone)
    if client_whatsapp:
        try:
            _send_whatsapp(
                client_whatsapp,
                _build_client_whatsapp(
                    name=appointment.name,
                    scheduled_label=scheduled_label,
                    duration_minutes=appointment.duration_minutes,
                ),
            )
        except Exception:
            logger.exception(
                "Falha ao enviar WhatsApp de confirmação da demonstração id=%s",
                appointment.id,
            )

    operator_whatsapp = _resolve_operator_whatsapp(db)
    if operator_whatsapp:
        try:
            _send_whatsapp(
                operator_whatsapp,
                _build_operator_whatsapp(appointment=appointment, scheduled_label=scheduled_label),
            )
        except Exception:
            logger.exception(
                "Falha ao enviar WhatsApp de alerta da demonstração id=%s para operação",
                appointment.id,
            )


def run_demo_appointment_notifications_background(appointment_id: int) -> None:
    """Envia confirmações fora do ciclo ASGI (não bloqueia POST do site)."""
    from app.database import SessionLocal

    logger.info("demo notifications background iniciado appointment_id=%s", appointment_id)
    try:
        with SessionLocal() as db:
            appointment = db.get(DemoAppointment, appointment_id)
            if appointment is None:
                logger.warning("demo notifications: appointment_id=%s não encontrado", appointment_id)
                return
            _notify_demo_appointment(db, appointment)
        logger.info("demo notifications background concluído appointment_id=%s", appointment_id)
    except Exception:
        logger.exception("demo notifications background falhou appointment_id=%s", appointment_id)


def schedule_demo_appointment_notifications(appointment_id: int) -> None:
    threading.Thread(
        target=run_demo_appointment_notifications_background,
        args=(appointment_id,),
        name=f"demo-notify-{appointment_id}",
        daemon=True,
    ).start()
