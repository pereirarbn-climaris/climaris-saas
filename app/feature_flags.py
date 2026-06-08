"""Feature flags por tenant (rollout gradual de funcionalidades beta)."""

from __future__ import annotations

from typing import Any

KNOWN_FEATURE_FLAGS: frozenset[str] = frozenset(
    {
        "new_laudo",
        "dre_dashboard",
    }
)


def normalize_features_enabled(raw: Any) -> dict[str, bool]:
    if not raw:
        return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, bool] = {}
    for key, value in raw.items():
        name = str(key).strip()
        if not name:
            continue
        out[name] = bool(value)
    return out


def merge_features_enabled(existing: Any, updates: dict[str, bool]) -> dict[str, bool]:
    merged = normalize_features_enabled(existing)
    for key, value in updates.items():
        flag = str(key).strip()
        if not flag or flag not in KNOWN_FEATURE_FLAGS:
            continue
        merged[flag] = bool(value)
    return merged


def is_feature_enabled(tenant: Any, flag: str) -> bool:
    name = str(flag).strip()
    if not name:
        return False
    features = normalize_features_enabled(getattr(tenant, "features_enabled", None))
    return features.get(name) is True
