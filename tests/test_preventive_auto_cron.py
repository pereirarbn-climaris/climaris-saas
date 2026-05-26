"""Testes do cron automático de preventiva (agrupado por cliente + mês)."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.preventive_maintenance import (
    _collect_auto_reminder_groups_for_tenant,
    _preventive_item_due_date,
)


def test_preventive_item_due_date_from_date():
    assert _preventive_item_due_date({"data_proximo_vencimento": date(2026, 8, 17)}) == date(2026, 8, 17)


@patch("app.preventive_maintenance.list_preventive_items")
def test_collect_auto_reminder_groups_due_today(mock_list_items: MagicMock):
    tenant = SimpleNamespace(id=1, timezone="America/Sao_Paulo")
    local_today = date(2026, 8, 17)
    mock_list_items.return_value = [
        {
            "client_id": 10,
            "client_name": "Grupo ADN",
            "data_proximo_vencimento": date(2026, 8, 17),
            "dias_ate_vencimento": 0,
            "whatsapp_valido": True,
            "equipment_identificacao": "Sala 01",
        },
        {
            "client_id": 10,
            "client_name": "Grupo ADN",
            "data_proximo_vencimento": date(2026, 8, 17),
            "dias_ate_vencimento": 0,
            "whatsapp_valido": True,
            "equipment_identificacao": "Sala 02",
        },
        {
            "client_id": 11,
            "client_name": "Outro",
            "data_proximo_vencimento": date(2026, 9, 1),
            "dias_ate_vencimento": 15,
            "whatsapp_valido": True,
            "equipment_identificacao": "Hall",
        },
    ]
    db = MagicMock()
    due_groups, advance_groups = _collect_auto_reminder_groups_for_tenant(
        db,
        tenant=tenant,
        local_today=local_today,
        advance_days=7,
    )
    assert len(due_groups) == 1
    assert due_groups[0]["client_id"] == 10
    assert len(due_groups[0]["items"]) == 2
    assert advance_groups == []


@patch("app.preventive_maintenance.list_preventive_items")
def test_collect_auto_reminder_groups_advance(mock_list_items: MagicMock):
    tenant = SimpleNamespace(id=1, timezone="America/Sao_Paulo")
    local_today = date(2026, 8, 10)
    advance_days = 7
    mock_list_items.return_value = [
        {
            "client_id": 10,
            "client_name": "Grupo ADN",
            "data_proximo_vencimento": date(2026, 8, 17),
            "dias_ate_vencimento": 7,
            "whatsapp_valido": True,
            "equipment_identificacao": "Sala 01",
        },
        {
            "client_id": 10,
            "client_name": "Grupo ADN",
            "data_proximo_vencimento": date(2026, 8, 20),
            "dias_ate_vencimento": 10,
            "whatsapp_valido": True,
            "equipment_identificacao": "Sala 02",
        },
    ]
    db = MagicMock()
    due_groups, advance_groups = _collect_auto_reminder_groups_for_tenant(
        db,
        tenant=tenant,
        local_today=local_today,
        advance_days=advance_days,
    )
    assert due_groups == []
    assert len(advance_groups) == 1
    assert len(advance_groups[0]["items"]) == 1
    assert advance_groups[0]["items"][0]["equipment_identificacao"] == "Sala 01"
