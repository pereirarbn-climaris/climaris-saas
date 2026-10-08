"""Efetiva rótulo, limites e teto financeiro: catálogo `saas_plan_catalog` + regras padrão em `plan_rules`."""

from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.plan_rules import get_plan_definition, normalize_plan_key, plan_key_string_variants
from models import SaasPlanCatalog, Tenant

_VALID_FINANCE = frozenset({"basic", "intermediate", "management"})


def default_finance_max_mode(normalized_key: str, raw_active_plan: str) -> str:
    """Teto financeiro quando não há linha no catálogo (ou coluna inválida). Inclui correção beta_internal → management."""
    if normalized_key == "beta_internal":
        return "management"
    if normalized_key in ("enterprise",):
        return "management"
    if normalized_key in ("professional",):
        return "intermediate"
    if normalized_key in ("free_30d", "basic"):
        return "basic"
    s = (raw_active_plan or "").strip().lower()
    if "enterprise" in s or "premium" in s:
        return "management"
    if "pro" in s or "professional" in s:
        return "intermediate"
    return "basic"


def effective_plan_label_and_max_users(db: Session, tenant: Tenant) -> tuple[str, int | None]:
    key = normalize_plan_key(tenant.active_plan)
    row = db.get(SaasPlanCatalog, key)
    pd = get_plan_definition(tenant.active_plan)
    label = row.display_name if row is not None else pd.label
    if row is not None and row.max_users is not None:
        max_users: int | None = int(row.max_users)
    else:
        max_users = pd.max_users
    return label, max_users


def effective_finance_max_mode(db: Session, tenant: Tenant) -> str:
    key = normalize_plan_key(tenant.active_plan)
    row = db.get(SaasPlanCatalog, key)
    if row is not None:
        m = (row.finance_max_mode or "basic").strip().lower()
        if m in _VALID_FINANCE:
            return m
    return default_finance_max_mode(key, tenant.active_plan)


def count_tenants_using_plan_key(db: Session, normalized_plan_key: str) -> int:
    variants = plan_key_string_variants(normalized_plan_key.strip().lower())
    cond = or_(*(Tenant.active_plan == v for v in variants))
    return int(db.execute(select(func.count()).select_from(Tenant).where(cond)).scalar_one())
