"""Mescla dados novos em registros já existentes do catálogo (só preenche vazios)."""

from __future__ import annotations

from typing import Any

from app.services.ac_technical_normalize import normalize_ac_technical_data
from app.services.equipment_category_fields import empty_to_none
from models import EquipmentCatalog


def _is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    return False


def merge_missing_technical_data(
    existing: dict[str, Any] | None,
    incoming: dict[str, Any] | None,
) -> tuple[dict[str, Any], list[str]]:
    """Une technical_data preenchendo apenas chaves vazias/ausentes no existente.

    Ambos os lados passam por normalize_ac_technical_data para unificar aliases.
    Retorna (merged, lista de chaves que foram preenchidas).
    """
    base = normalize_ac_technical_data(existing or {})
    new = normalize_ac_technical_data(incoming or {})
    filled: list[str] = []
    for key, value in new.items():
        if _is_blank(value):
            continue
        if _is_blank(base.get(key)):
            base[key] = value
            filled.append(key)
    return base, filled


def fill_catalog_entry_gaps(
    entry: EquipmentCatalog,
    *,
    incoming_technical: dict[str, Any] | None,
    manual_id: Any | None = None,
    model_evaporator: str | None = None,
    model_condenser: str | None = None,
    model_fallback: str | None = None,
) -> list[str]:
    """Atualiza o registro existente só onde falta informação.

    - technical_data / capacity / fluid / voltage: só se vazios
    - model_evaporator / model_condenser: só se vazios
    - manual_id: só se o aparelho ainda não tem manual
    """
    from app.services.category_field_definitions import sync_legacy_catalog_columns

    changes: list[str] = []
    existing_td = entry.technical_data if isinstance(entry.technical_data, dict) else {}
    merged, filled_keys = merge_missing_technical_data(existing_td, incoming_technical)
    if filled_keys:
        entry.technical_data = merged
        sync_legacy_catalog_columns(entry, merged)
        changes.extend(filled_keys)

    evap = empty_to_none(model_evaporator)
    cond = empty_to_none(model_condenser)
    if evap and _is_blank(entry.model_evaporator):
        entry.model_evaporator = evap
        changes.append("model_evaporator")
    if cond and _is_blank(entry.model_condenser):
        entry.model_condenser = cond
        changes.append("model_condenser")

    # Se o modelo display ainda é genérico e temos fallback melhor
    fb = empty_to_none(model_fallback)
    if fb and (not entry.model or entry.model == "—") and not (entry.model_evaporator or entry.model_condenser):
        entry.model = fb
        changes.append("model")

    if manual_id is not None and entry.manual_id is None:
        entry.manual_id = manual_id
        changes.append("manual_id")

    return changes
