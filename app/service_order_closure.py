"""Ganchos pós-conclusão de ordem de serviço (preventiva por equipamento e automações financeiras)."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.compliance.exceptions import ComplianceValidationError
from app.domains.work_orders.digital_os_service import DigitalWorkOrderService
from app.equipment_preventive_rules import sync_preventive_rules_on_order_closure
from app.equipment_service_preventive import (
    _performed_date_to_utc,
    sync_service_preventive_schedules_on_order_closure,
)
from models import CustomerBillingAutomation, ScheduleStatus, ServiceOrder, User, UserRole

logger = logging.getLogger("erp.service_order_closure")
audit_logger = logging.getLogger("erp.audit.service_order_closure")


def resolve_os_performed_at(
    order: ServiceOrder,
    *,
    data_realizacao: date | None = None,
    fallback: datetime | None = None,
) -> datetime:
    """
    Data/hora usada como última realização preventiva ao concluir a OS.

    Prioridade: data informada no fechamento → dia do agendamento → agora (fallback).
    """
    now = fallback or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    if data_realizacao is not None:
        return _performed_date_to_utc(data_realizacao)

    for schedule in order.schedules or []:
        if schedule.status == ScheduleStatus.CANCELLED:
            continue
        starts = schedule.starts_at
        if starts is None:
            continue
        if starts.tzinfo is None:
            starts = starts.replace(tzinfo=timezone.utc)
        return starts

    return now


def resolve_technician_id_for_compliance(order: ServiceOrder, user: User) -> int | None:
    if user.role == UserRole.TECHNICIAN:
        return user.id
    if order.technicians:
        return order.technicians[0].technician_id
    for schedule in order.schedules:
        if schedule.technicians:
            return schedule.technicians[0].technician_id
    return None


def assert_can_close_service_order(
    db: Session,
    *,
    order: ServiceOrder,
    tenant_id: int,
    user: User,
    force_close: bool = False,
) -> None:
    """
    Valida compliance da OS digital antes de concluir a ServiceOrder legada.

    - Sem OS digital vinculada: não bloqueia (fluxo legado).
    - Com OS digital: exige ``can_finalize_service_order`` == True, salvo ``force_close`` (admin).
  """
    if force_close and user.role != UserRole.ADMIN:
        raise PermissionError("Apenas administradores podem forçar o encerramento sem compliance.")

    service = DigitalWorkOrderService(db, tenant_id=tenant_id)
    digital = service.get_by_service_order_id(order.id)
    if digital is None:
        return

    technician_id = resolve_technician_id_for_compliance(order, user)
    can_finalize, result = service.evaluate_finalize(digital, technician_id=technician_id)

    if can_finalize:
        return

    missing = [err.model_dump() for err in result.errors]

    if force_close:
        audit_logger.warning(
            "service_order_force_close_without_compliance",
            extra={
                "event": "service_order_force_close_without_compliance",
                "service_order_id": order.id,
                "digital_work_order_id": str(digital.id),
                "tenant_id": tenant_id,
                "user_id": user.id,
                "user_role": user.role.value if hasattr(user.role, "value") else str(user.role),
                "missing_requirements": missing,
            },
        )
        return

    raise ComplianceValidationError(
        missing_requirements=missing,
        digital_work_order_id=digital.id,
    )


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
    performed_at: datetime | None = None,
) -> None:
    """Dispara sincronização de preventiva por equipamento e automações pós-fechamento."""
    when = closed_at or datetime.now(timezone.utc)
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    performance = performed_at or when
    if performance.tzinfo is None:
        performance = performance.replace(tzinfo=timezone.utc)

    sync_preventive_rules_on_order_closure(db, order=order, closed_at=performance)
    sync_service_preventive_schedules_on_order_closure(db, order=order, closed_at=performance)

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
