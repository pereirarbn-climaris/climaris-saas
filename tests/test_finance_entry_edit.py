"""Edição em série de lançamentos financeiros."""

from datetime import date

import pytest
from fastapi import HTTPException

from app.finance_entry_edit import (
    apply_update_to_entry,
    assert_targets_editable,
    entry_is_edit_locked,
    recalculate_fee_amount_for_entry,
    resolve_edit_targets,
)
from app.schemas import FinanceEntryUpdate
from models import FinanceEntry, FinanceEntryStatus, FinanceEntryType


def _entry(**kwargs) -> FinanceEntry:
    base = dict(
        tenant_id=1,
        category_id=1,
        description="Teste",
        entry_type=FinanceEntryType.INCOME,
        status=FinanceEntryStatus.PENDING,
        amount=100.0,
        due_date=date(2026, 5, 1),
        fee_percent=2.5,
        fee_fixed_amount=0.0,
        fee_amount=2.5,
        competence_date=date(2026, 5, 1),
    )
    base.update(kwargs)
    return FinanceEntry(**base)


def test_recalculate_fee_on_amount_change():
    row = _entry(amount=200.0, fee_percent=10.0, fee_amount=20.0)
    recalculate_fee_amount_for_entry(row, 300.0)
    assert row.fee_amount == 30.0


def test_entry_is_edit_locked_paid():
    row = _entry(status=FinanceEntryStatus.PAID)
    assert entry_is_edit_locked(row) is True


def test_entry_is_edit_locked_reconciled_notes():
    row = _entry(
        status=FinanceEntryStatus.PENDING,
        notes='{"gateway_reconciliation":{"provider":"stone","matched_at":"2026-01-01"}}',
    )
    assert entry_is_edit_locked(row) is True


def test_assert_targets_editable_raises_on_paid():
    paid = _entry(status=FinanceEntryStatus.PAID)
    with pytest.raises(HTTPException) as exc:
        assert_targets_editable([paid])
    assert exc.value.status_code == 409


def test_apply_update_recalculates_fee():
    row = _entry(amount=100.0, fee_percent=5.0, fee_amount=5.0)
    apply_update_to_entry(row, FinanceEntryUpdate(amount=200.0))
    assert row.amount == 200.0
    assert row.fee_amount == 10.0


def test_apply_update_skip_due_date_when_bulk_unchanged():
    row = _entry(due_date=date(2026, 6, 15))
    apply_update_to_entry(
        row,
        FinanceEntryUpdate(due_date=date(2026, 6, 15)),
        skip_due_date=True,
    )
    assert row.due_date == date(2026, 6, 15)


def test_apply_update_effective_due_date_shift():
    row = _entry(due_date=date(2026, 7, 10))
    apply_update_to_entry(
        row,
        FinanceEntryUpdate(due_date=date(2026, 5, 30)),
        effective_due_date=date(2026, 8, 10),
    )
    assert row.due_date == date(2026, 8, 10)
