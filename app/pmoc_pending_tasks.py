"""Pendências de execução PMOC — equipamentos × cronograma do mês."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import extract, select
from sqlalchemy.orm import Session

from app.equipment_location import format_equipment_location_label
from app.pmoc_os_schedule import build_equipment_activity_matrix
from app.pmoc_schedule import compute_pmoc_estimated_time
from models import Equipment, PmocExecution, PmocExecutionCompletion, PmocPlanEquipment, Service


@dataclass
class PmocPendingTask:
    equipment_id: int
    equipment_label: str
    activity_id: int
    activity_title: str
    service_id: int | None
    service_name: str | None


@dataclass
class PmocPendingTasksResult:
    period_year: int
    period_month: int
    tasks: list[PmocPendingTask]


def _equipment_label(equipment_id: int, labels: dict[int, str]) -> str:
    return labels.get(equipment_id) or f"Equipamento #{equipment_id}"


def _build_equipment_labels(
    db: Session,
    pmoc_id: int,
) -> tuple[list[int], dict[int, str]]:
    rows = db.execute(
        select(PmocPlanEquipment, Equipment)
        .join(Equipment, Equipment.id == PmocPlanEquipment.equipment_id)
        .where(PmocPlanEquipment.pmoc_id == pmoc_id, Equipment.ativo.is_(True))
        .order_by(PmocPlanEquipment.sort_order, PmocPlanEquipment.id)
    ).all()

    equipment_ids: list[int] = []
    labels: dict[int, str] = {}
    for link, eq in rows:
        equipment_ids.append(link.equipment_id)
        labels[link.equipment_id] = format_equipment_location_label(
            identificacao=eq.identificacao if eq else None,
            local_instalacao=eq.local_instalacao if eq else None,
            installation_reference=eq.installation_reference if eq else None,
            equipment_id=link.equipment_id,
        )
    return equipment_ids, labels


def compute_pmoc_pending_tasks(
    db: Session,
    *,
    pmoc_id: int,
    tenant_id: int,
    year: int | None = None,
    month: int | None = None,
) -> PmocPendingTasksResult:
    today = date.today()
    period_year = year if year is not None else today.year
    period_month = month if month is not None else today.month

    equipment_ids, equipment_labels = _build_equipment_labels(db, pmoc_id)
    if not equipment_ids:
        return PmocPendingTasksResult(period_year=period_year, period_month=period_month, tasks=[])

    estimate = compute_pmoc_estimated_time(
        db,
        pmoc_id=pmoc_id,
        tenant_id=tenant_id,
        year=period_year,
        month=period_month,
    )
    breakdown_ids = {line.activity_id for line in estimate.breakdown}
    if not breakdown_ids:
        return PmocPendingTasksResult(period_year=period_year, period_month=period_month, tasks=[])

    from models import PmocScheduledActivity

    activities = db.execute(
        select(PmocScheduledActivity).where(PmocScheduledActivity.pmoc_id == pmoc_id)
    ).scalars().all()

    service_ids = {a.service_id for a in activities if a.service_id}
    services: dict[int, Service] = {}
    if service_ids:
        svc_rows = db.execute(
            select(Service).where(Service.tenant_id == tenant_id, Service.id.in_(service_ids))
        ).scalars().all()
        services = {s.id: s for s in svc_rows}

    cells = build_equipment_activity_matrix(
        selected_equipment_ids=equipment_ids,
        equipment_labels=equipment_labels,
        activities=activities,
        breakdown_activity_ids=breakdown_ids,
        services=services,
        month=period_month,
    )

    executions = db.execute(
        select(PmocExecution).where(
            PmocExecution.pmoc_id == pmoc_id,
            extract("year", PmocExecution.executed_at) == period_year,
            extract("month", PmocExecution.executed_at) == period_month,
            PmocExecution.completion_status == PmocExecutionCompletion.DONE,
        )
    ).scalars().all()

    completed: set[tuple[int, int]] = set()
    for ex in executions:
        if ex.scheduled_activity_id is None or ex.equipment_id is None:
            continue
        completed.add((ex.scheduled_activity_id, ex.equipment_id))

    tasks: list[PmocPendingTask] = []
    for cell in cells:
        if (cell.activity_id, cell.equipment_id) in completed:
            continue
        tasks.append(
            PmocPendingTask(
                equipment_id=cell.equipment_id,
                equipment_label=cell.equipment_label,
                activity_id=cell.activity_id,
                activity_title=cell.activity_title,
                service_id=cell.service_id,
                service_name=cell.service_name,
            )
        )

    return PmocPendingTasksResult(period_year=period_year, period_month=period_month, tasks=tasks)
