"""Testes leves para datas de manutenção preventiva."""

from datetime import date, datetime, timezone

from app.preventive_maintenance import (
    add_calendar_months,
    months_between_approx,
    next_due_date,
    tenant_local_date,
    tenant_reminder_local_to_utc,
)


def test_add_calendar_months_simple():
    assert add_calendar_months(date(2025, 1, 15), 6) == date(2025, 7, 15)
    assert add_calendar_months(date(2025, 8, 31), 6) == date(2026, 2, 28)


def test_next_due_none_when_no_period():
    assert next_due_date(date(2025, 1, 1), None) is None


def test_months_between_approx():
    assert months_between_approx(date(2025, 1, 10), date(2025, 7, 10)) >= 6


def test_tenant_local_date_sao_paulo():
    utc = datetime(2026, 5, 9, 2, 0, tzinfo=timezone.utc)
    assert tenant_local_date(utc, "America/Sao_Paulo") == date(2026, 5, 8)


def test_tenant_reminder_local_to_utc_sao_paulo():
    utc = tenant_reminder_local_to_utc("America/Sao_Paulo", date(2026, 5, 8), "09:00")
    assert utc.tzinfo == timezone.utc
    assert utc == datetime(2026, 5, 8, 12, 0, tzinfo=timezone.utc)
