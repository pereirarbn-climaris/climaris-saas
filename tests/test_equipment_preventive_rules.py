"""Testes de regras preventivas por equipamento e fechamento de OS."""

from __future__ import annotations

from datetime import date, datetime, timezone
from unittest.mock import MagicMock

import pytest

from app.equipment_preventive_rules import (
    collect_order_equipment_ids,
    compute_next_due_datetime,
    equipment_due_row_to_preventive_item,
    group_preventive_items_by_client,
    preventive_order_completion_at,
    refresh_rule_next_due_date,
)
from app.service_order_closure import execute_post_closure_automations
from models import EquipmentPreventiveRule, PreventiveIntervalType


def test_compute_next_due_datetime_days():
    base = datetime(2026, 5, 18, 14, 30, tzinfo=timezone.utc)
    result = compute_next_due_datetime(base, interval_value=15, interval_type=PreventiveIntervalType.DAYS)
    assert result == datetime(2026, 6, 2, 14, 30, tzinfo=timezone.utc)


def test_preventive_order_completion_at_prefers_stock_consumed():
    order = MagicMock(
        stock_consumed_at=datetime(2026, 5, 14, 8, 0, tzinfo=timezone.utc),
        schedule=None,
    )
    assert preventive_order_completion_at(order) == datetime(2026, 5, 14, 8, 0, tzinfo=timezone.utc)


def test_compute_next_due_datetime_months():
    base = datetime(2026, 1, 31, 10, 0, tzinfo=timezone.utc)
    result = compute_next_due_datetime(base, interval_value=3, interval_type=PreventiveIntervalType.MONTHS)
    assert result.date() == date(2026, 4, 30)
    assert result.hour == 10


def test_collect_order_equipment_ids():
    item_a = MagicMock(equipment_id=10)
    item_b = MagicMock(equipment_id=20)
    item_c = MagicMock(equipment_id=10)
    item_none = MagicMock(equipment_id=None)
    order = MagicMock(service_items=[item_a, item_b, item_c, item_none])
    assert collect_order_equipment_ids(order) == {10, 20}


def test_equipment_due_row_to_preventive_item():
    row = {
        "rule_id": 1,
        "equipment_id": 5,
        "equipment_identificacao": "Split Sala",
        "client_id": 3,
        "client_name": "Cliente X",
        "interval_value": 6,
        "interval_type": "months",
        "last_performed_date": date(2026, 1, 1),
        "next_due_date": date(2026, 7, 1),
        "dias_ate_vencimento": 10,
        "whatsapp_valido": True,
        "whatsapp_destino": "5511999999999",
    }
    item = equipment_due_row_to_preventive_item(row)
    assert item["rule_id"] == 1
    assert item["equipment_id"] == 5
    assert item["historico_servico_id"] == 0
    assert "Split Sala" in item["service_name"]


def test_group_preventive_items_by_client():
    items = [
        equipment_due_row_to_preventive_item(
            {
                "rule_id": 1,
                "equipment_id": 1,
                "equipment_identificacao": "A",
                "client_id": 10,
                "client_name": "Zeta",
                "interval_value": 3,
                "interval_type": "months",
                "last_performed_date": date(2026, 1, 1),
                "next_due_date": date(2026, 4, 1),
                "dias_ate_vencimento": -2,
                "whatsapp_valido": True,
                "whatsapp_destino": None,
            }
        ),
        equipment_due_row_to_preventive_item(
            {
                "rule_id": 2,
                "equipment_id": 2,
                "equipment_identificacao": "B",
                "client_id": 10,
                "client_name": "Zeta",
                "interval_value": 6,
                "interval_type": "months",
                "last_performed_date": date(2026, 2, 1),
                "next_due_date": date(2026, 8, 1),
                "dias_ate_vencimento": 5,
                "whatsapp_valido": True,
                "whatsapp_destino": None,
            }
        ),
    ]
    groups = group_preventive_items_by_client(items)
    assert len(groups) == 1
    assert groups[0]["client_id"] == 10
    assert len(groups[0]["equipments"]) == 2


def test_refresh_rule_next_due_date_without_last_performed():
    rule = EquipmentPreventiveRule(
        equipment_id=1,
        interval_value=6,
        interval_type=PreventiveIntervalType.MONTHS,
        is_active=True,
        next_due_date=datetime(2026, 11, 18, 12, 0, tzinfo=timezone.utc),
    )
    refresh_rule_next_due_date(rule)
    assert rule.next_due_date is None


def test_refresh_rule_next_due_date_with_last_performed():
    rule = EquipmentPreventiveRule(
        equipment_id=1,
        interval_value=15,
        interval_type=PreventiveIntervalType.DAYS,
        is_active=True,
        last_performed_date=datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc),
    )
    refresh_rule_next_due_date(rule)
    assert rule.next_due_date == datetime(2026, 5, 16, 10, 0, tzinfo=timezone.utc)


def test_execute_post_closure_automations_without_billing():
    db = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = None
    result = execute_post_closure_automations(
        db,
        service_order_id=99,
        tenant_id=1,
        client_id=3,
    )
    assert result["skipped"] is True
