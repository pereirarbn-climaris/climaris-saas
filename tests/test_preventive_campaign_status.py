"""Status de campanha preventiva por mês de vencimento (não por último envio do cliente)."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.preventive_maintenance import (
    _parse_due_month_key_from_item_payload,
    _preventive_item_due_month_key,
    enrich_preventive_items_campaign_status,
)
from models import WhatsappMessageStatus


def test_parse_due_month_key_from_iso_string():
    key = _parse_due_month_key_from_item_payload(
        {"client_id": 5, "data_proximo_vencimento": "2026-09-15"}
    )
    assert key == (5, None, 2026, 9)


def test_enrich_does_not_mark_other_due_month_as_sent(monkeypatch):
    june_item = {
        "client_id": 42,
        "client_name": "Rosângela",
        "equipment_id": 1,
        "service_id": 2,
        "historico_servico_id": 0,
        "data_proximo_vencimento": date(2026, 6, 10),
        "dias_ate_vencimento": -12,
    }
    september_item = {
        "client_id": 42,
        "client_name": "Rosângela",
        "equipment_id": 1,
        "service_id": 2,
        "historico_servico_id": 0,
        "data_proximo_vencimento": date(2026, 9, 20),
        "dias_ate_vencimento": 90,
    }

    sent_job = SimpleNamespace(
        id=99,
        status=WhatsappMessageStatus.SENT,
        error_message=None,
        failed_at=None,
        sent_at=None,
        created_at=None,
    )

    def fake_sent_context(db, *, tenant_id, client_ids, lookback_days=400):
        return {(42, None, 2026, 6)}, {(42, None, 2026, 6): sent_job}

    monkeypatch.setattr(
        "app.preventive_maintenance._preventive_sent_context_by_due_month",
        fake_sent_context,
    )
    monkeypatch.setattr(
        "app.preventive_maintenance._latest_preventive_whatsapp_jobs_by_historico",
        lambda *a, **k: {},
    )
    monkeypatch.setattr(
        "app.preventive_maintenance._pending_preventive_order_ids_by_equipment_service",
        lambda *a, **k: {},
    )
    monkeypatch.setattr("app.preventive_maintenance.load_tenant_holiday_dates", lambda *a, **k: set())

    db = MagicMock()
    db.get.return_value = None
    items = [june_item.copy(), september_item.copy()]
    enrich_preventive_items_campaign_status(
        db,
        tenant_id=1,
        items=items,
        advance_days=7,
        tenant_tz="America/Sao_Paulo",
    )

    assert items[0]["status_mensagem_enviada"] is True
    assert items[0]["campaign_status"] == "mensagem_enviada"
    assert items[1]["status_mensagem_enviada"] is False
    assert items[1]["campaign_status"] is None
    assert _preventive_item_due_month_key(september_item) == (42, None, 2026, 9)
