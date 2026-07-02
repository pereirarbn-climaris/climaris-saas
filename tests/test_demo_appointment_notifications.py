"""Notificações de demonstração — e-mail e WhatsApp."""

from datetime import datetime
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

from app.demo_appointment_notifications import (
    _build_client_whatsapp,
    _build_operator_whatsapp,
    _notify_demo_appointment,
)
from models import DemoAppointment

TZ = ZoneInfo("America/Sao_Paulo")


def _sample_appointment() -> DemoAppointment:
    return DemoAppointment(
        id=42,
        website_lead_id=7,
        name="Maria Silva",
        email="maria@example.com",
        phone="16999998888",
        company="Clima ABC",
        job_title="Sócia",
        technicians_count="6-15",
        selected_plan=None,
        scheduled_at=datetime(2026, 6, 15, 10, 0, tzinfo=TZ),
        duration_minutes=45,
        status="scheduled",
        notes=None,
    )


@patch("app.demo_appointment_notifications._resolve_operator_whatsapp", return_value="5516988887777")
@patch("app.demo_appointment_notifications._send_whatsapp")
@patch("app.demo_appointment_notifications.send_email")
@patch("app.demo_appointment_notifications.smtp_is_configured", return_value=True)
def test_notify_sends_client_and_operator(mock_smtp_ok, mock_send_email, mock_whatsapp, _mock_op_phone):
    db = MagicMock()

    _notify_demo_appointment(db, _sample_appointment())

    assert mock_send_email.call_count == 2
    client_call = mock_send_email.call_args_list[0].kwargs
    operator_call = mock_send_email.call_args_list[1].kwargs
    assert client_call["to_email"] == "maria@example.com"
    assert "Demonstração Climaris confirmada" in client_call["subject"]
    assert operator_call["to_email"] == "contato@climaris.com.br"
    assert "Nova demonstração" in operator_call["subject"]

    assert mock_whatsapp.call_count == 2


@patch("app.demo_appointment_notifications._resolve_operator_whatsapp", return_value=None)
@patch("app.demo_appointment_notifications.smtp_is_configured", return_value=False)
@patch("app.demo_appointment_notifications._send_whatsapp")
def test_notify_skips_email_when_smtp_unconfigured(mock_whatsapp, _mock_smtp, _mock_op_phone):
    db = MagicMock()
    _notify_demo_appointment(db, _sample_appointment())
    mock_whatsapp.assert_called_once()


def test_whatsapp_message_templates():
    appt = _sample_appointment()
    client_msg = _build_client_whatsapp(
        name=appt.name,
        scheduled_label="15/06/2026 às 10:00",
        duration_minutes=45,
    )
    operator_msg = _build_operator_whatsapp(appt=appt, scheduled_label="15/06/2026 às 10:00")
    assert "Maria" in client_msg
    assert "Climaris" in client_msg
    assert "Nova demonstração" in operator_msg
    assert "Clima ABC" in operator_msg
