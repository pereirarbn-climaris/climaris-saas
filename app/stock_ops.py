from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from models import OrderStatus, Product, Service, ServiceOrder, ServiceOrderServiceItem, StockMovement, StockMovementReason


class StockReservationError(ValueError):
    """Falha de integridade de estoque (reserva ou baixa)."""


def demand_map_for_order(order: ServiceOrder) -> dict[int, Decimal]:
    needs: dict[int, Decimal] = {}
    for pi in order.product_items:
        q = Decimal(str(max(pi.quantity, 1)))
        needs[pi.product_id] = needs.get(pi.product_id, Decimal(0)) + q
    for si in order.service_items:
        svc = si.service
        if svc is None:
            continue
        sq = Decimal(str(max(si.quantity, 1)))
        for inp in svc.product_inputs:
            q = sq * Decimal(str(inp.quantity))
            needs[inp.product_id] = needs.get(inp.product_id, Decimal(0)) + q
    return needs


def reserved_quantities_by_product(db: Session, tenant_id: int) -> dict[int, Decimal]:
    """Mapa product_id → reservado (campo persistido em products)."""
    rows = db.execute(
        select(Product.id, Product.quantity_reserved).where(Product.tenant_id == tenant_id)
    ).all()
    out: dict[int, Decimal] = {}
    for pid, qty in rows:
        reserved = Decimal(str(qty or 0))
        if reserved > 0:
            out[int(pid)] = reserved
    return out


def apply_stock_consumption(
    db: Session,
    *,
    tenant_id: int,
    order: ServiceOrder,
    movements_note: str | None = None,
) -> None:
    """Baixa física ao concluir OS e libera reserva. Idempotente se stock_consumed_at estiver setado."""
    if order.stock_consumed_at is not None:
        return

    demand = demand_map_for_order(order)
    if not demand:
        order.stock_consumed_at = datetime.now(timezone.utc)
        return

    product_ids = list(demand.keys())
    products = db.execute(
        select(Product)
        .where(Product.tenant_id == tenant_id, Product.id.in_(product_ids))
        .with_for_update()
    ).scalars().all()
    by_id = {p.id: p for p in products}

    for pid, need in demand.items():
        prod = by_id.get(pid)
        if prod is None:
            raise StockReservationError(f"Produto {pid} não encontrado.")
        physical = Decimal(str(prod.quantity_physical))
        reserved = Decimal(str(prod.quantity_reserved))
        if physical < need:
            raise StockReservationError(
                f"Estoque insuficiente para «{prod.name}» (SKU {prod.sku}). "
                f"Necessário: {need}, físico: {physical}."
            )

    for pid, need in demand.items():
        prod = by_id[pid]
        physical = Decimal(str(prod.quantity_physical)) - need
        reserved = Decimal(str(prod.quantity_reserved)) - need
        if reserved < 0:
            reserved = Decimal(0)
        prod.quantity_physical = float(physical)
        prod.quantity_reserved = float(reserved)
        prod.stock_quantity = float(physical)
        db.add(
            StockMovement(
                tenant_id=tenant_id,
                product_id=pid,
                quantity_delta=float(-need),
                reason=StockMovementReason.OS_CONSUMPTION,
                service_order_id=order.id,
                notes=movements_note,
            )
        )

    order.stock_consumed_at = datetime.now(timezone.utc)


def rebuild_tenant_reservations_from_orders(db: Session, tenant_id: int) -> None:
    """Recalcula quantity_reserved a partir das OS em aberto (manutenção / migração)."""
    from app.stock_reservation import RESERVING_ORDER_STATUSES, effective_reservation_demand

    products = db.execute(select(Product).where(Product.tenant_id == tenant_id).with_for_update()).scalars().all()
    for p in products:
        p.quantity_reserved = 0.0

    orders = db.execute(
        select(ServiceOrder)
        .where(
            ServiceOrder.tenant_id == tenant_id,
            ServiceOrder.status.in_(RESERVING_ORDER_STATUSES),
            ServiceOrder.stock_consumed_at.is_(None),
        )
        .options(
            selectinload(ServiceOrder.service_items).selectinload(ServiceOrderServiceItem.service).selectinload(
                Service.product_inputs
            ),
            selectinload(ServiceOrder.product_items),
        )
    ).scalars().all()

    merged: dict[int, Decimal] = defaultdict(Decimal)
    for order in orders:
        for pid, q in effective_reservation_demand(order).items():
            merged[pid] += q

    if not merged:
        return

    by_id = {p.id: p for p in products}
    for pid, qty in merged.items():
        prod = by_id.get(pid)
        if prod is not None:
            prod.quantity_reserved = float(qty)
