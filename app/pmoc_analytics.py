"""Analytics avançado do PMOC baseado em dados normalizados."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from models import (
    PmocEnvironment,
    PmocExecution,
    PmocExecutionCompletion,
    PmocExecutionConsumable,
    PmocExecutionMeasurement,
    PmocOccurrence,
    PmocOccurrenceStatus,
    PmocEnvironmentEquipment,
    PmocPlan,
    PmocPlanStatus,
    Client,
)


@dataclass
class PmocTopConsumableResult:
    name: str
    usage_count: int
    traceable_count: int


@dataclass
class PmocAnalyticsSummaryResult:
    pmoc_id: int
    generated_at: datetime
    total_executions: int
    done_executions: int
    executions_with_measurements: int
    executions_with_consumables: int
    measurement_coverage_pct: int
    consumable_traceability_pct: int
    avg_delta_t_c: float | None
    avg_current_a: float | None
    avg_co2_ppm: float | None
    total_consumables_used: int
    top_consumables: list[PmocTopConsumableResult]
    environments_count: int
    environments_linked_equipment_count: int
    unresolved_occurrences: int


@dataclass
class PmocPortfolioClientRankResult:
    client_id: int
    client_name: str
    plans_count: int
    avg_conformity_score: int
    open_occurrences: int


@dataclass
class PmocPortfolioPlanRankResult:
    pmoc_id: int
    pmoc_title: str
    client_name: str
    establishment_name: str
    status: str
    conformity_score: int
    measurement_coverage_pct: int
    consumable_traceability_pct: int
    open_occurrences: int


@dataclass
class PmocPortfolioSummaryResult:
    generated_at: datetime
    total_plans: int
    active_plans: int
    avg_conformity_score: int
    critical_plans_count: int
    total_open_occurrences: int
    client_ranking: list[PmocPortfolioClientRankResult]
    plan_ranking: list[PmocPortfolioPlanRankResult]


def _round_or_none(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 2)


def _avg_metric(db: Session, *, pmoc_id: int, metric_key: str) -> float | None:
    value = db.execute(
        select(func.avg(PmocExecutionMeasurement.value_numeric))
        .join(PmocExecution, PmocExecution.id == PmocExecutionMeasurement.pmoc_execution_id)
        .where(
            PmocExecution.pmoc_id == pmoc_id,
            PmocExecutionMeasurement.metric_key == metric_key,
            PmocExecutionMeasurement.value_numeric.isnot(None),
        )
    ).scalar_one()
    return float(value) if value is not None else None


def _safe_establishment_name(snapshot_json: str | None) -> str:
    if not snapshot_json:
        return "Unidade não informada"
    try:
        payload = json.loads(snapshot_json)
    except Exception:
        return "Unidade não informada"
    if not isinstance(payload, dict):
        return "Unidade não informada"
    raw = payload.get("site_name")
    return str(raw).strip() if isinstance(raw, str) and raw.strip() else "Unidade não informada"


def _pct(covered: int, total: int, *, empty_as_100: bool = False) -> int:
    if total <= 0:
        return 100 if empty_as_100 else 0
    return min(100, round((covered / total) * 100))


def _conformity_score(
    *,
    measurement_coverage_pct: int,
    consumable_traceability_pct: int,
    done_executions: int,
    total_executions: int,
    open_occurrences: int,
) -> int:
    execution_quality_pct = _pct(done_executions, total_executions)
    occurrence_quality_pct = max(0, 100 - (open_occurrences * 20))
    score = (
        (measurement_coverage_pct * 0.35)
        + (consumable_traceability_pct * 0.30)
        + (execution_quality_pct * 0.20)
        + (occurrence_quality_pct * 0.15)
    )
    return int(round(score))


def compute_pmoc_analytics_summary(db: Session, *, pmoc_id: int) -> PmocAnalyticsSummaryResult:
    total_executions = int(
        db.execute(select(func.count()).select_from(PmocExecution).where(PmocExecution.pmoc_id == pmoc_id)).scalar_one()
        or 0
    )
    done_executions = int(
        db.execute(
            select(func.count())
            .select_from(PmocExecution)
            .where(
                PmocExecution.pmoc_id == pmoc_id,
                PmocExecution.completion_status == PmocExecutionCompletion.DONE,
            )
        ).scalar_one()
        or 0
    )
    executions_with_measurements = int(
        db.execute(
            select(func.count(func.distinct(PmocExecutionMeasurement.pmoc_execution_id)))
            .join(PmocExecution, PmocExecution.id == PmocExecutionMeasurement.pmoc_execution_id)
            .where(PmocExecution.pmoc_id == pmoc_id)
        ).scalar_one()
        or 0
    )
    executions_with_consumables = int(
        db.execute(
            select(func.count(func.distinct(PmocExecutionConsumable.pmoc_execution_id)))
            .join(PmocExecution, PmocExecution.id == PmocExecutionConsumable.pmoc_execution_id)
            .where(PmocExecution.pmoc_id == pmoc_id)
        ).scalar_one()
        or 0
    )

    measurement_coverage_pct = (
        0 if total_executions <= 0 else min(100, round((executions_with_measurements / total_executions) * 100))
    )

    total_consumables_used = int(
        db.execute(
            select(func.count())
            .select_from(PmocExecutionConsumable)
            .join(PmocExecution, PmocExecution.id == PmocExecutionConsumable.pmoc_execution_id)
            .where(PmocExecution.pmoc_id == pmoc_id)
        ).scalar_one()
        or 0
    )
    traceable_consumables = int(
        db.execute(
            select(func.count())
            .select_from(PmocExecutionConsumable)
            .join(PmocExecution, PmocExecution.id == PmocExecutionConsumable.pmoc_execution_id)
            .where(
                PmocExecution.pmoc_id == pmoc_id,
                PmocExecutionConsumable.lot_number.isnot(None),
                PmocExecutionConsumable.validity_date.isnot(None),
            )
        ).scalar_one()
        or 0
    )
    consumable_traceability_pct = (
        100
        if total_consumables_used <= 0
        else min(100, round((traceable_consumables / total_consumables_used) * 100))
    )

    top_rows = db.execute(
        select(
            PmocExecutionConsumable.name.label("name"),
            func.count(PmocExecutionConsumable.id).label("usage_count"),
            func.sum(
                case(
                    (
                        (PmocExecutionConsumable.lot_number.isnot(None))
                        & (PmocExecutionConsumable.validity_date.isnot(None)),
                        1,
                    ),
                    else_=0,
                )
            ).label("traceable_count"),
        )
        .join(PmocExecution, PmocExecution.id == PmocExecutionConsumable.pmoc_execution_id)
        .where(PmocExecution.pmoc_id == pmoc_id)
        .group_by(PmocExecutionConsumable.name)
        .order_by(func.count(PmocExecutionConsumable.id).desc(), PmocExecutionConsumable.name.asc())
        .limit(5)
    ).all()
    top_consumables = [
        PmocTopConsumableResult(
            name=str(row.name),
            usage_count=int(row.usage_count or 0),
            traceable_count=int(row.traceable_count or 0),
        )
        for row in top_rows
    ]

    environments_count = int(
        db.execute(select(func.count()).select_from(PmocEnvironment).where(PmocEnvironment.pmoc_id == pmoc_id)).scalar_one()
        or 0
    )
    environments_linked_equipment_count = int(
        db.execute(
            select(func.count(func.distinct(PmocEnvironment.id)))
            .select_from(PmocEnvironment)
            .outerjoin(
                PmocEnvironmentEquipment,
                PmocEnvironmentEquipment.pmoc_environment_id == PmocEnvironment.id,
            )
            .where(
                PmocEnvironment.pmoc_id == pmoc_id,
                (PmocEnvironment.equipment_id.isnot(None)) | (PmocEnvironmentEquipment.id.isnot(None)),
            )
        ).scalar_one()
        or 0
    )

    unresolved_occurrences = int(
        db.execute(
            select(func.count())
            .select_from(PmocOccurrence)
            .where(
                PmocOccurrence.pmoc_id == pmoc_id,
                PmocOccurrence.status == PmocOccurrenceStatus.OPEN,
            )
        ).scalar_one()
        or 0
    )

    return PmocAnalyticsSummaryResult(
        pmoc_id=pmoc_id,
        generated_at=datetime.now(timezone.utc),
        total_executions=total_executions,
        done_executions=done_executions,
        executions_with_measurements=executions_with_measurements,
        executions_with_consumables=executions_with_consumables,
        measurement_coverage_pct=measurement_coverage_pct,
        consumable_traceability_pct=consumable_traceability_pct,
        avg_delta_t_c=_round_or_none(_avg_metric(db, pmoc_id=pmoc_id, metric_key="delta_t_c")),
        avg_current_a=_round_or_none(_avg_metric(db, pmoc_id=pmoc_id, metric_key="current_a")),
        avg_co2_ppm=_round_or_none(_avg_metric(db, pmoc_id=pmoc_id, metric_key="co2_ppm")),
        total_consumables_used=total_consumables_used,
        top_consumables=top_consumables,
        environments_count=environments_count,
        environments_linked_equipment_count=environments_linked_equipment_count,
        unresolved_occurrences=unresolved_occurrences,
    )


def compute_pmoc_portfolio_summary(
    db: Session,
    *,
    tenant_id: int,
    status_filter: PmocPlanStatus | None = None,
    client_rank_limit: int = 8,
    plan_rank_limit: int = 12,
) -> PmocPortfolioSummaryResult:
    plans_query = (
        select(
            PmocPlan.id.label("pmoc_id"),
            PmocPlan.title.label("pmoc_title"),
            PmocPlan.status.label("status"),
            PmocPlan.establishment_snapshot_json.label("snapshot_json"),
            Client.id.label("client_id"),
            Client.name.label("client_name"),
            Client.trade_name.label("client_trade_name"),
        )
        .join(Client, Client.id == PmocPlan.client_id)
        .where(PmocPlan.tenant_id == tenant_id)
    )
    if status_filter is not None:
        plans_query = plans_query.where(PmocPlan.status == status_filter)
    plan_rows = db.execute(plans_query.order_by(PmocPlan.id.desc())).all()
    plan_ids = [int(row.pmoc_id) for row in plan_rows]

    if not plan_ids:
        return PmocPortfolioSummaryResult(
            generated_at=datetime.now(timezone.utc),
            total_plans=0,
            active_plans=0,
            avg_conformity_score=0,
            critical_plans_count=0,
            total_open_occurrences=0,
            client_ranking=[],
            plan_ranking=[],
        )

    total_exec_by_plan = {
        int(row.pmoc_id): int(row.total_count or 0)
        for row in db.execute(
            select(
                PmocExecution.pmoc_id.label("pmoc_id"),
                func.count(PmocExecution.id).label("total_count"),
            )
            .where(PmocExecution.pmoc_id.in_(plan_ids))
            .group_by(PmocExecution.pmoc_id)
        ).all()
    }
    done_exec_by_plan = {
        int(row.pmoc_id): int(row.done_count or 0)
        for row in db.execute(
            select(
                PmocExecution.pmoc_id.label("pmoc_id"),
                func.count(PmocExecution.id).label("done_count"),
            )
            .where(
                PmocExecution.pmoc_id.in_(plan_ids),
                PmocExecution.completion_status == PmocExecutionCompletion.DONE,
            )
            .group_by(PmocExecution.pmoc_id)
        ).all()
    }
    measured_exec_by_plan = {
        int(row.pmoc_id): int(row.measured_count or 0)
        for row in db.execute(
            select(
                PmocExecution.pmoc_id.label("pmoc_id"),
                func.count(func.distinct(PmocExecutionMeasurement.pmoc_execution_id)).label("measured_count"),
            )
            .join(PmocExecution, PmocExecution.id == PmocExecutionMeasurement.pmoc_execution_id)
            .where(PmocExecution.pmoc_id.in_(plan_ids))
            .group_by(PmocExecution.pmoc_id)
        ).all()
    }
    consumables_by_plan = {
        int(row.pmoc_id): int(row.total_count or 0)
        for row in db.execute(
            select(
                PmocExecution.pmoc_id.label("pmoc_id"),
                func.count(PmocExecutionConsumable.id).label("total_count"),
            )
            .join(PmocExecution, PmocExecution.id == PmocExecutionConsumable.pmoc_execution_id)
            .where(PmocExecution.pmoc_id.in_(plan_ids))
            .group_by(PmocExecution.pmoc_id)
        ).all()
    }
    traceable_consumables_by_plan = {
        int(row.pmoc_id): int(row.traceable_count or 0)
        for row in db.execute(
            select(
                PmocExecution.pmoc_id.label("pmoc_id"),
                func.count(PmocExecutionConsumable.id).label("traceable_count"),
            )
            .join(PmocExecution, PmocExecution.id == PmocExecutionConsumable.pmoc_execution_id)
            .where(
                PmocExecution.pmoc_id.in_(plan_ids),
                PmocExecutionConsumable.lot_number.isnot(None),
                PmocExecutionConsumable.validity_date.isnot(None),
            )
            .group_by(PmocExecution.pmoc_id)
        ).all()
    }
    open_occurrences_by_plan = {
        int(row.pmoc_id): int(row.open_count or 0)
        for row in db.execute(
            select(
                PmocOccurrence.pmoc_id.label("pmoc_id"),
                func.count(PmocOccurrence.id).label("open_count"),
            )
            .where(
                PmocOccurrence.pmoc_id.in_(plan_ids),
                PmocOccurrence.status == PmocOccurrenceStatus.OPEN,
            )
            .group_by(PmocOccurrence.pmoc_id)
        ).all()
    }

    plan_scores: list[PmocPortfolioPlanRankResult] = []
    client_acc: dict[int, dict[str, int | str]] = {}
    score_sum = 0
    critical_count = 0
    open_occurrences_sum = 0
    active_count = 0

    for row in plan_rows:
        pmoc_id = int(row.pmoc_id)
        status_value = row.status.value if isinstance(row.status, PmocPlanStatus) else str(row.status)
        if status_value == PmocPlanStatus.ACTIVE.value:
            active_count += 1

        total_executions = total_exec_by_plan.get(pmoc_id, 0)
        done_executions = done_exec_by_plan.get(pmoc_id, 0)
        measured_executions = measured_exec_by_plan.get(pmoc_id, 0)
        total_consumables = consumables_by_plan.get(pmoc_id, 0)
        traceable_consumables = traceable_consumables_by_plan.get(pmoc_id, 0)
        open_occurrences = open_occurrences_by_plan.get(pmoc_id, 0)

        measurement_pct = _pct(measured_executions, total_executions)
        traceability_pct = _pct(traceable_consumables, total_consumables, empty_as_100=True)
        conformity_score = _conformity_score(
            measurement_coverage_pct=measurement_pct,
            consumable_traceability_pct=traceability_pct,
            done_executions=done_executions,
            total_executions=total_executions,
            open_occurrences=open_occurrences,
        )

        if conformity_score < 70 or open_occurrences >= 3:
            critical_count += 1
        score_sum += conformity_score
        open_occurrences_sum += open_occurrences

        client_id = int(row.client_id)
        client_name = str(row.client_trade_name or row.client_name or f"Cliente #{client_id}")
        client_bucket = client_acc.setdefault(
            client_id,
            {"client_name": client_name, "plans_count": 0, "score_sum": 0, "open_occurrences": 0},
        )
        client_bucket["plans_count"] = int(client_bucket["plans_count"]) + 1
        client_bucket["score_sum"] = int(client_bucket["score_sum"]) + conformity_score
        client_bucket["open_occurrences"] = int(client_bucket["open_occurrences"]) + open_occurrences

        plan_scores.append(
            PmocPortfolioPlanRankResult(
                pmoc_id=pmoc_id,
                pmoc_title=str(row.pmoc_title),
                client_name=client_name,
                establishment_name=_safe_establishment_name(row.snapshot_json),
                status=status_value,
                conformity_score=conformity_score,
                measurement_coverage_pct=measurement_pct,
                consumable_traceability_pct=traceability_pct,
                open_occurrences=open_occurrences,
            )
        )

    client_ranking = sorted(
        [
            PmocPortfolioClientRankResult(
                client_id=client_id,
                client_name=str(meta["client_name"]),
                plans_count=int(meta["plans_count"]),
                avg_conformity_score=round(int(meta["score_sum"]) / max(1, int(meta["plans_count"]))),
                open_occurrences=int(meta["open_occurrences"]),
            )
            for client_id, meta in client_acc.items()
        ],
        key=lambda row: (row.avg_conformity_score, -row.open_occurrences, row.client_name.lower()),
    )[: max(1, client_rank_limit)]
    plan_ranking = sorted(
        plan_scores,
        key=lambda row: (row.conformity_score, -row.open_occurrences, row.client_name.lower(), row.establishment_name.lower()),
    )[: max(1, plan_rank_limit)]

    total_plans = len(plan_rows)
    avg_conformity_score = round(score_sum / max(1, total_plans))
    return PmocPortfolioSummaryResult(
        generated_at=datetime.now(timezone.utc),
        total_plans=total_plans,
        active_plans=active_count,
        avg_conformity_score=avg_conformity_score,
        critical_plans_count=critical_count,
        total_open_occurrences=open_occurrences_sum,
        client_ranking=client_ranking,
        plan_ranking=plan_ranking,
    )
