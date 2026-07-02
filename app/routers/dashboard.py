from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.dashboard_entitlements import (
    dashboard_tier_rank,
    effective_dashboard_tier,
    dashboard_tier_payload,
)
from app.dashboard_kpis import (
    compute_dashboard_extended_kpis,
    compute_dashboard_home_kpis,
    compute_dashboard_recent_orders,
    compute_dashboard_revenue_chart,
    compute_financial_snapshot,
    compute_order_status_breakdown,
    compute_pmoc_operations_summary,
    compute_technician_workload,
    compute_upcoming_schedules,
    month_datetime_bounds,
)
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.schemas import (
    DashboardExtendedKpisOut,
    DashboardFinancialSnapshotOut,
    DashboardHomeKpisOut,
    DashboardOrderStatusBreakdownItemOut,
    DashboardPmocSummaryOut,
    DashboardRecentOrderOut,
    DashboardRevenueChartOut,
    DashboardTechnicianWorkloadOut,
    DashboardTierOut,
    DashboardUpcomingScheduleOut,
)
from models import Tenant, User, UserRole

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

_DASHBOARD_ROLES = [Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))]


def _get_tenant_or_404(db: Session, tenant_id: int) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace não encontrado.")
    return tenant


def _validate_optional_period(year: int | None, month: int | None) -> None:
    if (year is None) ^ (month is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe year e month juntos ou omita ambos para usar o mês atual.",
        )
    if year is not None and month is not None:
        try:
            month_datetime_bounds(year, month)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get(
    "/tier",
    response_model=DashboardTierOut,
    dependencies=_DASHBOARD_ROLES,
)
def get_dashboard_tier(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> DashboardTierOut:
    """Nível do dashboard gerencial conforme o plano do workspace."""
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    return DashboardTierOut(**dashboard_tier_payload(db, tenant))


@router.get(
    "/extended-kpis",
    response_model=DashboardExtendedKpisOut,
    dependencies=_DASHBOARD_ROLES,
)
def get_dashboard_extended_kpis(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
) -> DashboardExtendedKpisOut:
    """KPIs operacionais ampliados (Avançado e Completo)."""
    _validate_optional_period(year, month)
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    if dashboard_tier_rank(effective_dashboard_tier(db, tenant)) < dashboard_tier_rank("advanced"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Indicadores ampliados disponíveis no dashboard Avançado ou Completo.",
        )
    payload = compute_dashboard_extended_kpis(db, tenant, year=year, month=month)
    return DashboardExtendedKpisOut(**payload)


@router.get(
    "/order-breakdown",
    response_model=list[DashboardOrderStatusBreakdownItemOut],
    dependencies=_DASHBOARD_ROLES,
)
def get_dashboard_order_breakdown(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[DashboardOrderStatusBreakdownItemOut]:
    """Distribuição de ordens de serviço por status (Avançado e Completo)."""
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    if dashboard_tier_rank(effective_dashboard_tier(db, tenant)) < dashboard_tier_rank("advanced"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Distribuição de OS disponível no dashboard Avançado ou Completo.",
        )
    items = compute_order_status_breakdown(db, current_user.tenant_id)
    return [DashboardOrderStatusBreakdownItemOut(**row) for row in items]


@router.get(
    "/upcoming-schedules",
    response_model=list[DashboardUpcomingScheduleOut],
    dependencies=_DASHBOARD_ROLES,
)
def get_dashboard_upcoming_schedules(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
) -> list[DashboardUpcomingScheduleOut]:
    """Próximos agendamentos da operação (Avançado e Completo)."""
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    if dashboard_tier_rank(effective_dashboard_tier(db, tenant)) < dashboard_tier_rank("advanced"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agenda futura disponível no dashboard Avançado ou Completo.",
        )
    items = compute_upcoming_schedules(db, current_user.tenant_id, limit=limit)
    return [DashboardUpcomingScheduleOut(**row) for row in items]


@router.get(
    "/financial-snapshot",
    response_model=DashboardFinancialSnapshotOut,
    dependencies=_DASHBOARD_ROLES,
)
def get_dashboard_financial_snapshot(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> DashboardFinancialSnapshotOut:
    """Posição financeira resumida (Completo)."""
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    if dashboard_tier_rank(effective_dashboard_tier(db, tenant)) < dashboard_tier_rank("complete"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Resumo financeiro disponível no dashboard Completo.",
        )
    return DashboardFinancialSnapshotOut(**compute_financial_snapshot(db, tenant))


@router.get(
    "/pmoc-summary",
    response_model=DashboardPmocSummaryOut,
    dependencies=_DASHBOARD_ROLES,
)
def get_dashboard_pmoc_summary(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> DashboardPmocSummaryOut:
    """Resumo PMOC para painel executivo (Completo)."""
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    if dashboard_tier_rank(effective_dashboard_tier(db, tenant)) < dashboard_tier_rank("complete"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Resumo PMOC disponível no dashboard Completo.",
        )
    return DashboardPmocSummaryOut(**compute_pmoc_operations_summary(db, current_user.tenant_id))


@router.get(
    "/technician-workload",
    response_model=list[DashboardTechnicianWorkloadOut],
    dependencies=_DASHBOARD_ROLES,
)
def get_dashboard_technician_workload(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[DashboardTechnicianWorkloadOut]:
    """Carga de agendamentos por técnico no dia (Completo)."""
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    if dashboard_tier_rank(effective_dashboard_tier(db, tenant)) < dashboard_tier_rank("complete"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Carga da equipe disponível no dashboard Completo.",
        )
    items = compute_technician_workload(db, current_user.tenant_id)
    return [DashboardTechnicianWorkloadOut(**row) for row in items]


@router.get(
    "/home-kpis",
    response_model=DashboardHomeKpisOut,
    dependencies=_DASHBOARD_ROLES,
)
def get_dashboard_home_kpis(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
) -> DashboardHomeKpisOut:
    """
    KPIs consolidados do painel inicial (mês corrente por padrão).

    - **active_service_orders**: OS com status diferente de concluída (`done`) ou cancelada (`cancelled`).
    - **active_clients**: clientes com `is_active=true`.
    - **monthly_revenue**: receitas financeiras pagas no período + OS concluídas sem lançamento vinculado.
    - **average_service_minutes**: média entre `opened_at` e `closed_at` das OS concluídas no período
      (com fallback aos últimos 90 dias se não houver amostra no mês).
    """
    _validate_optional_period(year, month)
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    payload = compute_dashboard_home_kpis(db, tenant, year=year, month=month)
    return DashboardHomeKpisOut(**payload)


@router.get(
    "/revenue-chart",
    response_model=DashboardRevenueChartOut,
    dependencies=_DASHBOARD_ROLES,
)
def get_dashboard_revenue_chart(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    months: Annotated[int, Query(ge=2, le=12, description="Quantidade de meses na série")] = 6,
    end_year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    end_month: Annotated[int | None, Query(ge=1, le=12)] = None,
) -> DashboardRevenueChartOut:
    """
    Série de faturamento mensal consolidado (últimos N meses por padrão).

    Cada ponto inclui receita real (sem dupla contagem) e meta dinâmica proporcional ao histórico.
    """
    _validate_optional_period(end_year, end_month)
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    payload = compute_dashboard_revenue_chart(
        db,
        tenant,
        months=months,
        end_year=end_year,
        end_month=end_month,
    )
    return DashboardRevenueChartOut(**payload)


@router.get(
    "/recent-orders",
    response_model=list[DashboardRecentOrderOut],
    dependencies=_DASHBOARD_ROLES,
)
def get_dashboard_recent_orders(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=20, description="Quantidade de ordens recentes")] = 5,
) -> list[DashboardRecentOrderOut]:
    """Últimas ordens de serviço cadastradas no workspace (mais recentes por opened_at)."""
    _get_tenant_or_404(db, current_user.tenant_id)
    items = compute_dashboard_recent_orders(db, current_user.tenant_id, limit=limit)
    return [DashboardRecentOrderOut(**row) for row in items]
