from decimal import Decimal
from unittest.mock import MagicMock

from app.stock_reservation import (
    apply_reservation_delta,
    effective_reservation_demand,
    order_reserves_stock,
)
from app.stock_ops import demand_map_for_order
from models import OrderStatus


def test_order_reserves_stock_open():
    order = MagicMock()
    order.status = OrderStatus.OPEN
    order.stock_consumed_at = None
    assert order_reserves_stock(order) is True


def test_order_does_not_reserve_when_done():
    order = MagicMock()
    order.status = OrderStatus.DONE
    order.stock_consumed_at = None
    assert order_reserves_stock(order) is False


def test_apply_reservation_delta_updates_product():
    product = MagicMock()
    product.id = 1
    product.name = "Filtro"
    product.sku = "F1"
    product.quantity_reserved = 0.0

    db = MagicMock()
    db.execute.return_value.scalars.return_value.all.return_value = [product]

    apply_reservation_delta(
        db,
        tenant_id=1,
        old_demand={},
        new_demand={1: Decimal("3")},
    )
    assert product.quantity_reserved == 3.0


def test_effective_demand_empty_when_cancelled():
    order = MagicMock()
    order.status = OrderStatus.CANCELLED
    order.stock_consumed_at = None
    order.product_items = []
    order.service_items = []
    assert effective_reservation_demand(order) == {}
