"""Cálculo de vencimento de fatura no cartão de crédito."""

from datetime import date

from app.finance_credit_card_invoice import calculate_invoice_due_date, entry_affects_bank_cashflow
from models import FinanceEntry, FinanceEntryStatus


def test_invoice_due_same_month_before_closing():
    due = calculate_invoice_due_date(date(2026, 5, 10), closing_day=15, due_day=20)
    assert due == date(2026, 5, 20)


def test_invoice_due_next_month_after_closing():
    due = calculate_invoice_due_date(date(2026, 5, 20), closing_day=15, due_day=10)
    assert due == date(2026, 6, 10)


def test_invoice_due_weekend_shifts_to_monday():
    # 7/jun/2026 é domingo → segunda 8
    due = calculate_invoice_due_date(date(2026, 6, 1), closing_day=28, due_day=7)
    assert due == date(2026, 6, 8)


def test_purchase_awaiting_invoice_does_not_affect_bank():
    entry = FinanceEntry(
        tenant_id=1,
        description="Compra",
        entry_type="expense",
        status=FinanceEntryStatus.AWAITING_INVOICE,
        amount=100,
        due_date=date(2026, 5, 1),
        competence_date=date(2026, 5, 1),
        expected_settlement_date=date(2026, 5, 1),
        notes='{"credit_card_invoice":{"role":"purchase","card_id":1,"group_id":"abc"}}',
    )
    assert entry_affects_bank_cashflow(entry) is False
