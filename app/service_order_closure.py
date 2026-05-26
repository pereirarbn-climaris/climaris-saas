"""Ganchos pós-conclusão de ordem de serviço (preventiva por equipamento e automações financeiras)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.equipment_preventive_rules import sync_preventive_rules_on_order_closure
from models import CustomerBillingAutomation, ServiceOrder

logger = logging.getLogger("erp.service_order_closure")


def execute_post_closure_automations(
    db: Session,
    *,
    service_order_id: int,
    tenant_id: int,
    client_id: int,
) -> dict[str, object]:
    """
    Esqueleto para fase 2: NFSe automática, gateway de pagamento e WhatsApp (Evolution).

    Próximos passos: ler CustomerBillingAutomation e disparar integrações conforme flags.
    """
    billing = db.execute(
        select(CustomerBillingAutomation).where(CustomerBillingAutomation.client_id == client_id)
    ).scalar_one_or_none()

    if billing is None:
        logger.debug(
            "post_closure_automations skipped: no billing prefs client_id=%s order_id=%s",
            client_id,
            service_order_id,
        )
        return {
            "service_order_id": service_order_id,
            "skipped": True,
            "reason": "no_billing_automation",
        }

    gateway = (
        billing.payment_gateway.value
        if hasattr(billing.payment_gateway, "value")
        else str(billing.payment_gateway)
    )
    plan = {
        "service_order_id": service_order_id,
        "tenant_id": tenant_id,
        "client_id": client_id,
        "auto_emit_nfse": bool(billing.auto_emit_nfse),
        "payment_gateway": gateway,
        "days_to_due": int(billing.days_to_due),
        "auto_send_whatsapp": bool(billing.auto_send_whatsapp),
        "executed": False,
        "placeholder": True,
    }
    logger.info("post_closure_automations placeholder order_id=%s plan=%s", service_order_id, plan)
    return plan


def on_service_order_closed(
    db: Session,
    *,
    order: ServiceOrder,
    closed_at: datetime | None = None,
    tenant_id: int,
) -> None:
    """Dispara sincronização de preventiva por equipamento e automações pós-fechamento."""
    when = closed_at or datetime.now(timezone.utc)
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)

    sync_preventive_rules_on_order_closure(db, order=order, closed_at=when)

    try:
        execute_post_closure_automations(
            db,
            service_order_id=order.id,
            tenant_id=tenant_id,
            client_id=order.client_id,
        )
    except Exception:
        logger.exception(
            "post_closure_automations failed order_id=%s (OS closure preserved)",
            order.id,
        )
