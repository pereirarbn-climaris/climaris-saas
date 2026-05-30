"""Demonstrativo de Resultado (DRE) mensal — agregação de lançamentos pagos."""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.finance_service import _effective_income_amount
from models import FinanceEntry, FinanceEntryStatus, FinanceEntryType, OrderStatus, ServiceOrder


@dataclass(frozen=True)
class MonthlyDRERow:
    month: int
    year: int
    receita_bruta: float
    custos_variaveis: float
    margem_contribuicao: float
    custos_fixos: float
    lucro_liquido: float

    def as_dict(self) -> dict:
        return {
            "month": self.month,
            "year": self.year,
            "receita_bruta": round(self.receita_bruta, 2),
            "custos_variaveis": round(self.custos_variaveis, 2),
            "margem_contribuicao": round(self.margem_contribuicao, 2),
            "custos_fixos": round(self.custos_fixos, 2),
            "lucro_liquido": round(self.lucro_liquido, 2),
        }


def month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _period_date_expr():
    return func.coalesce(func.date(FinanceEntry.paid_at), FinanceEntry.competence_date)


def _fetch_paid_entries_with_orders(
    db: Session,
    tenant_id: int,
    range_start: date,
    range_end: date,
) -> list[tuple[FinanceEntry, OrderStatus | None]]:
    period = _period_date_expr()
    rows = db.execute(
        select(FinanceEntry, ServiceOrder.status)
        .outerjoin(ServiceOrder, FinanceEntry.service_order_id == ServiceOrder.id)
        .where(
            FinanceEntry.tenant_id == tenant_id,
            FinanceEntry.status == FinanceEntryStatus.PAID,
            period >= range_start,
            period <= range_end,
        )
    ).all()
    return [(entry, status) for entry, status in rows]


def _entry_period_date(entry: FinanceEntry) -> date:
    if entry.paid_at is not None:
        return entry.paid_at.date()
    return entry.competence_date


def generate_monthly_dre(
    month: int,
    year: int,
    rows: list[tuple[FinanceEntry, OrderStatus | None]],
) -> MonthlyDRERow:
    """Agrega lançamentos pagos no mês (competência = paid_at ou competence_date)."""
    receita_bruta = 0.0
    custos_variaveis = 0.0
    custos_fixos = 0.0

    for entry, order_status in rows:
        period = _entry_period_date(entry)
        if period.month != month or period.year != year:
            continue

        amount = float(entry.amount or 0)
        if entry.entry_type == FinanceEntryType.INCOME:
            if entry.service_order_id is None:
                continue
            if order_status != OrderStatus.DONE:
                continue
            receita_bruta += _effective_income_amount(entry)
        elif entry.entry_type == FinanceEntryType.EXPENSE:
            if entry.service_order_id is not None:
                custos_variaveis += amount
            else:
                custos_fixos += amount

    margem_contribuicao = receita_bruta - custos_variaveis
    lucro_liquido = margem_contribuicao - custos_fixos

    return MonthlyDRERow(
        month=month,
        year=year,
        receita_bruta=receita_bruta,
        custos_variaveis=custos_variaveis,
        margem_contribuicao=margem_contribuicao,
        custos_fixos=custos_fixos,
        lucro_liquido=lucro_liquido,
    )


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    m = month + delta
    y = year
    while m < 1:
        m += 12
        y -= 1
    while m > 12:
        m -= 12
        y += 1
    return y, m


def build_dre_report(
    db: Session,
    tenant_id: int,
    month: int,
    year: int,
    *,
    history_months: int = 6,
) -> dict:
    """DRE do mês solicitado + histórico dos últimos N meses (inclui o mês atual)."""
    history_months = max(1, min(int(history_months), 24))
    oldest_delta = -(history_months - 1)
    y0, m0 = _shift_month(year, month, oldest_delta)
    range_start, _ = month_bounds(y0, m0)
    _, range_end = month_bounds(year, month)

    rows = _fetch_paid_entries_with_orders(db, tenant_id, range_start, range_end)

    history: list[dict] = []
    for i in range(history_months):
        y, m = _shift_month(year, month, oldest_delta + i)
        history.append(generate_monthly_dre(m, y, rows).as_dict())

    current = history[-1] if history else generate_monthly_dre(month, year, rows).as_dict()

    return {
        "month": month,
        "year": year,
        "current": current,
        "history": history,
    }
