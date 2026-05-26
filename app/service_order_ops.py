"""Operações de domínio para vínculos equipamento ↔ serviço na OS."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import (
    ScheduleStatus,
    ServiceOrderEquipmentService,
    ServiceOrderTechnician,
    Schedule,
    ScheduleTechnician,
    UserRole,
)

if TYPE_CHECKING:
    from models import ServiceOrder, User


def get_total_duration_minutes(order: "ServiceOrder") -> int:
    """Soma quantity × duration_minutes dos serviços vinculados a equipamentos (não inclui produtos)."""
    total = 0
    for item in order.service_items:
        qty = max(int(item.quantity or 1), 1)
        minutes = max(int(item.duration_minutes or 1), 1)
        total += qty * minutes
    return max(total, 0)


def compute_actual_duration_minutes(order: "ServiceOrder", finished_at: datetime) -> int | None:
    """Diferença em minutos entre started_at e finished_at."""
    started = order.started_at
    if started is None:
        return None
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    end = finished_at if finished_at.tzinfo else finished_at.replace(tzinfo=timezone.utc)
    seconds = (end - started).total_seconds()
    if seconds < 0:
        return None
    return max(1, int(seconds // 60))


def assert_unique_equipment_service(
    db: Session,
    *,
    service_order_id: int,
    service_id: int,
    equipment_id: int | None,
    exclude_item_id: int | None = None,
    exclude_item_ids: set[int] | None = None,
) -> None:
    """Garante unicidade de (equipment_id, service_id) na mesma OS."""
    excluded: set[int] = set(exclude_item_ids or ())
    if exclude_item_id is not None:
        excluded.add(exclude_item_id)

    query = select(ServiceOrderEquipmentService.id).where(
        ServiceOrderEquipmentService.service_order_id == service_order_id,
        ServiceOrderEquipmentService.service_id == service_id,
    )
    if equipment_id is None:
        query = query.where(ServiceOrderEquipmentService.equipment_id.is_(None))
    else:
        query = query.where(ServiceOrderEquipmentService.equipment_id == equipment_id)
    if excluded:
        query = query.where(ServiceOrderEquipmentService.id.not_in(excluded))
    existing_id = db.execute(query.limit(1)).scalar_one_or_none()
    if existing_id is not None:
        if equipment_id is None:
            detail = "Este serviço já está na OS sem equipamento vinculado. Ajuste a quantidade da linha existente."
        else:
            detail = (
                "Este serviço já está vinculado a este equipamento nesta OS. "
                "Use outro equipamento ou altere a quantidade da linha existente."
            )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def build_equipment_cards(order: "ServiceOrder") -> list[dict[str, Any]]:
    """Agrupa equipment_services por equipamento para a visão do técnico."""
    groups: dict[int | None, list[ServiceOrderEquipmentService]] = defaultdict(list)
    for item in order.service_items:
        groups[item.equipment_id].append(item)

    cards: list[dict[str, Any]] = []
    for equipment_id, items in sorted(groups.items(), key=lambda pair: (pair[0] is None, pair[0] or 0)):
        equipment = items[0].equipment if items else None
        card_duration = 0
        services_out: list[dict[str, Any]] = []
        for item in sorted(items, key=lambda row: row.id):
            qty = max(int(item.quantity or 1), 1)
            minutes = max(int(item.duration_minutes or 1), 1)
            card_duration += qty * minutes
            svc = item.service
            services_out.append(
                {
                    "id": item.id,
                    "service_id": item.service_id,
                    "equipment_id": item.equipment_id,
                    "quantity": item.quantity,
                    "unit_price": float(item.unit_price),
                    "duration_minutes": item.duration_minutes,
                    "service_name": svc.name if svc is not None else None,
                    "periodicidade_meses": svc.periodicidade_meses if svc is not None else None,
                }
            )
        cards.append(
            {
                "equipment_id": equipment_id,
                "equipment_identificacao": equipment.identificacao if equipment is not None else None,
                "equipment_tipo": equipment.tipo if equipment is not None else None,
                "equipment_modelo": equipment.modelo if equipment is not None else None,
                "services": services_out,
                "total_duration_minutes": card_duration,
            }
        )
    return cards


def technician_can_access_order(order: "ServiceOrder", user: "User") -> bool:
    if user.role != UserRole.TECHNICIAN:
        return True
    if any(ot.technician_id == user.id for ot in order.technicians):
        return True
    for schedule in order.schedules:
        if schedule.status == ScheduleStatus.CANCELLED:
            continue
        if any(st.technician_id == user.id for st in schedule.technicians):
            return True
    return False


def apply_technician_order_scope(query, user: "User"):
    """Restringe listagem de OS ao técnico autenticado."""
    if user.role != UserRole.TECHNICIAN:
        return query
    from models import ServiceOrder

    assigned_on_order = (
        select(ServiceOrderTechnician.id)
        .where(
            ServiceOrderTechnician.service_order_id == ServiceOrder.id,
            ServiceOrderTechnician.technician_id == user.id,
        )
        .correlate(ServiceOrder)
        .exists()
    )
    assigned_on_schedule = (
        select(ScheduleTechnician.id)
        .join(Schedule, Schedule.id == ScheduleTechnician.schedule_id)
        .where(
            Schedule.service_order_id == ServiceOrder.id,
            ScheduleTechnician.technician_id == user.id,
            Schedule.status != ScheduleStatus.CANCELLED,
        )
        .correlate(ServiceOrder)
        .exists()
    )
    return query.where(assigned_on_order | assigned_on_schedule)
