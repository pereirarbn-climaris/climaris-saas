"""Edição em lote de lançamentos (parcelas / recorrência) com validação e taxas."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.finance_settlement import expected_settlement_for_parcel, normalize_settlement_plan
from app.schemas import FinanceEntryUpdate
from models import FinanceEntry, FinanceEntryStatus

EditScope = str  # "single" | "future" | "all"


def _parse_notes(raw: str | None) -> dict[str, Any]:
    if not raw or not str(raw).strip():
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def entry_is_reconciled(entry: FinanceEntry) -> bool:
    rec = _parse_notes(entry.notes).get("gateway_reconciliation")
    return isinstance(rec, dict) and bool(rec.get("matched_at") or rec.get("provider"))


def entry_is_edit_locked(entry: FinanceEntry) -> bool:
    if entry.status == FinanceEntryStatus.PAID:
        return True
    if entry_is_reconciled(entry):
        return True
    return False


def resolve_edit_targets(
    db: Session,
    *,
    tenant_id: int,
    entry: FinanceEntry,
    scope: EditScope,
) -> list[FinanceEntry]:
    scope = scope or "single"
    if scope == "single":
        return [entry]

    if entry.recurring_transaction_id:
        q = select(FinanceEntry).where(
            FinanceEntry.tenant_id == tenant_id,
            FinanceEntry.recurring_transaction_id == entry.recurring_transaction_id,
        )
        if scope == "future":
            q = q.where(FinanceEntry.due_date >= entry.due_date)
        return list(db.execute(q.order_by(FinanceEntry.due_date.asc())).scalars().all())

    if entry.installment_group_id:
        q = select(FinanceEntry).where(
            FinanceEntry.tenant_id == tenant_id,
            FinanceEntry.installment_group_id == entry.installment_group_id,
        )
        if scope == "future":
            q = q.where(FinanceEntry.installment_number >= entry.installment_number)
        return list(db.execute(q.order_by(FinanceEntry.installment_number.asc())).scalars().all())

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Lançamento não possui série recorrente nem grupo de parcelas.",
    )


def assert_targets_editable(
    targets: list[FinanceEntry],
    *,
    allow_locked: bool = False,
) -> None:
    if allow_locked:
        return
    locked = [t for t in targets if entry_is_edit_locked(t)]
    if not locked:
        return
    paid = sum(1 for t in locked if t.status == FinanceEntryStatus.PAID)
    reconciled = sum(1 for t in locked if entry_is_reconciled(t))
    parts: list[str] = []
    if paid:
        parts.append(f"{paid} já pago(s)")
    if reconciled:
        parts.append(f"{reconciled} conciliado(s)")
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=(
            "Não é possível alterar automaticamente lançamentos "
            + " e ".join(parts)
            + ". Edite apenas parcelas pendentes ou estorne a liquidação antes."
        ),
    )


def recalculate_fee_amount_for_entry(entry: FinanceEntry, amount: float) -> None:
    fee_pct = float(entry.fee_percent or 0)
    fee_fixed = float(entry.fee_fixed_amount or 0)
    if fee_pct <= 0 and fee_fixed <= 0:
        return
    entry.fee_amount = round(amount * (fee_pct / 100.0) + fee_fixed, 2)


def apply_update_to_entry(
    entry: FinanceEntry,
    payload: FinanceEntryUpdate,
    *,
    effective_due_date: date | None = None,
    skip_due_date: bool = False,
) -> None:
    if payload.description is not None:
        entry.description = payload.description.strip()
    if payload.amount is not None:
        entry.amount = payload.amount
        recalculate_fee_amount_for_entry(entry, float(payload.amount))
    if payload.payment_method is not None:
        entry.payment_method = payload.payment_method.strip().lower() or None
    if payload.payment_provider is not None:
        entry.payment_provider = payload.payment_provider.strip() or None
    if payload.finance_account_id is not None:
        entry.finance_account_id = payload.finance_account_id
    if payload.credit_card_id is not None:
        entry.credit_card_id = payload.credit_card_id
    if payload.fee_fixed_amount is not None:
        entry.fee_fixed_amount = payload.fee_fixed_amount
        if payload.amount is not None:
            recalculate_fee_amount_for_entry(entry, float(entry.amount))
    if payload.fee_percent is not None:
        entry.fee_percent = payload.fee_percent
        amt = float(payload.amount if payload.amount is not None else entry.amount)
        recalculate_fee_amount_for_entry(entry, amt)
    if payload.fee_amount is not None:
        entry.fee_amount = payload.fee_amount
    if payload.recipient_whatsapp is not None:
        entry.recipient_whatsapp = payload.recipient_whatsapp
    if payload.gateway_payment_id is not None:
        entry.gateway_payment_id = (
            (payload.gateway_payment_id.strip()[:48] or None) if payload.gateway_payment_id else None
        )
    if "gateway_preference_id" in payload.model_fields_set:
        raw_pref = payload.gateway_preference_id
        if raw_pref is None or (isinstance(raw_pref, str) and not raw_pref.strip()):
            old_pref = (entry.gateway_preference_id or "").strip()
            if old_pref and (entry.payment_provider or "").strip().lower() == "mercadopago":
                if not (entry.mercadopago_archived_preference_id or "").strip():
                    entry.mercadopago_archived_preference_id = old_pref[:48]
            entry.gateway_preference_id = None
        else:
            entry.gateway_preference_id = str(raw_pref).strip()[:48] or None
    if payload.installment_group_id is not None:
        entry.installment_group_id = payload.installment_group_id.strip() or None
    if payload.installment_number is not None:
        entry.installment_number = payload.installment_number
    if payload.installment_total is not None:
        entry.installment_total = payload.installment_total
    if not skip_due_date:
        due = effective_due_date if effective_due_date is not None else payload.due_date
        if due is not None:
            entry.due_date = due
            entry.expected_settlement_date = expected_settlement_for_parcel(entry.due_date, entry.settlement_plan)
    if payload.competence_date is not None:
        entry.competence_date = payload.competence_date
    if payload.settlement_plan is not None:
        entry.settlement_plan = normalize_settlement_plan(payload.settlement_plan, default="same_as_due")
        entry.expected_settlement_date = expected_settlement_for_parcel(entry.due_date, entry.settlement_plan)
    if payload.notes is not None:
        entry.notes = payload.notes.strip() or None
    if payload.category_id is not None:
        entry.category_id = payload.category_id
    if payload.status is not None:
        entry.status = payload.status
        if payload.status == FinanceEntryStatus.PAID:
            entry.paid_at = entry.paid_at or datetime.now(timezone.utc)
        elif payload.status != FinanceEntryStatus.PAID:
            entry.paid_at = None
