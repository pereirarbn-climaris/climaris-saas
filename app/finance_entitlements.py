"""Permissões do módulo financeiro por plano SaaS + marketplace (feature flags)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.marketplace_util import tenant_has_marketplace_app
from app.plan_rules import get_plan_definition, normalize_plan_key
from app.saas_plan_effective import effective_finance_max_mode
from models import Tenant

MODE_ORDER: dict[str, int] = {"basic": 0, "intermediate": 1, "management": 2}

FinanceFeatureKey = Literal[
    "finance_module",
    "finance_intermediate",
    "finance_management",
    "payment_pix_boleto",
    "auto_reconciliation",
    "payment_gateways",
]

FinanceMode = Literal["basic", "intermediate", "management"]

_ALL_FEATURES: frozenset[str] = frozenset(
    {
        "finance_module",
        "finance_intermediate",
        "finance_management",
        "payment_pix_boleto",
        "auto_reconciliation",
        "payment_gateways",
    }
)


@dataclass(frozen=True)
class FinanceEntitlements:
    plan_key: str
    plan_label: str
    effective_finance_mode: FinanceMode
    max_finance_mode: FinanceMode
    features: dict[str, bool]
    blocked_reasons: dict[str, str]

    def can(self, feature: FinanceFeatureKey) -> bool:
        return bool(self.features.get(feature))

    def require(self, feature: FinanceFeatureKey) -> None:
        if self.can(feature):
            return
        detail = self.blocked_reasons.get(feature) or "Recurso não disponível no seu plano."
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _plan_allows_pro_finance(active_plan: str) -> bool:
    key = normalize_plan_key(active_plan)
    if key == "beta_internal":
        return True
    return key in {"professional", "enterprise"}


def _effective_finance_mode(db: Session, tenant: Tenant) -> tuple[str, str, str]:
    selected = (tenant.finance_mode or "basic").strip().lower()
    if selected not in MODE_ORDER:
        selected = "basic"
    plan_max = effective_finance_max_mode(db, tenant)
    max_mode = plan_max
    if tenant_has_marketplace_app(db, tenant.id, "finance-intermediate"):
        max_mode = "intermediate" if MODE_ORDER[max_mode] < MODE_ORDER["intermediate"] else max_mode
    if tenant_has_marketplace_app(db, tenant.id, "finance-management"):
        max_mode = "management"
    effective = selected if MODE_ORDER[selected] <= MODE_ORDER[max_mode] else max_mode
    return selected, max_mode, effective


def resolve_finance_entitlements(db: Session, tenant: Tenant) -> FinanceEntitlements:
    plan_def = get_plan_definition(tenant.active_plan)
    _selected, max_mode, effective = _effective_finance_mode(db, tenant)
    finance_enabled = bool(tenant.finance_enabled)
    pro_plus = _plan_allows_pro_finance(tenant.active_plan)

    eff_rank = MODE_ORDER.get(effective, 0)
    max_rank = MODE_ORDER.get(max_mode, 0)

    features: dict[str, bool] = {k: False for k in _ALL_FEATURES}
    blocked: dict[str, str] = {}

    if finance_enabled:
        features["finance_module"] = True
    else:
        blocked["finance_module"] = "Financeiro desativado neste workspace."

    if finance_enabled and eff_rank >= MODE_ORDER["intermediate"]:
        features["finance_intermediate"] = True
        features["payment_gateways"] = True
    else:
        blocked["finance_intermediate"] = (
            "Disponível no modo Intermediário ou superior (plano Professional+ ou app na Loja)."
        )
        blocked["payment_gateways"] = blocked["finance_intermediate"]

    if finance_enabled and eff_rank >= MODE_ORDER["management"]:
        features["finance_management"] = True
    else:
        blocked["finance_management"] = "Disponível no modo Gestão (management)."

    if features["finance_intermediate"] and pro_plus:
        features["payment_pix_boleto"] = True
    else:
        blocked["payment_pix_boleto"] = (
            "Emissão de Pix/Boleto requer modo Intermediário+ e plano Professional ou Enterprise."
        )

    if features["finance_management"] and pro_plus:
        features["auto_reconciliation"] = True
    else:
        blocked["auto_reconciliation"] = (
            "Conciliação automática (OFX) requer modo Gestão e plano Professional ou Enterprise."
        )

    if plan_def.is_beta_internal:
        for k in _ALL_FEATURES:
            features[k] = True
        blocked.clear()

    if tenant_has_marketplace_app(db, tenant.id, "finance-management"):
        features["finance_management"] = True
        features["auto_reconciliation"] = features["auto_reconciliation"] or pro_plus

    return FinanceEntitlements(
        plan_key=plan_def.key,
        plan_label=plan_def.label,
        effective_finance_mode=effective,  # type: ignore[arg-type]
        max_finance_mode=max_mode,  # type: ignore[arg-type]
        features=features,
        blocked_reasons=blocked,
    )


def require_finance_feature(db: Session, tenant: Tenant, feature: FinanceFeatureKey) -> FinanceEntitlements:
    ent = resolve_finance_entitlements(db, tenant)
    ent.require(feature)
    return ent
