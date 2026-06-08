"""Testes de transações financeiras recorrentes."""

from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from app.finance_recurring_service import (
    _should_run_today,
    iter_recurring_due_dates,
    resolve_first_recurring_due,
    validate_recurring_spec,
)
from app.schemas import FinanceRecurringSpec
from models import FinanceRecurringTransaction


def test_resolve_first_monthly_due_on_or_after_reference():
    spec = FinanceRecurringSpec(frequency="monthly", day_of_month=10)
    assert resolve_first_recurring_due(date(2026, 6, 3), spec) == date(2026, 6, 10)
    assert resolve_first_recurring_due(date(2026, 6, 15), spec) == date(2026, 7, 10)


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


def test_materialize_horizon_from_future_first_due():
    """Série com primeira ocorrência longe no futuro ainda gera parcelas no horizonte."""
    from datetime import datetime, timezone

    from app.database import SessionLocal
    from app.finance_recurring_service import (
        build_entry_template_from_payload,
        create_recurring_rule,
        materialize_recurring_schedule,
    )
    from app.schemas import FinanceEntryCreate
    from models import FinanceEntry, FinanceEntryStatus, FinanceEntryType, Tenant
    from sqlalchemy import select

    db = SessionLocal()
    try:
        tenant = db.execute(select(Tenant).limit(1)).scalar_one()
        payload = FinanceEntryCreate(
            description="Salário futuro",
            entry_type=FinanceEntryType.EXPENSE,
            amount=3500.0,
            due_date=date(2028, 8, 10),
            finance_account_id=1,
            status=FinanceEntryStatus.PENDING,
            recurring=FinanceRecurringSpec(frequency="monthly", day_of_month=10),
        )
        from app.finance_recurring_service import resolve_first_recurring_due

        first = resolve_first_recurring_due(payload.due_date, payload.recurring)
        payload = payload.model_copy(update={"due_date": first})
        template = build_entry_template_from_payload(payload)
        rule = create_recurring_rule(
            db,
            tenant_id=tenant.id,
            spec=payload.recurring,
            template=template,
            first_due=payload.due_date,
        )
        entry = FinanceEntry(
            tenant_id=tenant.id,
            description=payload.description,
            entry_type=payload.entry_type,
            status=payload.status,
            amount=payload.amount,
            due_date=payload.due_date,
            competence_date=payload.due_date,
            expected_settlement_date=payload.due_date,
            recurring_transaction_id=rule.id,
        )
        db.add(entry)
        db.flush()
        created = materialize_recurring_schedule(db, rule, tz_name="America/Sao_Paulo")
        assert created >= 12
    finally:
        db.rollback()
        db.close()


def test_single_delete_excluded_due_not_recreated():
    from app.database import SessionLocal
    from app.finance_recurring_service import (
        add_excluded_due_date,
        apply_recurring_delete_side_effects,
        build_entry_template_from_payload,
        create_recurring_rule,
        materialize_recurring_schedule,
        resolve_first_recurring_due,
    )
    from app.schemas import FinanceEntryCreate
    from models import FinanceEntry, FinanceEntryStatus, FinanceEntryType, FinanceRecurringTransaction, Tenant
    from sqlalchemy import select, func

    db = SessionLocal()
    try:
        tenant = db.execute(select(Tenant).where(Tenant.id == 6)).scalar_one_or_none()
        if tenant is None:
            tenant = db.execute(select(Tenant).limit(1)).scalar_one()
        spec = FinanceRecurringSpec(frequency="monthly", day_of_month=10)
        first = resolve_first_recurring_due(date(2026, 6, 3), spec)
        payload = FinanceEntryCreate(
            description="Salário excl",
            entry_type=FinanceEntryType.EXPENSE,
            amount=100.0,
            due_date=first,
            finance_account_id=1,
            status=FinanceEntryStatus.PENDING,
            recurring=spec,
        )
        rule = create_recurring_rule(
            db,
            tenant_id=tenant.id,
            spec=spec,
            template=build_entry_template_from_payload(payload),
            first_due=first,
        )
        entry = FinanceEntry(
            tenant_id=tenant.id,
            description="Salário excl",
            entry_type=FinanceEntryType.EXPENSE,
            status=FinanceEntryStatus.PENDING,
            amount=100.0,
            due_date=first,
            competence_date=first,
            expected_settlement_date=first,
            recurring_transaction_id=rule.id,
        )
        db.add(entry)
        db.flush()
        apply_recurring_delete_side_effects(
            db, tenant_id=tenant.id, anchor_entry=entry, scope="single"
        )
        db.delete(entry)
        db.flush()
        materialize_recurring_schedule(db, rule)
        db.flush()
        n = db.execute(
            select(func.count())
            .select_from(FinanceEntry)
            .where(
                FinanceEntry.recurring_transaction_id == rule.id,
                FinanceEntry.due_date == first,
            )
        ).scalar_one()
        assert int(n or 0) == 0
        rule2 = db.execute(
            select(FinanceRecurringTransaction).where(FinanceRecurringTransaction.id == rule.id)
        ).scalar_one()
        assert first in __import__(
            "app.finance_recurring_service", fromlist=["load_excluded_due_dates"]
        ).load_excluded_due_dates(rule2)
    finally:
        db.rollback()
        db.close()


def test_materialize_skips_first_due_after_flush():
    """Mesmo fluxo do POST /finance/entries: 1º lançamento no loop + materialize."""
    from app.database import SessionLocal
    from app.finance_recurring_service import (
        build_entry_template_from_payload,
        create_recurring_rule,
        materialize_recurring_schedule,
        resolve_first_recurring_due,
    )
    from app.schemas import FinanceEntryCreate
    from models import FinanceEntry, FinanceEntryStatus, FinanceEntryType, Tenant
    from sqlalchemy import select, func

    db = SessionLocal()
    try:
        tenant = db.execute(select(Tenant).limit(1)).scalar_one()
        spec = FinanceRecurringSpec(frequency="monthly", day_of_month=10)
        first = resolve_first_recurring_due(date(2026, 6, 3), spec)
        payload = FinanceEntryCreate(
            description="Salário",
            entry_type=FinanceEntryType.EXPENSE,
            amount=3500.0,
            due_date=first,
            finance_account_id=1,
            status=FinanceEntryStatus.PENDING,
            recurring=spec,
        )
        template = build_entry_template_from_payload(payload)
        rule = create_recurring_rule(
            db,
            tenant_id=tenant.id,
            spec=spec,
            template=template,
            first_due=first,
        )
        db.add(
            FinanceEntry(
                tenant_id=tenant.id,
                description=payload.description,
                entry_type=payload.entry_type,
                status=payload.status,
                amount=payload.amount,
                due_date=first,
                competence_date=first,
                expected_settlement_date=first,
                recurring_transaction_id=rule.id,
            )
        )
        db.flush()
        materialize_recurring_schedule(db, rule)
        db.flush()
        n_same = db.execute(
            select(func.count())
            .select_from(FinanceEntry)
            .where(
                FinanceEntry.recurring_transaction_id == rule.id,
                FinanceEntry.due_date == first,
            )
        ).scalar_one()
        assert int(n_same or 0) == 1
    finally:
        db.rollback()
        db.close()


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
