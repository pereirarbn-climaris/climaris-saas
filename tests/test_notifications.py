"""Testes do serviço de notificações in-app."""

from models import FinanceEntry, FinanceEntryType, NotificationKind, OrderStatus, ServiceOrder, User, UserRole
from app.notifications import (
    build_service_order_notification,
    dispatch_finance_payment_received_notification,
)


def test_build_service_order_started_notification():
    order = ServiceOrder(id=42, tenant_id=1, client_id=1, title="Manutenção", status=OrderStatus.IN_PROGRESS)
    actor = User(id=7, tenant_id=1, full_name="João Silva", email="j@x.com", password_hash="x", role=UserRole.TECHNICIAN)

    class _Client:
        name = "Empresa ABC"

    order.client = _Client()  # type: ignore[assignment]

    payload = build_service_order_notification(
        db=None,  # type: ignore[arg-type]
        order=order,
        actor=actor,
        status=OrderStatus.IN_PROGRESS,
    )
    assert payload is not None
    kind, title, body = payload
    assert kind == NotificationKind.SERVICE_ORDER_STARTED.value
    assert title == "OS em andamento"
    assert "João Silva" in body
    assert "OS #42" in body
    assert "Empresa ABC" in body


def test_build_service_order_notification_ignores_open_status():
    order = ServiceOrder(id=1, tenant_id=1, client_id=1, title="X", status=OrderStatus.OPEN)
    actor = User(id=2, tenant_id=1, full_name="A", email="a@x.com", password_hash="x", role=UserRole.ADMIN)
    assert build_service_order_notification(db=None, order=order, actor=actor, status=OrderStatus.OPEN) is None  # type: ignore[arg-type]


def test_finance_payment_notification_skips_expense():
    entry = FinanceEntry(
        id=9,
        tenant_id=1,
        description="Compra",
        entry_type=FinanceEntryType.EXPENSE,
        amount=100,
    )
    assert dispatch_finance_payment_received_notification(db=None, entry=entry) == 0  # type: ignore[arg-type]


def test_format_brl_helper():
    from app.notifications import _format_brl

    assert _format_brl(1234.5) == "R$ 1.234,50"


def test_broadcast_platform_announcement_requires_title():
    import pytest
    from app.notifications import broadcast_platform_announcement

    with pytest.raises(ValueError, match="Título"):
        broadcast_platform_announcement(
            db=None,  # type: ignore[arg-type]
            title="  ",
            body="Corpo",
            link_path=None,
            actor_user_id=1,
        )
