"""Recebíveis de maquininha: datas de competência vs compensação (caixa)."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

SettlementPlan = Literal["same_as_due", "next_business_day"]

VALID_PLANS: frozenset[str] = frozenset({"same_as_due", "next_business_day"})


def normalize_settlement_plan(raw: str | None, *, default: str = "same_as_due") -> str:
    p = (raw or default).strip().lower()
    return p if p in VALID_PLANS else default


def next_business_day_after(d: date) -> date:
    """Primeiro dia útil estritamente depois de `d` (seg-sex)."""
    cur = d + timedelta(days=1)
    while cur.weekday() >= 5:
        cur += timedelta(days=1)
    return cur


def expected_settlement_for_parcel(due: date, plan: str | None) -> date:
    """
    Data esperada de crédito na conta, por parcela.
    - same_as_due: compensação no mesmo dia do vencimento da parcela.
    - next_business_day: D+1 útil após o vencimento da parcela.
    """
    p = normalize_settlement_plan(plan)
    if p == "next_business_day":
        return next_business_day_after(due)
    return due


def split_installment_amounts(total: float, n: int) -> list[float]:
    """Divide valor total em n parcelas com arredondamento; última parcela absorve centavos."""
    if n <= 1:
        return [round(float(total), 2)]
    d_total = Decimal(str(total))
    base = (d_total / n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    parts: list[float] = []
    acc = Decimal("0")
    for _ in range(n - 1):
        parts.append(float(base))
        acc += base
    last = (d_total - acc).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    parts.append(float(last))
    return parts


def split_fee_amounts(total_fee: float, installment_amounts: list[float]) -> list[float]:
    """Distribui taxa total proporcionalmente ao bruto de cada parcela."""
    n = len(installment_amounts)
    if n == 0:
        return []
    if n == 1:
        return [round(float(total_fee), 2)]
    d_fee = Decimal(str(total_fee))
    d_total = Decimal(str(sum(installment_amounts)))
    if d_total <= 0:
        per = (d_fee / len(installment_amounts)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        fees = [float(per)] * (n - 1)
        last = d_fee - per * (n - 1)
        fees.append(float(last.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)))
        return fees
    fees_dec: list[Decimal] = []
    acc = Decimal("0")
    for i, amt in enumerate(installment_amounts[:-1]):
        share = (d_fee * Decimal(str(amt)) / d_total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        fees_dec.append(share)
        acc += share
    last_fee = (d_fee - acc).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    fees_dec.append(last_fee)
    return [float(x) for x in fees_dec]
