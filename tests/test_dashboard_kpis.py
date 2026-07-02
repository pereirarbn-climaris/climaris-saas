"""Testes unitários dos helpers de KPI do dashboard."""

from datetime import datetime, timezone

import pytest

from app.dashboard_entitlements import (
    dashboard_tier_label,
    dashboard_tier_rank,
    effective_dashboard_tier,
)
from app.dashboard_kpis import (
    add_months,
    dashboard_order_status,
    dynamic_month_target,
    month_datetime_bounds,
    month_label_pt,
    service_order_gross_total,
)
from models import OrderStatus, ServiceOrder, ServiceOrderProductItem, ServiceOrderServiceItem


def test_month_datetime_bounds_january():
    start, end = month_datetime_bounds(2026, 1)
    assert start == datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    assert end.day == 31
    assert end.month == 1


def test_month_datetime_bounds_invalid_month():
    with pytest.raises(ValueError, match="month"):
        month_datetime_bounds(2026, 13)


def test_service_order_gross_total_with_discount():
    order = ServiceOrder(
        id=1,
        tenant_id=1,
        client_id=1,
        title="Teste",
        discount_amount=50,
        status=OrderStatus.OPEN,
    )
    order.service_items = [
        ServiceOrderServiceItem(service_order_id=1, service_id=1, quantity=2, unit_price=100, duration_minutes=30),
    ]
    order.product_items = [
        ServiceOrderProductItem(service_order_id=1, product_id=1, quantity=1, unit_price=80),
    ]
    assert service_order_gross_total(order) == 230.0


def test_add_months_crosses_year():
    assert add_months(2026, 1, -1) == (2025, 12)
    assert add_months(2025, 12, 1) == (2026, 1)


def test_month_label_pt():
    assert month_label_pt(5) == "Mai"
    assert month_label_pt(13) == "13"


def test_dynamic_month_target_with_history():
    target = dynamic_month_target([40_000.0, 50_000.0], 45_000.0)
    assert target == pytest.approx(49_500.0)


def test_dynamic_month_target_without_history():
    assert dynamic_month_target([], 10_000.0) == pytest.approx(11_500.0)
    assert dynamic_month_target([], 0.0) == 5000.0


def test_dashboard_order_status_mapping():
    assert dashboard_order_status(OrderStatus.OPEN) == "pending"
    assert dashboard_order_status(OrderStatus.DONE) == "completed"
    assert dashboard_order_status(OrderStatus.CANCELLED) == "cancelled"


def test_dashboard_tier_labels_and_rank():
    assert dashboard_tier_label("basic") == "Básico"
    assert dashboard_tier_label("advanced") == "Avançado"
    assert dashboard_tier_label("complete") == "Completo"
    assert dashboard_tier_rank("basic") < dashboard_tier_rank("advanced")
    assert dashboard_tier_rank("advanced") < dashboard_tier_rank("complete")


def test_effective_dashboard_tier_from_finance_mode(monkeypatch):
    from models import Tenant

    tenant = Tenant(id=1, name="Test", active_plan="professional", finance_mode="intermediate")

    def fake_mode(_db, _tenant):
        return "intermediate"

    monkeypatch.setattr("app.dashboard_entitlements.db.get", lambda _db, _key: None)
    monkeypatch.setattr("app.dashboard_entitlements.effective_finance_max_mode", fake_mode)
    assert effective_dashboard_tier(None, tenant) == "advanced"  # type: ignore[arg-type]


def test_effective_dashboard_tier_prefers_catalog(monkeypatch):
    from models import SaasPlanCatalog, Tenant

    tenant = Tenant(id=1, name="Test", active_plan="enterprise", finance_mode="intermediate")
    row = SaasPlanCatalog(
        plan_key="enterprise",
        display_name="Enterprise",
        description="",
        footnote="",
        finance_max_mode="intermediate",
        dashboard_tier="complete",
        max_users=None,
        sort_order=0,
        is_beta_internal=False,
        can_contract=True,
        is_selectable_for_tenants=True,
        show_in_matrix=True,
    )

    monkeypatch.setattr("app.dashboard_entitlements.db.get", lambda _db, key: row if key == "enterprise" else None)
    assert effective_dashboard_tier(None, tenant) == "complete"  # type: ignore[arg-type]
