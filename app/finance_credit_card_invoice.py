"""Compras no cartão: fatura consolidada e débito bancário só no pagamento."""

from __future__ import annotations

import json
from calendar import monthrange
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.finance_settlement import expected_settlement_for_parcel, normalize_settlement_plan
from models import (
    FinanceCreditCard,
    FinanceCreditCardInvoice,
    FinanceCreditCardInvoiceStatus,
    FinanceEntry,
    FinanceEntryStatus,
    FinanceEntryType,
)


def calculate_invoice_due_date(
    purchase_date: date,
    *,
    closing_day: int,
    due_day: int,
) -> date:
    closing = max(1, min(28, int(closing_day)))
    due_d = max(1, min(28, int(due_day)))
    year, month = purchase_date.year, purchase_date.month
    if purchase_date.day > closing:
        month += 1
        if month > 12:
            month = 1
            year += 1
    last_day = monthrange(year, month)[1]
    due = date(year, month, min(due_d, last_day))
    return _to_business_day(due)


def _to_business_day(d: date) -> date:
    cur = d
    while cur.weekday() >= 5:
        cur += timedelta(days=1)
    return cur


def parse_credit_card_invoice_notes(raw: str | None) -> dict[str, Any] | None:
    if not raw or not str(raw).strip():
        return None
    try:
        data = json.loads(raw)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    block = data.get("credit_card_invoice")
    return block if isinstance(block, dict) else None


def entry_affects_bank_cashflow(entry: FinanceEntry) -> bool:
    """Débito em conta corrente só quando a fatura foi paga (ou lançamento bancário comum pago)."""
    if entry.status == FinanceEntryStatus.AWAITING_INVOICE:
        return False
    block = parse_credit_card_invoice_notes(entry.notes)
    if block and block.get("role") == "purchase":
        return False
    if entry.credit_card_invoice_id is not None and entry.finance_account_id is None:
        return False
    if entry.credit_card_invoice_id is not None and entry.finance_account_id is not None:
        if entry.status != FinanceEntryStatus.PAID:
            return False
    return True


def _get_or_create_open_invoice(
    db: Session,
    *,
    tenant_id: int,
    card_id: int,
    due_date: date,
) -> FinanceCreditCardInvoice:
    row = db.execute(
        select(FinanceCreditCardInvoice).where(
            FinanceCreditCardInvoice.tenant_id == tenant_id,
            FinanceCreditCardInvoice.credit_card_id == card_id,
            FinanceCreditCardInvoice.due_date == due_date,
            FinanceCreditCardInvoice.status.in_(
                (FinanceCreditCardInvoiceStatus.OPEN, FinanceCreditCardInvoiceStatus.CLOSED)
            ),
        )
    ).scalar_one_or_none()
    if row is not None:
        return row
    row = FinanceCreditCardInvoice(
        tenant_id=tenant_id,
        credit_card_id=card_id,
        due_date=due_date,
        status=FinanceCreditCardInvoiceStatus.OPEN,
        total_amount=0,
    )
    db.add(row)
    db.flush()
    return row


def _ensure_invoice_bank_entry(
    db: Session,
    *,
    tenant_id: int,
    card: FinanceCreditCard,
    invoice: FinanceCreditCardInvoice,
    category_id: int | None,
    plan: str,
) -> FinanceEntry:
    if invoice.finance_entry_id is not None:
        entry = db.get(FinanceEntry, invoice.finance_entry_id)
        if entry is not None:
            entry.amount = float(invoice.total_amount)
            entry.expected_settlement_date = expected_settlement_for_parcel(invoice.due_date, plan)
            db.add(entry)
            return entry

    entry = FinanceEntry(
        tenant_id=tenant_id,
        category_id=category_id,
        description=f"Fatura {card.name} — venc. {invoice.due_date.isoformat()}"[:180],
        entry_type=FinanceEntryType.EXPENSE,
        status=FinanceEntryStatus.PENDING,
        amount=float(invoice.total_amount),
        payment_method="credit_card",
        payment_provider=(card.name or "").strip() or None,
        finance_account_id=card.billing_account_id,
        credit_card_id=card.id,
        credit_card_invoice_id=invoice.id,
        fee_fixed_amount=0,
        fee_percent=0,
        fee_amount=0,
        competence_date=invoice.due_date,
        expected_settlement_date=expected_settlement_for_parcel(invoice.due_date, plan),
        settlement_plan=plan,
        due_date=invoice.due_date,
        notes=json.dumps(
            {"credit_card_invoice": {"role": "invoice", "card_id": card.id, "invoice_id": invoice.id}},
            ensure_ascii=False,
        ),
    )
    db.add(entry)
    db.flush()
    invoice.finance_entry_id = entry.id
    db.add(invoice)
    return entry


def create_credit_card_expense_entries(
    db: Session,
    *,
    tenant_id: int,
    card: FinanceCreditCard,
    payload,
) -> list[FinanceEntry]:
    installments = int(payload.installments or 1)
    if installments > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Compra no cartão de crédito: use parcela única ou registre cada parcela separadamente.",
        )
    if not card.billing_account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Configure a conta bancária de débito da fatura neste cartão.",
        )

    purchase_date = payload.competence_date or payload.due_date
    invoice_due = calculate_invoice_due_date(
        purchase_date,
        closing_day=int(card.closing_day),
        due_day=int(card.due_day),
    )
    amount = float(payload.amount)
    plan = normalize_settlement_plan(payload.settlement_plan, default="same_as_due")

    invoice = _get_or_create_open_invoice(
        db,
        tenant_id=tenant_id,
        card_id=card.id,
        due_date=invoice_due,
    )
    invoice.total_amount = float(invoice.total_amount or 0) + amount
    db.add(invoice)
    db.flush()

    purchase = FinanceEntry(
        tenant_id=tenant_id,
        category_id=payload.category_id,
        description=payload.description.strip(),
        entry_type=FinanceEntryType.EXPENSE,
        status=FinanceEntryStatus.AWAITING_INVOICE,
        amount=amount,
        payment_method="credit_card",
        payment_provider=(card.name or "").strip() or None,
        finance_account_id=None,
        credit_card_id=card.id,
        credit_card_invoice_id=invoice.id,
        fee_fixed_amount=payload.fee_fixed_amount,
        fee_percent=payload.fee_percent,
        fee_amount=float(payload.fee_amount or 0),
        competence_date=purchase_date,
        expected_settlement_date=purchase_date,
        settlement_plan=plan,
        due_date=purchase_date,
        notes=json.dumps(
            {
                "credit_card_invoice": {
                    "role": "purchase",
                    "card_id": card.id,
                    "invoice_id": invoice.id,
                }
            },
            ensure_ascii=False,
        ),
    )
    db.add(purchase)
    db.flush()

    bank_entry = _ensure_invoice_bank_entry(
        db,
        tenant_id=tenant_id,
        card=card,
        invoice=invoice,
        category_id=payload.category_id,
        plan=plan,
    )

    return [purchase, bank_entry]


def sync_purchases_when_invoice_paid(db: Session, invoice_entry: FinanceEntry) -> None:
    """Ao pagar o lançamento bancário da fatura, marca fatura e compras como pagas."""
    inv: FinanceCreditCardInvoice | None = None
    if invoice_entry.credit_card_invoice_id:
        inv = db.get(FinanceCreditCardInvoice, invoice_entry.credit_card_invoice_id)
    if inv is None:
        inv = db.execute(
            select(FinanceCreditCardInvoice).where(
                FinanceCreditCardInvoice.finance_entry_id == invoice_entry.id,
            )
        ).scalar_one_or_none()

    if inv is not None:
        inv.status = FinanceCreditCardInvoiceStatus.PAID
        db.add(inv)
        purchases = db.execute(
            select(FinanceEntry).where(
                FinanceEntry.credit_card_invoice_id == inv.id,
                FinanceEntry.status == FinanceEntryStatus.AWAITING_INVOICE,
            )
        ).scalars().all()
        for purchase in purchases:
            purchase.status = FinanceEntryStatus.PAID
            purchase.paid_at = invoice_entry.paid_at
            db.add(purchase)
        return

    block = parse_credit_card_invoice_notes(invoice_entry.notes)
    if not block or block.get("role") != "invoice":
        return
    ids = block.get("purchase_entry_ids")
    if not isinstance(ids, list):
        return
    for pid in ids:
        try:
            entry_id = int(pid)
        except (TypeError, ValueError):
            continue
        purchase = db.get(FinanceEntry, entry_id)
        if purchase is None or purchase.tenant_id != invoice_entry.tenant_id:
            continue
        purchase.status = FinanceEntryStatus.PAID
        purchase.paid_at = invoice_entry.paid_at
        db.add(purchase)


def sum_open_invoices_total(db: Session, tenant_id: int) -> float:
    total = db.execute(
        select(func.coalesce(func.sum(FinanceCreditCardInvoice.total_amount), 0)).where(
            FinanceCreditCardInvoice.tenant_id == tenant_id,
            FinanceCreditCardInvoice.status.in_(
                (FinanceCreditCardInvoiceStatus.OPEN, FinanceCreditCardInvoiceStatus.CLOSED)
            ),
        )
    ).scalar_one()
    return float(total or 0)
