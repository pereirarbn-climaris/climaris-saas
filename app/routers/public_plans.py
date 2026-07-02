"""Planos SaaS — leitura pública para o site institucional (catálogo /operacao)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dashboard_entitlements import dashboard_tier_label
from app.schemas_public_plans import PublicPlanOut
from app.tenant_subscription import TRIAL_DAYS
from models import SaasPlanCatalog

router = APIRouter(prefix="/public/plans", tags=["public-plans"])

_FREE_TRIAL_PLAN_KEY = "free_30d"
_HIGHLIGHT_PLAN_KEY = "professional"

_FINANCE_LABELS: dict[str, str] = {
    "basic": "Financeiro básico",
    "intermediate": "Financeiro intermediário",
    "management": "Gestão financeira completa",
}


def _finance_label(mode: str) -> str:
    return _FINANCE_LABELS.get(mode, mode)


def _plan_to_public(row: SaasPlanCatalog) -> PublicPlanOut:
    is_trial = row.plan_key == _FREE_TRIAL_PLAN_KEY
    return PublicPlanOut(
        plan_key=row.plan_key,
        display_name=row.display_name,
        website_tier=row.display_name,
        description=(row.description or "").strip() or row.display_name,
        finance_max_mode=row.finance_max_mode,
        finance_label=_finance_label(row.finance_max_mode),
        dashboard_tier=(row.dashboard_tier or "basic").strip().lower(),
        dashboard_label=dashboard_tier_label((row.dashboard_tier or "basic").strip().lower()),
        max_users=row.max_users,
        monthly_price_brl=float(row.monthly_price_brl) if row.monthly_price_brl is not None else None,
        sort_order=row.sort_order,
        highlighted=row.plan_key == _HIGHLIGHT_PLAN_KEY,
        is_free_trial=is_trial,
        trial_days=TRIAL_DAYS if is_trial else None,
        cta="register" if is_trial else "lead",
    )


@router.get("", response_model=list[PublicPlanOut])
def list_public_plans(db: Annotated[Session, Depends(get_db)]) -> list[PublicPlanOut]:
    """Planos exibidos no site — espelha o catálogo com show_in_matrix no painel Operação."""
    rows = list(
        db.execute(
            select(SaasPlanCatalog)
            .where(
                SaasPlanCatalog.is_beta_internal.is_(False),
                SaasPlanCatalog.show_in_matrix.is_(True),
            )
            .order_by(SaasPlanCatalog.sort_order.asc(), SaasPlanCatalog.plan_key.asc())
        )
        .scalars()
        .all()
    )
    return [_plan_to_public(row) for row in rows]
