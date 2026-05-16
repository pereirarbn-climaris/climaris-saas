"""Cálculos consolidados para KPIs do painel inicial."""

from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from models import (
    Client,
    FinanceEntry,
    FinanceEntryStatus,
    FinanceEntryType,
    OrderStatus,
    Schedule,
    ScheduleTechnician,
    ServiceOrder,
    ServiceOrderProductItem,
    ServiceOrderServiceItem,
    ServiceOrderTechnician,
    Tenant,
)

AVERAGE_FALLBACK_DAYS = 90
DEFAULT_REVENUE_TARGET = 5000.0
MONTH_LABELS_PT = ("Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez")


def month_datetime_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    """Intervalo [início, fim] do mês em UTC (inclusivo no fim do dia)."""
    if month < 1 or month > 12:
        raise ValueError("month must be between 1 and 12")
    last_day = monthrange(year, month)[1]
    start = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    end = datetime(year, month, last_day, 23, 59, 59, 999999, tzinfo=timezone.utc)
    return start, end


def add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    """Desloca (year, month) por delta meses (negativo = passado)."""
    month += delta
    while month < 1:
        month += 12
        year -= 1
    while month > 12:
        month -= 12
        year += 1
    return year, month


def month_label_pt(month: int) -> str:
    if month < 1 or month > 12:
        return str(month)
    return MONTH_LABELS_PT[month - 1]


def dashboard_order_status(status: OrderStatus) -> str:
    """Status compatível com o componente RecentOrdersTable do frontend."""
    mapping = {
        OrderStatus.OPEN: "pending",
        OrderStatus.APPROVED: "pending",
        OrderStatus.SCHEDULED: "scheduled",
        OrderStatus.IN_PROGRESS: "in_progress",
        OrderStatus.DONE: "completed",
        OrderStatus.CANCELLED: "cancelled",
    }
    return mapping.get(status, "pending")


def dynamic_month_target(prior_revenues: list[float], current_revenue: float) -> float:
    """Meta dinâmica: média dos meses anteriores +10% ou 15% acima do mês atual."""
    if prior_revenues:
        baseline = sum(prior_revenues) / len(prior_revenues)
        return max(baseline * 1.1, current_revenue * 1.05, 0.0)
    if current_revenue > 0:
        return current_revenue * 1.15
    return DEFAULT_REVENUE_TARGET


def service_order_gross_total(order: ServiceOrder) -> float:
    """Soma serviços + produtos menos desconto da OS."""
    services = sum(float(i.quantity) * float(i.unit_price) for i in order.service_items)
    products = sum(float(i.quantity) * float(i.unit_price) for i in order.product_items)
    discount = max(0.0, float(order.discount_amount or 0))
    return max(0.0, services + products - discount)


def _count_active_service_orders(db: Session, tenant_id: int) -> int:
    total = db.scalar(
        select(func.count(ServiceOrder.id)).where(
            ServiceOrder.tenant_id == tenant_id,
            ServiceOrder.status.notin_((OrderStatus.DONE, OrderStatus.CANCELLED)),
        )
    )
    return int(total or 0)


def _count_active_clients(db: Session, tenant_id: int) -> int:
    total = db.scalar(
        select(func.count(Client.id)).where(
            Client.tenant_id == tenant_id,
            Client.is_active.is_(True),
        )
    )
    return int(total or 0)


def _sum_paid_income_in_period(db: Session, tenant_id: int, start: datetime, end: datetime) -> float:
    total = db.scalar(
        select(func.coalesce(func.sum(FinanceEntry.amount), 0)).where(
            FinanceEntry.tenant_id == tenant_id,
            FinanceEntry.entry_type == FinanceEntryType.INCOME,
            FinanceEntry.status == FinanceEntryStatus.PAID,
            FinanceEntry.paid_at.isnot(None),
            FinanceEntry.paid_at >= start,
            FinanceEntry.paid_at <= end,
        )
    )
    return float(total or 0)


def _service_order_ids_with_paid_income_in_period(
    db: Session, tenant_id: int, start: datetime, end: datetime
) -> set[int]:
    rows = db.scalars(
        select(FinanceEntry.service_order_id).where(
            FinanceEntry.tenant_id == tenant_id,
            FinanceEntry.entry_type == FinanceEntryType.INCOME,
            FinanceEntry.status == FinanceEntryStatus.PAID,
            FinanceEntry.service_order_id.isnot(None),
            FinanceEntry.paid_at.isnot(None),
            FinanceEntry.paid_at >= start,
            FinanceEntry.paid_at <= end,
        ).distinct()
    ).all()
    return {int(r) for r in rows if r is not None}


def _sum_done_orders_revenue_without_finance(
    db: Session,
    tenant_id: int,
    start: datetime,
    end: datetime,
    exclude_order_ids: set[int],
) -> float:
    orders = db.scalars(
        select(ServiceOrder)
        .where(
            ServiceOrder.tenant_id == tenant_id,
            ServiceOrder.status == OrderStatus.DONE,
            ServiceOrder.closed_at.isnot(None),
            ServiceOrder.closed_at >= start,
            ServiceOrder.closed_at <= end,
        )
        .options(
            selectinload(ServiceOrder.service_items),
            selectinload(ServiceOrder.product_items),
        )
    ).all()
    total = 0.0
    for order in orders:
        if order.id in exclude_order_ids:
            continue
        total += service_order_gross_total(order)
    return total


def _average_service_minutes(
    db: Session,
    tenant_id: int,
    start: datetime,
    end: datetime,
) -> tuple[float | None, int]:
    avg_seconds = db.scalar(
        select(
            func.avg(
                func.extract("epoch", ServiceOrder.closed_at) - func.extract("epoch", ServiceOrder.opened_at)
            )
        ).where(
            ServiceOrder.tenant_id == tenant_id,
            ServiceOrder.status == OrderStatus.DONE,
            ServiceOrder.closed_at.isnot(None),
            ServiceOrder.opened_at.isnot(None),
            ServiceOrder.closed_at >= start,
            ServiceOrder.closed_at <= end,
            ServiceOrder.closed_at > ServiceOrder.opened_at,
        )
    )
    sample = db.scalar(
        select(func.count(ServiceOrder.id)).where(
            ServiceOrder.tenant_id == tenant_id,
            ServiceOrder.status == OrderStatus.DONE,
            ServiceOrder.closed_at.isnot(None),
            ServiceOrder.opened_at.isnot(None),
            ServiceOrder.closed_at >= start,
            ServiceOrder.closed_at <= end,
            ServiceOrder.closed_at > ServiceOrder.opened_at,
        )
    )
    count = int(sample or 0)
    if avg_seconds is None or count == 0:
        return None, 0
    return round(float(avg_seconds) / 60.0, 1), count


def compute_monthly_consolidated_revenue(
    db: Session,
    tenant: Tenant,
    year: int,
    month: int,
) -> tuple[float, float, float]:
    """
    Faturamento consolidado do mês (sem dupla contagem).

    Retorna (total, financeiro, ordens_sem_lançamento).
    """
    period_start, period_end = month_datetime_bounds(year, month)
    revenue_from_finance = 0.0
    revenue_from_orders = 0.0
    if tenant.finance_enabled:
        revenue_from_finance = _sum_paid_income_in_period(db, tenant.id, period_start, period_end)
        linked_ids = _service_order_ids_with_paid_income_in_period(db, tenant.id, period_start, period_end)
        revenue_from_orders = _sum_done_orders_revenue_without_finance(
            db, tenant.id, period_start, period_end, linked_ids
        )
    else:
        revenue_from_orders = _sum_done_orders_revenue_without_finance(
            db, tenant.id, period_start, period_end, set()
        )
    total = revenue_from_finance + revenue_from_orders
    return total, revenue_from_finance, revenue_from_orders


def compute_dashboard_home_kpis(
    db: Session,
    tenant: Tenant,
    *,
    year: int | None = None,
    month: int | None = None,
) -> dict:
    today = date.today()
    period_year = year if year is not None else today.year
    period_month = month if month is not None else today.month

    active_service_orders = _count_active_service_orders(db, tenant.id)
    active_clients = _count_active_clients(db, tenant.id)

    revenue_from_finance = 0.0
    revenue_from_orders = 0.0
    monthly_revenue_raw, revenue_from_finance, revenue_from_orders = compute_monthly_consolidated_revenue(
        db, tenant, period_year, period_month
    )
    monthly_revenue = round(monthly_revenue_raw, 2)
    period_start, period_end = month_datetime_bounds(period_year, period_month)

    avg_minutes, sample_size = _average_service_minutes(db, tenant.id, period_start, period_end)
    if avg_minutes is None:
        fallback_start = period_end - timedelta(days=AVERAGE_FALLBACK_DAYS)
        avg_minutes, sample_size = _average_service_minutes(db, tenant.id, fallback_start, period_end)

    return {
        "period_year": period_year,
        "period_month": period_month,
        "active_service_orders": active_service_orders,
        "active_clients": active_clients,
        "monthly_revenue": monthly_revenue,
        "monthly_revenue_from_finance": round(revenue_from_finance, 2),
        "monthly_revenue_from_service_orders": round(revenue_from_orders, 2),
        "average_service_minutes": avg_minutes,
        "average_service_sample_size": sample_size,
    }


def compute_dashboard_revenue_chart(
    db: Session,
    tenant: Tenant,
    *,
    months: int = 6,
    end_year: int | None = None,
    end_month: int | None = None,
) -> dict:
    today = date.today()
    anchor_year = end_year if end_year is not None else today.year
    anchor_month = end_month if end_month is not None else today.month

    period_coords: list[tuple[int, int]] = []
    y, m = anchor_year, anchor_month
    for _ in range(months):
        period_coords.append((y, m))
        y, m = add_months(y, m, -1)
    period_coords.reverse()

    points: list[dict] = []
    prior_revenues: list[float] = []
    for py, pm in period_coords:
        total_raw, rev_fin, rev_ord = compute_monthly_consolidated_revenue(db, tenant, py, pm)
        total = round(total_raw, 2)
        target = round(dynamic_month_target(prior_revenues, total), 2)
        prior_revenues.append(total)
        points.append(
            {
                "year": py,
                "month": pm,
                "month_label": month_label_pt(pm),
                "revenue": total,
                "target": target,
                "revenue_from_finance": round(rev_fin, 2),
                "revenue_from_service_orders": round(rev_ord, 2),
            }
        )

    return {
        "months": months,
        "end_year": anchor_year,
        "end_month": anchor_month,
        "points": points,
    }


def _recent_orders_load_options():
    return (
        selectinload(ServiceOrder.client),
        selectinload(ServiceOrder.service_items),
        selectinload(ServiceOrder.product_items),
        selectinload(ServiceOrder.schedules)
        .selectinload(Schedule.technicians)
        .selectinload(ScheduleTechnician.technician),
        selectinload(ServiceOrder.technicians).selectinload(ServiceOrderTechnician.technician),
    )


def compute_dashboard_recent_orders(
    db: Session,
    tenant_id: int,
    *,
    limit: int = 5,
) -> list[dict]:
    orders = db.scalars(
        select(ServiceOrder)
        .where(ServiceOrder.tenant_id == tenant_id)
        .options(*_recent_orders_load_options())
        .order_by(ServiceOrder.opened_at.desc(), ServiceOrder.id.desc())
        .limit(limit)
    ).all()

    items: list[dict] = []
    for order in orders:
        client_name = (order.client.name.strip() if order.client and order.client.name else "") or "—"
        items.append(
            {
                "id": order.id,
                "client_name": client_name,
                "technician_name": order.assigned_technician_name,
                "status": dashboard_order_status(order.status),
                "opened_at": order.opened_at,
                "total_value": round(service_order_gross_total(order), 2),
                "title": order.title,
            }
        )
    return items
