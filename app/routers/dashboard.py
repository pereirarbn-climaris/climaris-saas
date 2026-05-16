from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.dashboard_kpis import (
    compute_dashboard_home_kpis,
    compute_dashboard_recent_orders,
    compute_dashboard_revenue_chart,
    month_datetime_bounds,
)
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.schemas import (
    DashboardHomeKpisOut,
    DashboardRecentOrderOut,
    DashboardRevenueChartOut,
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
