from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from models import OrderStatus, Product, Service, ServiceOrder, ServiceOrderServiceItem, StockMovement, StockMovementReason


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
    orders = db.execute(
        select(ServiceOrder)
        .where(
            ServiceOrder.tenant_id == tenant_id,
            ServiceOrder.status.in_((OrderStatus.APPROVED, OrderStatus.SCHEDULED, OrderStatus.IN_PROGRESS)),
        )
        .options(
            selectinload(ServiceOrder.service_items).selectinload(ServiceOrderServiceItem.service).selectinload(
                Service.product_inputs
            ),
            selectinload(ServiceOrder.product_items),
        )
    ).scalars().all()

    merged: dict[int, Decimal] = defaultdict(Decimal)
    for o in orders:
        for pid, q in demand_map_for_order(o).items():
            merged[pid] += q
    return dict(merged)


def apply_stock_consumption(
    db: Session,
    *,
    tenant_id: int,
    order: ServiceOrder,
    movements_note: str | None = None,
) -> None:
    """Decrement stock and write movements. Idempotent if order.stock_consumed_at is set."""
    if order.stock_consumed_at is not None:
        return
    demand = demand_map_for_order(order)
    if not demand:
        from datetime import datetime, timezone

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
            raise ValueError(f"Produto {pid} não encontrado.")
        cur = Decimal(str(prod.stock_quantity))
        if cur < need:
            raise ValueError(
                f"Estoque insuficiente para «{prod.name}» (SKU {prod.sku}). "
                f"Necessário: {need}, disponível: {cur}."
            )

    for pid, need in demand.items():
        prod = by_id[pid]
        new_qty = Decimal(str(prod.stock_quantity)) - need
        prod.stock_quantity = float(new_qty)
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

    from datetime import datetime, timezone

    order.stock_consumed_at = datetime.now(timezone.utc)
