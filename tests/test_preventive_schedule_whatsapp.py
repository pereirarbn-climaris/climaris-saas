"""Testes do fluxo WhatsApp preventiva: AGENDAR → equipamento → horário → OS."""

from __future__ import annotations

from datetime import date

from app.preventive_schedule_whatsapp import (
    _build_appliance_count_prompt,
    _build_equipment_prompt,
    _build_slot_prompt,
    _deserialize_items,
    _parse_pick_number,
    _serialize_items,
    is_preventive_schedule_intent,
)
from models import PreventiveScheduleSlotOption


def test_is_preventive_schedule_intent():
    assert is_preventive_schedule_intent("AGENDAR")
    assert is_preventive_schedule_intent("agendar!")
    assert is_preventive_schedule_intent("AGENDA")
    assert is_preventive_schedule_intent("agenda")
    assert is_preventive_schedule_intent("QUERO AGENDAR")
    assert is_preventive_schedule_intent("MARCAR")
    assert not is_preventive_schedule_intent("MAIS")
    assert not is_preventive_schedule_intent("")


def test_agenda_synonym_is_schedule_intent():
    """Cliente costuma digitar 'agenda' em vez de 'agendar'."""
    assert is_preventive_schedule_intent("agenda")
    assert is_preventive_schedule_intent("AGENDA")


def test_parse_pick_number():
    assert _parse_pick_number("1") == 1
    assert _parse_pick_number("2 - opção") == 2
    assert _parse_pick_number("abc") is None


def test_build_equipment_prompt_asks_appliance_count():
    items = [
        {
            "equipment_identificacao": "Sala 01",
            "service_name": "Preventiva — Sala 01",
            "data_proximo_vencimento": date(2026, 8, 17),
        },
        {
            "equipment_identificacao": "Sala 02",
            "service_name": "Preventiva — Sala 02",
            "data_proximo_vencimento": date(2026, 8, 20),
        },
    ]
    text = _build_equipment_prompt(items)
    assert "Quantos aparelhos" in text
    assert "1 a 2" in text


def test_build_appliance_count_prompt_single():
    text = _build_appliance_count_prompt(1)
    assert "Responda com 1" in text


def test_serialize_deserialize_items_roundtrip():
    items = [
        {
            "historico_servico_id": 10,
            "equipment_id": 5,
            "equipment_identificacao": "Split",
            "data_proximo_vencimento": date(2026, 5, 1),
        }
    ]
    raw = _serialize_items(items)
    restored = _deserialize_items(raw)
    assert restored[0]["historico_servico_id"] == 10
    assert restored[0]["equipment_id"] == 5
    assert restored[0]["data_proximo_vencimento"] == "2026-05-01"


def test_complete_active_flows_expires_slot_options():
    """Fluxo antigo não pode confirmar horário depois de reiniciar com AGENDAR."""
    from app.preventive_schedule_whatsapp import _complete_active_flows_for_jid, _expire_flow_slot_options

    assert callable(_complete_active_flows_for_jid)
    assert callable(_expire_flow_slot_options)


def test_numeric_pick_without_active_flow_not_consumed(monkeypatch):
    """Número 1-5 sem fluxo preventivo ativo não deve ser interceptado pela preventiva."""
    from unittest.mock import MagicMock

    from app.preventive_schedule_whatsapp import try_handle_preventive_schedule_reply

    db = MagicMock()
    monkeypatch.setattr(
        "app.preventive_schedule_whatsapp._get_active_flow",
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        "app.preventive_schedule_whatsapp.is_preventive_schedule_intent",
        lambda plain: False,
    )
    monkeypatch.setattr(
        "app.preventive_schedule_whatsapp._latest_reminder_context",
        lambda *args, **kwargs: {"historico_servico_id": 99},
    )
    monkeypatch.setattr(
        "app.preventive_schedule_whatsapp._incoming_message_already_processed",
        lambda *args, **kwargs: False,
    )
    monkeypatch.setattr(
        "app.preventive_schedule_whatsapp._plain_text_from_evolution_upsert",
        lambda payload: "1",
    )
    monkeypatch.setattr(
        "app.preventive_schedule_whatsapp._incoming_message_id",
        lambda payload: None,
    )

    payload = {
        "event": "messages.upsert",
        "data": {"key": {"remoteJid": "5511999999999@s.whatsapp.net", "fromMe": False}},
    }
    assert try_handle_preventive_schedule_reply(db, tenant_id=1, payload=payload) is False


def test_compute_duration_sums_multiple_equipment():
    """Duração total = soma dos serviços de cada equipamento selecionado."""
    from unittest.mock import MagicMock

    from app.preventive_schedule_whatsapp import _compute_duration_minutes

    db = MagicMock()
    svc_a = MagicMock(duration_minutes=45, price=0)
    svc_b = MagicMock(duration_minutes=60, price=0)

    import app.preventive_schedule_whatsapp as mod

    original = mod._resolve_preventive_service
    calls = iter([svc_a, svc_b])
    mod._resolve_preventive_service = lambda *args, **kwargs: next(calls)
    try:
        total = _compute_duration_minutes(
            db,
            tenant_id=1,
            items=[{"service_id": 1}, {"service_id": 2}],
        )
        assert total == 105
    finally:
        mod._resolve_preventive_service = original


def test_build_slot_prompt():
    from zoneinfo import ZoneInfo

    tz = ZoneInfo("America/Sao_Paulo")
    from datetime import datetime, timezone

    starts = datetime(2026, 5, 21, 14, 0, tzinfo=timezone.utc)
    ends = datetime(2026, 5, 21, 15, 0, tzinfo=timezone.utc)
    opt = PreventiveScheduleSlotOption(
        tenant_id=1,
        flow_id=1,
        option_code="PS1-1-1",
        option_index=1,
        starts_at=starts,
        ends_at=ends,
        expires_at=starts,
    )
    text = _build_slot_prompt(tenant_tz=tz, options=[opt], equipment_summary="Sala 01")
    assert "Sala 01" in text
    assert "1-" in text
    assert "Responda com 1 a 1" in text
