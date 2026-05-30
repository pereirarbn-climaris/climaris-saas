"""Regras de negócio financeiras (margem por OS, validações de lançamento)."""

from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import FinanceEntry, FinanceEntryStatus, FinanceEntryType


def _effective_income_amount(entry: FinanceEntry) -> float:
    gross = float(entry.amount or 0)
    fee = float(entry.fee_amount or 0)
    if entry.notes:
        try:
            data = json.loads(entry.notes)
            if isinstance(data, dict) and data.get("net_value") is not None:
                return float(data["net_value"])
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    return max(0.0, gross - fee)


def get_os_paid_revenue_and_cost(
    db: Session,
    tenant_id: int,
    service_order_id: int,
    *,
    exclude_entry_id: int | None = None,
) -> tuple[float, float]:
    """Soma receitas e despesas pagas vinculadas à OS."""
    rows = db.execute(
        select(FinanceEntry).where(
            FinanceEntry.tenant_id == tenant_id,
            FinanceEntry.service_order_id == service_order_id,
            FinanceEntry.status == FinanceEntryStatus.PAID,
        )
    ).scalars().all()

    revenue = 0.0
    cost = 0.0
    for entry in rows:
        if exclude_entry_id is not None and int(entry.id) == int(exclude_entry_id):
            continue
        if entry.entry_type == FinanceEntryType.INCOME:
            revenue += _effective_income_amount(entry)
        elif entry.entry_type == FinanceEntryType.EXPENSE:
            cost += float(entry.amount or 0)
    return revenue, cost


def projected_os_margin_percent(
    revenue: float,
    current_cost: float,
    additional_expense: float,
) -> float | None:
    if revenue <= 0:
        return None
    projected_cost = current_cost + max(0.0, float(additional_expense))
    return ((revenue - projected_cost) / revenue) * 100.0


def validate_os_expense_loss_justification(
    db: Session,
    tenant_id: int,
    service_order_id: int,
    expense_amount: float,
    reason_for_loss: str | None,
    *,
    exclude_entry_id: int | None = None,
) -> None:
    """
    Exige justificativa quando a despesa projetada deixa a OS com margem negativa
    (prejuízo real sobre receita já paga).
    """
    revenue, cost = get_os_paid_revenue_and_cost(
        db,
        tenant_id,
        service_order_id,
        exclude_entry_id=exclude_entry_id,
    )
    margin = projected_os_margin_percent(revenue, cost, expense_amount)
    if margin is None or margin >= 0:
        return
    justification = (reason_for_loss or "").strip()
    if not justification:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Esta despesa deixará a OS com margem negativa. "
                "Informe reason_for_loss (justificativa de prejuízo) para continuar."
            ),
        )


def merge_reason_for_loss_notes(notes: str | None, reason_for_loss: str) -> str:
    base: dict[str, Any] = {}
    if notes and notes.strip():
        try:
            parsed = json.loads(notes)
            if isinstance(parsed, dict):
                base = parsed
            else:
                base = {"_legacy_notes": notes}
        except json.JSONDecodeError:
            base = {"_legacy_notes": notes}
    base["reason_for_loss"] = reason_for_loss.strip()
    return json.dumps(base, ensure_ascii=False)
