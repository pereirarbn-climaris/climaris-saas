"""Reserva e baixa de estoque integradas às ordens de serviço."""

from __future__ import annotations

from collections.abc import Callable
from decimal import Decimal
from typing import TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.stock_ops import StockReservationError, demand_map_for_order
from app.tenant_inventory import tenant_inventory_enabled
from models import OrderStatus, Product, ServiceOrder

T = TypeVar("T")

RESERVING_ORDER_STATUSES = (
    OrderStatus.OPEN,
    OrderStatus.APPROVED,
    OrderStatus.SCHEDULED,
    OrderStatus.IN_PROGRESS,
)


def order_reserves_stock(order: ServiceOrder) -> bool:
    return order.status in RESERVING_ORDER_STATUSES and order.stock_consumed_at is None


def effective_reservation_demand(order: ServiceOrder) -> dict[int, Decimal]:
    if not order_reserves_stock(order):
        return {}
    return demand_map_for_order(order)


def _sync_product_stock_columns(product: Product) -> None:
    """Mantém stock_quantity alinhado ao físico (compatibilidade legada)."""
    product.stock_quantity = float(product.quantity_physical)


def _lock_products(db: Session, tenant_id: int, product_ids: set[int]) -> dict[int, Product]:
    if not product_ids:
        return {}
    rows = db.execute(
        select(Product)
        .where(Product.tenant_id == tenant_id, Product.id.in_(product_ids))
        .with_for_update()
    ).scalars().all()
    return {p.id: p for p in rows}


def apply_reservation_delta(
    db: Session,
    *,
    tenant_id: int,
    old_demand: dict[int, Decimal],
    new_demand: dict[int, Decimal],
) -> None:
    """Ajusta quantity_reserved conforme diferença entre demandas antiga e nova."""
    all_ids = set(old_demand) | set(new_demand)
    if not all_ids:
        return

    by_id = _lock_products(db, tenant_id, all_ids)
    for pid in all_ids:
        product = by_id.get(pid)
        if product is None:
            raise StockReservationError(f"Produto {pid} não encontrado.")
        delta = new_demand.get(pid, Decimal(0)) - old_demand.get(pid, Decimal(0))
        if delta == 0:
            continue
        reserved = Decimal(str(product.quantity_reserved)) + delta
        if reserved < 0:
            raise StockReservationError(
                f"Reserva inconsistente para «{product.name}» (SKU {product.sku})."
            )
        product.quantity_reserved = float(reserved)


def sync_order_reservation(
    db: Session,
    *,
    tenant_id: int,
    order: ServiceOrder,
    old_demand: dict[int, Decimal],
) -> None:
    """Recalcula reserva da OS após alteração de linhas ou status."""
    if not tenant_inventory_enabled(db, tenant_id):
        return
    if order.status == OrderStatus.DONE and order.stock_consumed_at is not None:
        return
    new_demand = effective_reservation_demand(order)
    apply_reservation_delta(db, tenant_id=tenant_id, old_demand=old_demand, new_demand=new_demand)


def run_stock_mutation(db: Session, fn: Callable[[], T]) -> T:
    """Executa mutação de estoque com rollback em caso de erro."""
    try:
        result = fn()
        return result
    except StockReservationError:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
