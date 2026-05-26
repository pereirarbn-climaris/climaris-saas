"""Testes do detector de intenção e mensagens do fluxo Confirmar/Reagendar via WhatsApp."""

import re
from datetime import date

import pytest


def _whatsapp_module():
    return pytest.importorskip("app.whatsapp")


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("CONFIRMAR", True),
        ("confirmar", True),
        ("SIM", True),
        ("sim por favor", True),
        ("OK", True),
        ("OK!", True),
        ("CONFIRMO", True),
        ("REMARCAR", False),
        ("2", False),
    ],
)
def test_matches_confirm_intent(text: str, expected: bool):
    wa = _whatsapp_module()
    normalized = wa._normalize_user_text(text)
    assert wa._matches_confirm_intent(normalized, "CONFIRMAR") is expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("REMARCAR", True),
        ("REMAR", True),
        ("remar", True),
        ("REAGENDAR", True),
        ("REMANDAR", True),
        ("remarcar visita", True),
        ("CONFIRMAR", False),
    ],
)
def test_matches_reschedule_intent(text: str, expected: bool):
    wa = _whatsapp_module()
    normalized = wa._normalize_user_text(text)
    assert wa._matches_reschedule_intent(normalized, "REMARCAR") is expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("CANCELAR", True),
        ("cancelar agendamento", True),
        ("CANCEL", False),
        ("CONFIRMAR", False),
    ],
)
def test_matches_cancel_intent(text: str, expected: bool):
    wa = _whatsapp_module()
    normalized = wa._normalize_user_text(text)
    assert wa._matches_cancel_intent(normalized) is expected


def test_reschedule_options_message_format():
    wa = _whatsapp_module()
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo

    tz = ZoneInfo("America/Sao_Paulo")
    starts = datetime(2026, 5, 21, 14, 30, tzinfo=timezone.utc)
    option = type(
        "Opt",
        (),
        {"starts_at": starts},
    )()
    schedule = type("Sched", (), {})()
    body = wa._build_reschedule_options_message(schedule=schedule, options=[option], tenant_tz=tz)
    assert "1- " in body
    assert "5- Outra data" in body
    assert "25/05" in body


def test_parse_client_preferred_date():
    wa = _whatsapp_module()
    from zoneinfo import ZoneInfo

    tz = ZoneInfo("America/Sao_Paulo")
    assert wa._parse_client_preferred_date("25/05", tz) == date(2026, 5, 25)
    assert wa._parse_client_preferred_date("25/05/2026", tz) == date(2026, 5, 25)
    assert wa._parse_client_preferred_date("CONFIRMAR", tz) is None


def test_extract_schedule_action_option_five():
    wa = _whatsapp_module()
    normalized = wa._normalize_user_text("5")
    assert normalized == "5"
    assert re.fullmatch(r"5", normalized)


def test_extract_schedule_action_date_not_confused_with_option():
    wa = _whatsapp_module()
    normalized = wa._normalize_user_text("3/05")
    assert not re.fullmatch(r"[1-4]", normalized)
    preferred = wa._parse_client_preferred_date("3/05", __import__("zoneinfo").ZoneInfo("America/Sao_Paulo"))
    assert preferred is not None
    assert preferred.day == 3
    assert preferred.month == 5


def test_reply_messages_defined():
    wa = _whatsapp_module()
    assert "confirmado com sucesso" in wa.APPOINTMENT_CONFIRMED_REPLY.lower()
    assert "cancelado conforme solicitado" in wa.APPOINTMENT_CANCELLED_REPLY.lower()
    assert "{data_hora}" in wa.DEFAULT_APPOINTMENT_RESCHEDULE_REPLY


def test_create_reschedule_options_uses_suggest_booking_slots():
    source = pytest.importorskip("pathlib").Path("app/whatsapp.py").read_text(encoding="utf-8")
    assert "suggest_booking_slots(" in source
    assert "def _clear_schedule_reminder_jobs" in source
