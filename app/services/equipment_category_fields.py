from __future__ import annotations

from typing import Any

from models import EquipmentCategory

# Campos extras persistidos em technical_data, mas não definidos na categoria (UI AC / manuais).
CATALOG_EXTRA_TECHNICAL_KEYS = frozenset({
    "tipo_equipamento",
    "tecnologia",
    "tipo_instalacao",
    "potencia_kw",
    "pressao_estatica",
    "manual_usuario_id",
    "manual_instalacao_id",
    "manual_servico_id",
})


def extract_extra_technical_fields(
    raw: dict[str, Any] | None,
    known_field_keys: frozenset[str] | set[str] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Separa chaves reservadas/livres do payload validado pelos field_definitions da categoria.

    Chaves presentes em `known_field_keys` (definições ativas da categoria) seguem para
    validação estrita (`validate_technical_data`). Todas as demais — reservadas (UI AC) ou
    especificações livres extraídas de manuais via IA — são mantidas como estão no JSONB,
    sem gerar erro de "campo desconhecido". O objetivo é não perder nenhum dado técnico
    encontrado no manual, mesmo que a categoria não tenha um campo formal para ele.
    """
    if not raw:
        return {}, {}
    known = known_field_keys or frozenset()
    payload = dict(raw)
    extra: dict[str, Any] = {}
    for key in list(payload.keys()):
        if key in known:
            continue
        val = payload.pop(key)
        if val is None:
            continue
        if isinstance(val, (int, float)) and not isinstance(val, bool):
            extra[key] = val
            continue
        if isinstance(val, bool):
            extra[key] = val
            continue
        text = str(val).strip()
        if text:
            extra[key] = text
    return payload, extra


def is_split_ac_category(category: EquipmentCategory) -> bool:
    """Somente ar-condicionado usa peças evaporadora/condensadora separadas no catálogo."""
    key = (category.icon_key or "").strip().lower()
    if key == "ar_condicionado":
        return True
    name = (category.name or "").lower()
    return "ar-condicionado" in name or "ar condicionado" in name


def empty_to_none(value: str | None) -> str | None:
    """Converte string vazia ou só espaços em None."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped if stripped else None


def normalize_catalog_technical_fields(
    category: EquipmentCategory,
    *,
    capacity: str | None,
    fluid_type: str | None,
    voltage: str | None,
) -> tuple[str | None, str | None, str | None]:
    """Normaliza campos técnicos; vazios viram None (flags da categoria são só UI)."""
    _ = category  # reservado para regras futuras por categoria
    return (
        empty_to_none(capacity),
        empty_to_none(fluid_type),
        empty_to_none(voltage),
    )
