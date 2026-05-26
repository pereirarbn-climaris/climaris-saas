"""Cronograma PMOC — serviços do catálogo e tempo estimado."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models import Equipment, PmocActivityFrequency, PmocPlanEquipment, PmocScheduledActivity, Service


def activity_due_in_month(frequency: PmocActivityFrequency | str, month: int) -> bool:
    """Indica se a periodicidade cai no mês informado (1–12)."""
    freq = frequency.value if isinstance(frequency, PmocActivityFrequency) else str(frequency)
    if freq == PmocActivityFrequency.MONTHLY.value:
        return True
    if freq == PmocActivityFrequency.QUARTERLY.value:
        return month in (1, 4, 7, 10)
    if freq == PmocActivityFrequency.SEMIANNUAL.value:
        return month in (1, 7)
    if freq == PmocActivityFrequency.ANNUAL.value:
        return month == 1
    return True


def count_active_plan_equipments(db: Session, pmoc_id: int) -> int:
    total = db.execute(
        select(func.count())
        .select_from(PmocPlanEquipment)
        .join(Equipment, Equipment.id == PmocPlanEquipment.equipment_id)
        .where(PmocPlanEquipment.pmoc_id == pmoc_id, Equipment.ativo.is_(True))
    ).scalar_one()
    return int(total or 0)


@dataclass
class EstimatedTimeLine:
    activity_id: int
    title: str
    service_name: str | None
    minutes_per_unit: int
    occurrences: int
    total_minutes: int


@dataclass
class EstimatedTimeResult:
    total_minutes: int
    equipment_count: int
    activities_in_period: int
    period_year: int
    period_month: int
    breakdown: list[EstimatedTimeLine]


def compute_pmoc_estimated_time(
    db: Session,
    *,
    pmoc_id: int,
    tenant_id: int,
    year: int,
    month: int,
    equipment_ids: list[int] | None = None,
) -> EstimatedTimeResult:
    activities = db.execute(
        select(PmocScheduledActivity).where(PmocScheduledActivity.pmoc_id == pmoc_id)
    ).scalars().all()

    plan_equipment_ids = {
        row[0]
        for row in db.execute(
            select(PmocPlanEquipment.equipment_id)
            .join(Equipment, Equipment.id == PmocPlanEquipment.equipment_id)
            .where(PmocPlanEquipment.pmoc_id == pmoc_id, Equipment.ativo.is_(True))
        ).all()
    }

    if equipment_ids is not None:
        selected_ids = {eid for eid in equipment_ids if eid in plan_equipment_ids}
        equipment_count = len(selected_ids)
    else:
        selected_ids = None
        equipment_count = len(plan_equipment_ids)

    service_ids = {a.service_id for a in activities if a.service_id}
    services: dict[int, Service] = {}
    if service_ids:
        rows = db.execute(
            select(Service).where(Service.tenant_id == tenant_id, Service.id.in_(service_ids))
        ).scalars().all()
        services = {s.id: s for s in rows}

    breakdown: list[EstimatedTimeLine] = []
    total = 0

    for act in activities:
        if not activity_due_in_month(act.frequency, month):
            continue
        if act.service_id is None:
            continue
        svc = services.get(act.service_id)
        if svc is None:
            continue
        minutes = int(svc.duration_minutes or 0)
        if minutes <= 0:
            continue
        if act.equipment_id is None:
            occurrences = equipment_count
            if occurrences <= 0:
                continue
        else:
            if selected_ids is not None and act.equipment_id not in selected_ids:
                continue
            occurrences = 1
        line_total = minutes * occurrences
        total += line_total
        breakdown.append(
            EstimatedTimeLine(
                activity_id=act.id,
                title=act.title,
                service_name=svc.name,
                minutes_per_unit=minutes,
                occurrences=occurrences,
                total_minutes=line_total,
            )
        )

    return EstimatedTimeResult(
        total_minutes=total,
        equipment_count=equipment_count,
        activities_in_period=len(breakdown),
        period_year=year,
        period_month=month,
        breakdown=breakdown,
    )
