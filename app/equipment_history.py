"""Consultas de histórico de OS por equipamento (pivot service_order_service_items)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.schemas import EquipmentChecklistItemOut, EquipmentHistoryRowOut
from app.service_order_meta import (
    is_preventive_service_line,
    parse_checklist_items,
    parse_tipo_servico,
    preventive_sql_match,
    service_type_label,
)
from models import (
    OrderStatus,
    Schedule,
    ScheduleStatus,
    Service,
    ServiceOrder,
    ServiceOrderServiceItem,
    ServiceOrderTechnician,
    User,
)

EQUIPMENT_HISTORY_STATUSES = (
    OrderStatus.OPEN,
    OrderStatus.APPROVED,
    OrderStatus.SCHEDULED,
    OrderStatus.IN_PROGRESS,
    OrderStatus.DONE,
)

ORDER_STATUS_LABELS: dict[OrderStatus, str] = {
    OrderStatus.OPEN: "Pendente",
    OrderStatus.APPROVED: "Aprovada",
    OrderStatus.SCHEDULED: "Agendada",
    OrderStatus.IN_PROGRESS: "Em andamento",
    OrderStatus.DONE: "Concluída",
}

VISIT_SOURCE_BY_STATUS: dict[OrderStatus, str] = {
    OrderStatus.OPEN: "ordem_pendente",
    OrderStatus.APPROVED: "ordem_aprovada",
    OrderStatus.SCHEDULED: "ordem_agendada",
    OrderStatus.IN_PROGRESS: "ordem_em_andamento",
    OrderStatus.DONE: "ordem_concluida",
}


def history_occurred_at(
    *,
    status: OrderStatus,
    closed_at: datetime | None,
    completed_at: datetime | None,
    started_at: datetime | None,
    opened_at: datetime,
    schedule_starts_at: datetime | None,
) -> datetime:
    if status == OrderStatus.DONE:
        return closed_at or completed_at or started_at or opened_at
    if status == OrderStatus.IN_PROGRESS:
        return started_at or opened_at
    if status == OrderStatus.SCHEDULED and schedule_starts_at is not None:
        return schedule_starts_at
    return opened_at


def technician_names_by_order_ids(db: Session, order_ids: set[int]) -> dict[int, str]:
    if not order_ids:
        return {}
    rows = db.execute(
        select(ServiceOrderTechnician.service_order_id, User.full_name)
        .join(User, User.id == ServiceOrderTechnician.technician_id)
        .where(ServiceOrderTechnician.service_order_id.in_(order_ids))
        .order_by(ServiceOrderTechnician.id.asc())
    ).all()
    names_by_order: dict[int, list[str]] = {}
    for order_id, full_name in rows:
        label = (full_name or "").strip()
        if not label:
            continue
        bucket = names_by_order.setdefault(int(order_id), [])
        if label not in bucket:
            bucket.append(label)
    return {oid: ", ".join(names) for oid, names in names_by_order.items()}


def schedule_starts_by_order_ids(db: Session, order_ids: set[int]) -> dict[int, datetime]:
    if not order_ids:
        return {}
    rows = db.execute(
        select(Schedule.service_order_id, Schedule.starts_at)
        .where(
            Schedule.service_order_id.in_(order_ids),
            Schedule.status != ScheduleStatus.CANCELLED,
        )
        .order_by(Schedule.starts_at.asc())
    ).all()
    out: dict[int, datetime] = {}
    for order_id, starts_at in rows:
        oid = int(order_id)
        if oid not in out and starts_at is not None:
            out[oid] = starts_at
    return out


def _visit_rows_query(
    *,
    tenant_id: int,
    equipment_id: int,
    client_id: int | None,
    preventive_only: bool = False,
):
    query = (
        select(
            ServiceOrder.closed_at,
            ServiceOrder.completed_at,
            ServiceOrder.started_at,
            ServiceOrder.opened_at,
            ServiceOrder.id,
            ServiceOrder.status,
            ServiceOrder.description,
            ServiceOrderServiceItem.id,
            Service.name,
            Service.periodicidade_meses,
            Service.service_category,
        )
        .select_from(ServiceOrderServiceItem)
        .join(ServiceOrder, ServiceOrder.id == ServiceOrderServiceItem.service_order_id)
        .join(Service, Service.id == ServiceOrderServiceItem.service_id)
        .where(
            ServiceOrder.tenant_id == tenant_id,
            ServiceOrderServiceItem.equipment_id == equipment_id,
            ServiceOrder.status.in_(EQUIPMENT_HISTORY_STATUSES),
        )
    )
    if preventive_only:
        query = query.where(preventive_sql_match())
    if client_id is not None:
        query = query.where(ServiceOrder.client_id == client_id)
    return query.order_by(ServiceOrder.opened_at.desc(), ServiceOrderServiceItem.id.desc())


def _build_visit_row(
    row: tuple,
    *,
    equipment_id: int,
    tech_by_order: dict[int, str],
    schedule_by_order: dict[int, datetime],
) -> EquipmentHistoryRowOut:
    (
        closed_at,
        completed_at,
        started_at,
        opened_at,
        order_id,
        order_status,
        description,
        item_id,
        service_name,
        periodicidade_meses,
        service_category,
    ) = row
    status = order_status if isinstance(order_status, OrderStatus) else OrderStatus(str(order_status))
    oid = int(order_id)
    schedule_starts = schedule_by_order.get(oid)
    occurred = history_occurred_at(
        status=status,
        closed_at=closed_at,
        completed_at=completed_at,
        started_at=started_at,
        opened_at=opened_at,
        schedule_starts_at=schedule_starts,
    )
    tech = tech_by_order.get(oid)
    tipo_raw = parse_tipo_servico(description)
    tipo_label = service_type_label(description)
    preventive = is_preventive_service_line(
        description, service_name, periodicidade_meses, service_category
    )
    checklist = [
        EquipmentChecklistItemOut(
            id=item.get("id"),
            descricao=item["descricao"],
            status=item["status"],
        )
        for item in parse_checklist_items(description)
    ]
    return EquipmentHistoryRowOut(
        changed_at=occurred,
        source=VISIT_SOURCE_BY_STATUS.get(status, "ordem_servico"),
        previous_equipment_id=None,
        new_equipment_id=equipment_id,
        service_order_id=oid,
        service_item_id=int(item_id),
        service_name=service_name,
        changed_by_user_id=None,
        changed_by_user_name=tech,
        service_order_number=str(oid),
        order_status=status.value,
        order_status_label=ORDER_STATUS_LABELS.get(status, status.value),
        service_type=tipo_label,
        order_tipo_servico=tipo_raw,
        technician_name=tech,
        checklist_items=checklist,
        is_preventive=preventive,
    )


def list_equipment_service_visits(
    db: Session,
    *,
    tenant_id: int,
    equipment_id: int,
    client_id: int | None = None,
    preventive_only: bool = False,
) -> list[EquipmentHistoryRowOut]:
    """Linhas de serviço vinculadas ao equipamento em OS ativas (não canceladas)."""
    visit_rows = db.execute(
        _visit_rows_query(
            tenant_id=tenant_id,
            equipment_id=equipment_id,
            client_id=client_id,
            preventive_only=preventive_only,
        )
    ).all()

    visit_order_ids = {int(row[4]) for row in visit_rows}
    tech_by_order = technician_names_by_order_ids(db, visit_order_ids)
    schedule_by_order = schedule_starts_by_order_ids(db, visit_order_ids)

    visit_out: list[EquipmentHistoryRowOut] = []
    for row in visit_rows:
        visit = _build_visit_row(
            row,
            equipment_id=equipment_id,
            tech_by_order=tech_by_order,
            schedule_by_order=schedule_by_order,
        )
        visit_out.append(visit)
    return visit_out


def list_equipment_preventive_visits(
    db: Session,
    *,
    tenant_id: int,
    equipment_id: int,
    client_id: int | None = None,
) -> list[EquipmentHistoryRowOut]:
    """Histórico de manutenções preventivas/PMOC do equipamento."""
    return list_equipment_service_visits(
        db,
        tenant_id=tenant_id,
        equipment_id=equipment_id,
        client_id=client_id,
        preventive_only=True,
    )
