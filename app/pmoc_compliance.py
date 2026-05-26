"""Indicadores de conformidade PMOC (semáforo verde/amarelo/vermelho)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from sqlalchemy.orm import Session

from app.pmoc_pending_tasks import compute_pmoc_pending_tasks
from models import PmocAirQualityAnalysis, PmocPlan

ComplianceTrafficLight = Literal["green", "yellow", "red"]


@dataclass
class ComplianceIndicatorOut:
    key: str
    label: str
    status: ComplianceTrafficLight
    summary: str
    detail: str | None = None


@dataclass
class PmocComplianceSummaryResult:
    pmoc_id: int
    overall_status: ComplianceTrafficLight
    indicators: list[ComplianceIndicatorOut]
    monthly_execution_pct: int
    open_occurrences: int


def _art_indicator(plan: PmocPlan, today: date) -> ComplianceIndicatorOut:
    if not (plan.art_number or "").strip():
        return ComplianceIndicatorOut(
            key="art",
            label="Validade da ART",
            status="red",
            summary="ART não registrada",
            detail="Informe número, data de emissão e anexe o PDF da ART no plano PMOC.",
        )
    issued = plan.art_issued_at
    if issued is None:
        return ComplianceIndicatorOut(
            key="art",
            label="Validade da ART",
            status="yellow",
            summary="Data de emissão pendente",
            detail=f"ART nº {plan.art_number.strip()} — informe a data de emissão.",
        )
    expires = issued + timedelta(days=365)
    days_left = (expires - today).days
    has_pdf = bool((plan.art_file_url or "").strip())
    if days_left < 0:
        return ComplianceIndicatorOut(
            key="art",
            label="Validade da ART",
            status="red",
            summary="ART vencida",
            detail=f"Venceu em {expires.strftime('%d/%m/%Y')}. Renove a ART junto ao conselho.",
        )
    if days_left <= 30:
        return ComplianceIndicatorOut(
            key="art",
            label="Validade da ART",
            status="yellow",
            summary=f"Vence em {days_left} dia(s)",
            detail=f"Validade estimada: {expires.strftime('%d/%m/%Y')}.",
        )
    if not has_pdf:
        return ComplianceIndicatorOut(
            key="art",
            label="Validade da ART",
            status="yellow",
            summary="PDF da ART pendente",
            detail=f"ART nº {plan.art_number.strip()} emitida em {issued.strftime('%d/%m/%Y')}.",
        )
    return ComplianceIndicatorOut(
        key="art",
        label="Validade da ART",
        status="green",
        summary="ART em dia",
        detail=f"Validade estimada até {expires.strftime('%d/%m/%Y')}.",
    )


def _air_analysis_indicator(
    plan: PmocPlan,
    analyses: list[PmocAirQualityAnalysis],
    today: date,
) -> ComplianceIndicatorOut:
    if not plan.air_analysis_required:
        return ComplianceIndicatorOut(
            key="air_quality",
            label="Análise de Qualidade do Ar",
            status="green",
            summary="Não exigida para este plano",
            detail="Carga térmica abaixo do limite que exige análise periódica.",
        )

    due: date | None = plan.next_air_analysis_due
    if analyses:
        latest = max(analyses, key=lambda row: row.analysis_date)
        if latest.next_due_date:
            due = latest.next_due_date

    if due is None:
        return ComplianceIndicatorOut(
            key="air_quality",
            label="Análise de Qualidade do Ar",
            status="red",
            summary="Análise não registrada",
            detail="Plano exige análise de qualidade do ar — cadastre o laudo laboratorial.",
        )

    days_left = (due - today).days
    last_label = analyses[0].analysis_date.strftime("%d/%m/%Y") if analyses else "—"
    if days_left < 0:
        return ComplianceIndicatorOut(
            key="air_quality",
            label="Análise de Qualidade do Ar",
            status="red",
            summary="Análise vencida",
            detail=f"Última: {last_label}. Vencimento: {due.strftime('%d/%m/%Y')}.",
        )
    if days_left <= 45:
        return ComplianceIndicatorOut(
            key="air_quality",
            label="Análise de Qualidade do Ar",
            status="yellow",
            summary=f"Vence em {days_left} dia(s)",
            detail=f"Próximo vencimento: {due.strftime('%d/%m/%Y')}.",
        )
    return ComplianceIndicatorOut(
        key="air_quality",
        label="Análise de Qualidade do Ar",
        status="green",
        summary="Análise em dia",
        detail=f"Última: {last_label}. Próximo vencimento: {due.strftime('%d/%m/%Y')}.",
    )


def _execution_indicator(monthly_pct: int) -> ComplianceIndicatorOut:
    if monthly_pct >= 90:
        status: ComplianceTrafficLight = "green"
        summary = f"{monthly_pct}% executado"
    elif monthly_pct >= 70:
        status = "yellow"
        summary = f"{monthly_pct}% executado — atenção"
    else:
        status = "red"
        summary = f"{monthly_pct}% executado — crítico"
    return ComplianceIndicatorOut(
        key="monthly_execution",
        label="Execução do cronograma (mês)",
        status=status,
        summary=summary,
        detail="Percentual de atividades previstas no mês já comprovadas ou agendadas.",
    )


def _worst_status(statuses: list[ComplianceTrafficLight]) -> ComplianceTrafficLight:
    if "red" in statuses:
        return "red"
    if "yellow" in statuses:
        return "yellow"
    return "green"


def compute_pmoc_compliance_summary(
    db: Session,
    *,
    pmoc_id: int,
    tenant_id: int,
    open_occurrences: int = 0,
) -> PmocComplianceSummaryResult:
    plan = db.get(PmocPlan, pmoc_id)
    if plan is None or plan.tenant_id != tenant_id:
        raise ValueError("PMOC não encontrado.")

    today = date.today()
    pending = compute_pmoc_pending_tasks(db, pmoc_id=pmoc_id, tenant_id=tenant_id)
    pending_count = len(pending.tasks)
    from sqlalchemy import extract, select

    from models import PmocExecution, PmocExecutionCompletion

    done_count = db.execute(
        select(PmocExecution).where(
            PmocExecution.pmoc_id == pmoc_id,
            extract("year", PmocExecution.executed_at) == pending.period_year,
            extract("month", PmocExecution.executed_at) == pending.period_month,
            PmocExecution.completion_status == PmocExecutionCompletion.DONE,
            PmocExecution.scheduled_activity_id.isnot(None),
            PmocExecution.equipment_id.isnot(None),
        )
    ).scalars().all()
    completed_pairs = len({(ex.scheduled_activity_id, ex.equipment_id) for ex in done_count})
    total_expected = completed_pairs + pending_count
    monthly_pct = 100 if total_expected <= 0 else min(100, round(completed_pairs / total_expected * 100))

    analyses = list(plan.air_quality_analyses or [])
    indicators = [
        _art_indicator(plan, today),
        _air_analysis_indicator(plan, analyses, today),
        _execution_indicator(monthly_pct),
    ]
    overall = _worst_status([i.status for i in indicators])
    if open_occurrences > 0 and overall == "green":
        overall = "yellow"

    return PmocComplianceSummaryResult(
        pmoc_id=pmoc_id,
        overall_status=overall,
        indicators=indicators,
        monthly_execution_pct=monthly_pct,
        open_occurrences=open_occurrences,
    )
