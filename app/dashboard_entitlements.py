"""Nível do dashboard gerencial por plano (Básico / Avançado / Completo)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.plan_rules import normalize_plan_key
from app.saas_plan_effective import effective_finance_max_mode
from models import SaasPlanCatalog, Tenant

DashboardTier = str  # "basic" | "advanced" | "complete"

_TIER_RANK: dict[str, int] = {"basic": 0, "advanced": 1, "complete": 2}

_FINANCE_MODE_TO_TIER: dict[str, DashboardTier] = {
    "basic": "basic",
    "intermediate": "advanced",
    "management": "complete",
}

_TIER_LABELS: dict[DashboardTier, str] = {
    "basic": "Básico",
    "advanced": "Avançado",
    "complete": "Completo",
}

_TIER_DESCRIPTIONS: dict[DashboardTier, str] = {
    "basic": "Indicadores essenciais da operação: OS, clientes e faturamento.",
    "advanced": "Visão ampliada com agenda, orçamentos, metas e distribuição de OS.",
    "complete": "Painel executivo com financeiro, PMOC, conversão e resumo gerencial.",
}


def dashboard_tier_rank(tier: DashboardTier) -> int:
    return _TIER_RANK.get(tier, 0)


def dashboard_tier_from_finance_mode(max_mode: str) -> DashboardTier:
    return _FINANCE_MODE_TO_TIER.get((max_mode or "basic").strip().lower(), "basic")


def effective_dashboard_tier(db: Session, tenant: Tenant) -> DashboardTier:
    """Resolve o nível do dashboard pelo catálogo do plano (ou fallback no teto financeiro)."""
    key = normalize_plan_key(tenant.active_plan)
    if key == "beta_internal":
        return "complete"
    row = db.get(SaasPlanCatalog, key)
    if row is not None:
        tier = (row.dashboard_tier or "").strip().lower()
        if tier in _TIER_RANK:
            return tier
    return dashboard_tier_from_finance_mode(effective_finance_max_mode(db, tenant))


def dashboard_tier_label(tier: DashboardTier) -> str:
    return _TIER_LABELS.get(tier, "Básico")


def dashboard_tier_description(tier: DashboardTier) -> str:
    return _TIER_DESCRIPTIONS.get(tier, _TIER_DESCRIPTIONS["basic"])


def dashboard_tier_payload(db: Session, tenant: Tenant) -> dict:
    tier = effective_dashboard_tier(db, tenant)
    return {
        "tier": tier,
        "tier_label": dashboard_tier_label(tier),
        "tier_description": dashboard_tier_description(tier),
        "plan_key": tenant.active_plan,
        "finance_max_mode": effective_finance_max_mode(db, tenant),
    }
