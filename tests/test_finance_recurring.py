"""Testes de transações financeiras recorrentes."""

from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from app.finance_recurring_service import (
    _should_run_today,
    iter_recurring_due_dates,
    validate_recurring_spec,
)
from app.schemas import FinanceRecurringSpec
from models import FinanceRecurringTransaction


def test_validate_recurring_rejects_past_first_due():
    spec = FinanceRecurringSpec(frequency="monthly", day_of_month=10)
    past = date.today() - timedelta(days=1)
    with pytest.raises(HTTPException) as exc:
        validate_recurring_spec(spec, past, today=date.today())
    assert exc.value.status_code == 400


def test_validate_recurring_rejects_past_end_date():
    spec = FinanceRecurringSpec(
        frequency="monthly",
        day_of_month=5,
        end_date=date.today() - timedelta(days=2),
    )
    first = date.today() + timedelta(days=5)
    with pytest.raises(HTTPException):
        validate_recurring_spec(spec, first, today=date.today())


def test_should_run_monthly_on_matching_day():
    rule = FinanceRecurringTransaction(
        id=1,
        tenant_id=1,
        status="active",
        frequency="monthly",
        day_of_month=15,
        weekday=None,
        end_date=None,
        template_json="{}",
    )
    assert _should_run_today(rule, date(2026, 5, 15)) is True
    assert _should_run_today(rule, date(2026, 5, 16)) is False


def test_iter_monthly_year_schedule():
    rule = FinanceRecurringTransaction(
        id=1,
        tenant_id=1,
        status="active",
        frequency="monthly",
        day_of_month=30,
        weekday=None,
        end_date=date(2027, 4, 30),
        template_json="{}",
    )
    dues = iter_recurring_due_dates(rule, date(2026, 5, 30), date(2027, 4, 30))
    assert len(dues) == 12
    assert dues[0] == date(2026, 5, 30)
    assert dues[-1] == date(2027, 4, 30)


def test_should_run_weekly_on_matching_weekday():
    rule = FinanceRecurringTransaction(
        id=1,
        tenant_id=1,
        status="active",
        frequency="weekly",
        day_of_month=None,
        weekday=0,
        end_date=None,
        template_json="{}",
    )
    assert _should_run_today(rule, date(2026, 5, 25)) is True
