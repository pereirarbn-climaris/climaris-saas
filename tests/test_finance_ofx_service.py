"""Testes de sugestão de conciliação OFX."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock

from app.finance_ofx_service import suggest_finance_entries_for_ofx_line
from models import FinanceBankAccount, FinanceEntry, FinanceEntryStatus, FinanceEntryType


def _entry(
    *,
    eid: int,
    amount: float,
    entry_type: FinanceEntryType,
    due: date,
    account_id: int | None = 1,
) -> FinanceEntry:
    e = MagicMock(spec=FinanceEntry)
    e.id = eid
    e.amount = amount
    e.entry_type = entry_type
    e.due_date = due
    e.competence_date = due
    e.status = FinanceEntryStatus.PENDING
    e.finance_account_id = account_id
    return e


def test_suggest_includes_entry_without_account_when_amount_matches():
    db = MagicMock()
    acc = MagicMock(spec=FinanceBankAccount)
    acc.id = 1
    acc.name = "Infinitay"
    row = _entry(eid=10, amount=120.0, entry_type=FinanceEntryType.INCOME, due=date(2026, 6, 3), account_id=None)
    db.execute.return_value.scalars.return_value.all.return_value = [row]

    hits = suggest_finance_entries_for_ofx_line(
        db,
        tenant_id=1,
        bank_account=acc,
        amount=Decimal("120.00"),
        posted_at=date(2026, 6, 3),
    )
    assert len(hits) == 1
    assert hits[0].id == 10
