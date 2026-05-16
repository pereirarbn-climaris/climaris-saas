"""Sugestões de conciliação entre linhas OFX e lançamentos financeiros."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from models import FinanceBankAccount, FinanceEntry, FinanceEntryStatus, FinanceEntryType


AMOUNT_TOLERANCE = Decimal("0.02")
DEFAULT_DATE_WINDOW_DAYS = 14


def amount_matches_ofx_line(entry: FinanceEntry, ofx_amount: Decimal) -> bool:
    try:
        ea = Decimal(str(entry.amount)).quantize(Decimal("0.01"))
    except Exception:
        return False
    if ofx_amount > 0:
        return entry.entry_type == FinanceEntryType.INCOME and abs(ea - ofx_amount) <= AMOUNT_TOLERANCE
    if ofx_amount < 0:
        return entry.entry_type == FinanceEntryType.EXPENSE and abs(ea - abs(ofx_amount)) <= AMOUNT_TOLERANCE
    return False


def finance_entry_matches_bank_account_for_ofx(entry: FinanceEntry, account: FinanceBankAccount) -> bool:
    if entry.finance_account_id is not None and entry.finance_account_id == account.id:
        return True
    if (account.name or "").strip().lower() != "caixa":
        return False
    pm = (entry.payment_method or "").strip().lower()
    return pm == "cash" and entry.finance_account_id is None


def suggest_finance_entries_for_ofx_line(
    db: Session,
    *,
    tenant_id: int,
    bank_account: FinanceBankAccount,
    amount: Decimal,
    posted_at: date,
    window_days: int = DEFAULT_DATE_WINDOW_DAYS,
    limit: int = 8,
) -> list[FinanceEntry]:
    """
    Heurística simples: mesmo sinal (crédito=receita, débito=despesa), valor próximo,
    vencimento/competência próximos da data do extrato, pendente ou vencido.
    """
    if amount > 0:
        entry_type = FinanceEntryType.INCOME
        target_abs = amount
    elif amount < 0:
        entry_type = FinanceEntryType.EXPENSE
        target_abs = abs(amount)
    else:
        return []

    d0 = posted_at - timedelta(days=window_days)
    d1 = posted_at + timedelta(days=window_days)

    q = (
        select(FinanceEntry)
        .where(
            FinanceEntry.tenant_id == tenant_id,
            FinanceEntry.entry_type == entry_type,
            FinanceEntry.status.in_((FinanceEntryStatus.PENDING, FinanceEntryStatus.OVERDUE)),
            or_(FinanceEntry.due_date.between(d0, d1), FinanceEntry.competence_date.between(d0, d1)),
        )
        .order_by(FinanceEntry.due_date.asc(), FinanceEntry.id.asc())
        .limit(80)
    )
    rows = db.execute(q).scalars().all()
    scored: list[tuple[int, FinanceEntry]] = []
    for e in rows:
        if not finance_entry_matches_bank_account_for_ofx(e, bank_account):
            continue
        try:
            ea = Decimal(str(e.amount)).quantize(Decimal("0.01"))
        except Exception:
            continue
        if abs(ea - target_abs) > AMOUNT_TOLERANCE:
            continue
        due_delta = abs((e.due_date - posted_at).days)
        comp_delta = abs((e.competence_date - posted_at).days)
        score = min(due_delta, comp_delta)
        scored.append((score, e))

    scored.sort(key=lambda x: (x[0], x[1].id))
    out: list[FinanceEntry] = []
    seen: set[int] = set()
    for _s, e in scored:
        if e.id in seen:
            continue
        seen.add(e.id)
        out.append(e)
        if len(out) >= limit:
            break
    return out
