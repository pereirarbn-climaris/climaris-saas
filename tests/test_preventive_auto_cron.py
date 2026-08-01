"""Testes do cron automático de preventiva (agrupado por cliente + mês)."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.preventive_maintenance import (
    _collect_auto_reminder_groups_for_tenant,
    _collect_month_start_auto_groups_for_tenant,
    _preventive_item_due_date,
)
from app.tenant_business_calendar import first_business_day_of_month


def test_preventive_item_due_date_from_date():
    assert _preventive_item_due_date({"data_proximo_vencimento": date(2026, 8, 17)}) == date(2026, 8, 17)


def test_first_business_day_of_month_skips_weekend():
    tenant = SimpleNamespace(
        business_days="0,1,2,3,4",
        weekday_work_hours=None,
        workday_start=None,
        workday_end=None,
    )
    # 2026-08-01 is Saturday → Monday 2026-08-03
    assert first_business_day_of_month(tenant, 2026, 8, set()) == date(2026, 8, 3)


@patch("app.preventive_maintenance.list_preventive_items")
@patch("app.preventive_maintenance.effective_preventive_reminder_day")
def test_collect_auto_reminder_groups_due_today(
    mock_effective: MagicMock,
    mock_list_items: MagicMock,
):
    tenant = SimpleNamespace(id=1, timezone="America/Sao_Paulo")
    local_today = date(2026, 8, 17)
    mock_effective.side_effect = lambda _t, due, _adv, _h: due
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
    groups = _collect_auto_reminder_groups_for_tenant(
        db,
        tenant=tenant,
        local_today=local_today,
        advance_days=0,
        holidays=set(),
    )
    assert len(groups) == 1
    assert groups[0]["client_id"] == 10
    assert len(groups[0]["items"]) == 2


@patch("app.preventive_maintenance.list_preventive_items")
@patch("app.preventive_maintenance.effective_preventive_reminder_day")
def test_collect_auto_reminder_groups_advance(
    mock_effective: MagicMock,
    mock_list_items: MagicMock,
):
    tenant = SimpleNamespace(id=1, timezone="America/Sao_Paulo")
    local_today = date(2026, 8, 10)
    advance_days = 7

    def _eff(_t, due, adv, _h):
        return due.replace(day=due.day - adv) if due.day > adv else due

    mock_effective.side_effect = lambda t, due, adv, h: date(2026, 8, 10) if due == date(2026, 8, 17) else date(2026, 8, 13)
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
    groups = _collect_auto_reminder_groups_for_tenant(
        db,
        tenant=tenant,
        local_today=local_today,
        advance_days=advance_days,
        holidays=set(),
    )
    assert len(groups) == 1
    assert len(groups[0]["items"]) == 1
    assert groups[0]["items"][0]["equipment_identificacao"] == "Sala 01"


@patch("app.preventive_maintenance.list_preventive_items")
@patch("app.preventive_maintenance.first_business_day_of_month")
def test_collect_month_start_groups_only_on_first_bd(
    mock_first_bd: MagicMock,
    mock_list_items: MagicMock,
):
    tenant = SimpleNamespace(id=1, timezone="America/Sao_Paulo")
    mock_first_bd.return_value = date(2026, 8, 3)
    mock_list_items.return_value = [
        {
            "client_id": 10,
            "client_name": "Cliente A",
            "client_site_id": 1,
            "data_proximo_vencimento": date(2026, 8, 15),
            "whatsapp_valido": True,
            "equipment_identificacao": "Eq 1",
        },
        {
            "client_id": 10,
            "client_name": "Cliente A",
            "client_site_id": 2,
            "data_proximo_vencimento": date(2026, 8, 20),
            "whatsapp_valido": True,
            "equipment_identificacao": "Eq 2",
        },
        {
            "client_id": 11,
            "client_name": "Outro mês",
            "data_proximo_vencimento": date(2026, 9, 5),
            "whatsapp_valido": True,
            "equipment_identificacao": "Eq 3",
        },
    ]
    db = MagicMock()

    empty = _collect_month_start_auto_groups_for_tenant(
        db,
        tenant=tenant,
        local_today=date(2026, 8, 4),
        holidays=set(),
    )
    assert empty == []

    groups = _collect_month_start_auto_groups_for_tenant(
        db,
        tenant=tenant,
        local_today=date(2026, 8, 3),
        holidays=set(),
    )
    assert len(groups) == 2
    assert {g["client_site_id"] for g in groups} == {1, 2}
