from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PlanDefinition:
    key: str
    label: str
    max_users: int | None
    is_beta_internal: bool = False
    can_contract: bool = True


_PLAN_ALIAS: dict[str, str] = {
    "starter": "free_30d",
    "trial": "free_30d",
    "trial_30d": "free_30d",
    "basic": "basic",
    "professional": "professional",
    "enterprise": "enterprise",
    "beta": "beta_internal",
    "beta-internal": "beta_internal",
    "developer": "beta_internal",
    "dev": "beta_internal",
}

PLAN_DEFINITIONS: dict[str, PlanDefinition] = {
    "free_30d": PlanDefinition(
        key="free_30d",
        label="Free 30 dias",
        max_users=2,
        can_contract=True,
    ),
    "basic": PlanDefinition(
        key="basic",
        label="Basic",
        max_users=2,
        can_contract=True,
    ),
    "professional": PlanDefinition(
        key="professional",
        label="Professional",
        max_users=5,
        can_contract=True,
    ),
    "enterprise": PlanDefinition(
        key="enterprise",
        label="Enterprise",
        max_users=None,
        can_contract=True,
    ),
    "beta_internal": PlanDefinition(
        key="beta_internal",
        label="Developer (uso interno)",
        max_users=None,
        is_beta_internal=True,
        can_contract=False,
    ),
}


def normalize_plan_key(raw_plan: str) -> str:
    normalized = (raw_plan or "").strip().lower().replace(" ", "_")
    if not normalized:
        return "free_30d"
    return _PLAN_ALIAS.get(normalized, normalized)


def plan_key_string_variants(normalized_key: str) -> set[str]:
    """Valores de `tenants.active_plan` que normalizam para a mesma chave (ex.: developer → beta_internal)."""
    out: set[str] = {normalized_key}
    for raw, n in _PLAN_ALIAS.items():
        if n == normalized_key:
            out.add(raw)
    return out


def get_plan_definition(raw_plan: str) -> PlanDefinition:
    key = normalize_plan_key(raw_plan)
    return PLAN_DEFINITIONS.get(
        key,
        PlanDefinition(
            key=key,
            label=key,
            max_users=None,
            can_contract=True,
        ),
    )

