"""Relatório de eficiência — tempo estimado vs. tempo real."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.service_order_ops import get_total_duration_minutes
from models import OrderStatus, Schedule, ScheduleTechnician, Service, ServiceOrder, ServiceOrderTechnician


@dataclass
class TechnicianEfficiencyRow:
    technician_id: int
    technician_name: str
    orders_count: int
    estimated_minutes: int
    actual_minutes: int
    variance_pct: float


@dataclass
class ServiceEfficiencyRow:
    service_id: int
    service_name: str
    orders_count: int
    estimated_minutes: int
    actual_minutes: int
    variance_pct: float


@dataclass
class EfficiencyReport:
    by_technician: list[TechnicianEfficiencyRow]
    by_service: list[ServiceEfficiencyRow]


def _variance_pct(estimated: int, actual: int) -> float:
    if estimated <= 0:
        return 0.0 if actual <= 0 else 100.0
    return round(((actual - estimated) / estimated) * 100, 1)


def build_efficiency_report(db: Session, tenant_id: int) -> EfficiencyReport:
    orders = (
        db.execute(
            select(ServiceOrder)
            .where(
                ServiceOrder.tenant_id == tenant_id,
                ServiceOrder.status == OrderStatus.DONE,
                ServiceOrder.actual_duration_minutes.isnot(None),
            )
            .options(
                selectinload(ServiceOrder.service_items),
                selectinload(ServiceOrder.technicians).selectinload(ServiceOrderTechnician.technician),
                selectinload(ServiceOrder.schedules)
                .selectinload(Schedule.technicians)
                .selectinload(ScheduleTechnician.technician),
            )
        )
        .scalars()
        .all()
    )

    service_ids = {item.service_id for order in orders for item in order.service_items}
    service_names: dict[int, str] = {}
    if service_ids:
        rows = db.execute(select(Service.id, Service.name).where(Service.id.in_(service_ids))).all()
        service_names = {sid: name for sid, name in rows}

    tech_est: dict[int, int] = defaultdict(int)
    tech_act: dict[int, int] = defaultdict(int)
    tech_orders: dict[int, set[int]] = defaultdict(set)
    tech_names: dict[int, str] = {}

    svc_est: dict[int, int] = defaultdict(int)
    svc_act: dict[int, int] = defaultdict(int)
    svc_orders: dict[int, set[int]] = defaultdict(set)

    for order in orders:
        estimated = get_total_duration_minutes(order)
        actual = int(order.actual_duration_minutes or 0)
        if actual <= 0:
            continue

        tech_ids = order.technician_ids
        if tech_ids:
            share = actual // len(tech_ids)
            remainder = actual - share * len(tech_ids)
            for idx, tech_id in enumerate(tech_ids):
                line_act = share + (1 if idx < remainder else 0)
                est_share = estimated // len(tech_ids) if estimated > 0 else 0
                tech_est[tech_id] += est_share
                tech_act[tech_id] += line_act
                tech_orders[tech_id].add(order.id)
            if order.assigned_technician_name:
                for tech_id in tech_ids:
                    if tech_id not in tech_names:
                        parts = [p.strip() for p in order.assigned_technician_name.split(",") if p.strip()]
                        if len(parts) == len(tech_ids):
                            tech_names[tech_id] = parts[tech_ids.index(tech_id)]
                        elif parts:
                            tech_names[tech_id] = parts[0]
            for ot in order.technicians:
                u = ot.technician
                if u and u.full_name:
                    tech_names[ot.technician_id] = u.full_name.strip()

        if estimated <= 0:
            continue
        for item in order.service_items:
            line_est = max(int(item.quantity or 1), 1) * max(int(item.duration_minutes or 1), 1)
            share = line_est / estimated
            line_act = max(1, round(actual * share))
            svc_est[item.service_id] += line_est
            svc_act[item.service_id] += line_act
            svc_orders[item.service_id].add(order.id)

    by_technician = [
        TechnicianEfficiencyRow(
            technician_id=tid,
            technician_name=tech_names.get(tid) or f"Técnico #{tid}",
            orders_count=len(tech_orders[tid]),
            estimated_minutes=tech_est[tid],
            actual_minutes=tech_act[tid],
            variance_pct=_variance_pct(tech_est[tid], tech_act[tid]),
        )
        for tid in sorted(tech_est.keys())
    ]

    by_service = [
        ServiceEfficiencyRow(
            service_id=sid,
            service_name=service_names.get(sid) or f"Serviço #{sid}",
            orders_count=len(svc_orders[sid]),
            estimated_minutes=svc_est[sid],
            actual_minutes=svc_act[sid],
            variance_pct=_variance_pct(svc_est[sid], svc_act[sid]),
        )
        for sid in sorted(svc_est.keys(), key=lambda x: svc_act.get(x, 0), reverse=True)
    ]

    return EfficiencyReport(by_technician=by_technician, by_service=by_service)
