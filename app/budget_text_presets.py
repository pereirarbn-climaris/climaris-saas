from __future__ import annotations

import json
import uuid
from typing import Any

from pydantic import BaseModel, Field


class BudgetTextPreset(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=120)
    text: str = Field(max_length=8000)
    is_default: bool = False


def _new_preset_id() -> str:
    return uuid.uuid4().hex[:12]


def parse_presets_json(raw: str | None) -> list[BudgetTextPreset]:
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[BudgetTextPreset] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        try:
            preset = BudgetTextPreset.model_validate(item)
            if preset.id.strip():
                out.append(preset)
        except Exception:
            continue
    return out


def dumps_presets_json(presets: list[BudgetTextPreset]) -> str | None:
    if not presets:
        return None
    return json.dumps([p.model_dump() for p in presets], ensure_ascii=False)


def migrate_legacy_text_to_presets(text: str | None, *, default_name: str) -> list[BudgetTextPreset]:
    body = (text or "").strip()
    if not body:
        return []
    return [
        BudgetTextPreset(
            id=_new_preset_id(),
            name=default_name,
            text=body,
            is_default=True,
        )
    ]


def ensure_presets_from_legacy(
    presets: list[BudgetTextPreset],
    legacy_text: str | None,
    *,
    default_name: str,
) -> list[BudgetTextPreset]:
    if presets:
        return presets
    return migrate_legacy_text_to_presets(legacy_text, default_name=default_name)


def default_text_from_presets(presets: list[BudgetTextPreset]) -> str | None:
    if not presets:
        return None
    for preset in presets:
        if preset.is_default and preset.text.strip():
            return preset.text.strip()
    for preset in presets:
        if preset.text.strip():
            return preset.text.strip()
    return None


def coerce_presets(presets: list[BudgetTextPreset | dict[str, Any]]) -> list[BudgetTextPreset]:
    out: list[BudgetTextPreset] = []
    for item in presets:
        if isinstance(item, BudgetTextPreset):
            out.append(item)
        elif isinstance(item, dict):
            try:
                out.append(BudgetTextPreset.model_validate(item))
            except Exception:
                continue
    return out


def normalize_presets(
    presets: list[BudgetTextPreset],
    *,
    active_default_id: str | None = None,
) -> list[BudgetTextPreset]:
    """Garante IDs únicos e exatamente um padrão quando houver itens."""
    seen: set[str] = set()
    normalized: list[BudgetTextPreset] = []
    for preset in presets:
        pid = preset.id.strip() or _new_preset_id()
        while pid in seen:
            pid = _new_preset_id()
        seen.add(pid)
        normalized.append(
            BudgetTextPreset(
                id=pid,
                name=preset.name.strip() or "Modelo",
                text=preset.text,
                is_default=False,
            )
        )
    if not normalized:
        return []
    default_id = active_default_id
    if default_id and not any(p.id == default_id for p in normalized):
        default_id = None
    if not default_id:
        prior = next((p for p in presets if p.is_default), None)
        default_id = prior.id if prior and any(p.id == prior.id for p in normalized) else normalized[0].id
    return [
        BudgetTextPreset(
            id=p.id,
            name=p.name,
            text=p.text,
            is_default=p.id == default_id,
        )
        for p in normalized
    ]


def presets_to_api(presets: list[BudgetTextPreset]) -> list[dict[str, Any]]:
    return [p.model_dump() for p in presets]
