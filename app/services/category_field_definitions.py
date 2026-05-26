"""Definições e validação de campos técnicos dinâmicos por categoria de equipamento."""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

FieldType = Literal["text", "number", "select"]

_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


class CategoryFieldDefinition(BaseModel):
    """Um campo técnico configurável na categoria."""

    key: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=120)
    type: FieldType = "text"
    unit: str | None = Field(default=None, max_length=40)
    required: bool = False
    is_active: bool = True
    options: list[str] = Field(default_factory=list)

    @field_validator("key", mode="before")
    @classmethod
    def _normalize_key(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        key = slugify_field_key(value)
        if not key:
            raise ValueError("Chave do campo inválida.")
        return key

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                raise ValueError("Nome do campo é obrigatório.")
            return stripped
        return value

    @field_validator("unit", mode="before")
    @classmethod
    def _strip_unit(cls, value: object) -> object | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return value

    @field_validator("options", mode="before")
    @classmethod
    def _normalize_options(cls, value: object) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            return []
        out: list[str] = []
        for item in value:
            if isinstance(item, str) and item.strip():
                out.append(item.strip())
        return out


def slugify_field_key(name: str) -> str:
    """Gera chave estável a partir do nome (ex: 'Disjuntor' -> 'disjuntor')."""
    normalized = unicodedata.normalize("NFKD", name.strip().lower())
    ascii_only = "".join(c for c in normalized if not unicodedata.combining(c))
    key = re.sub(r"[^a-z0-9]+", "_", ascii_only).strip("_")
    if not key:
        return ""
    if not _KEY_RE.match(key):
        key = f"f_{key}"[:64]
    return key[:64]


def parse_field_definitions(raw: list[dict[str, Any]] | None) -> list[CategoryFieldDefinition]:
    if not raw:
        return []
    parsed: list[CategoryFieldDefinition] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            row = CategoryFieldDefinition.model_validate(item)
        except Exception:
            continue
        if row.key in seen:
            continue
        seen.add(row.key)
        parsed.append(row)
    return parsed


def active_field_definitions(definitions: list[CategoryFieldDefinition]) -> list[CategoryFieldDefinition]:
    return [d for d in definitions if d.is_active]


def legacy_flags_from_definitions(definitions: list[CategoryFieldDefinition]) -> tuple[bool, bool, bool]:
    """Mantém colunas legadas has_* sincronizadas para compatibilidade."""
    active = {d.key for d in active_field_definitions(definitions)}
    return (
        "capacity" in active,
        "fluid_type" in active,
        "voltage" in active,
    )


def default_definitions_from_legacy(
    *,
    has_capacity: bool,
    has_fluid_type: bool,
    has_voltage: bool,
) -> list[dict[str, Any]]:
    """Converte flags antigas em definições padrão."""
    defs: list[dict[str, Any]] = []
    if has_capacity:
        defs.append(
            {
                "key": "capacity",
                "name": "Capacidade",
                "type": "text",
                "unit": None,
                "required": False,
                "is_active": True,
                "options": [],
            }
        )
    if has_fluid_type:
        defs.append(
            {
                "key": "fluid_type",
                "name": "Fluido refrigerante",
                "type": "text",
                "unit": None,
                "required": False,
                "is_active": True,
                "options": [],
            }
        )
    if has_voltage:
        defs.append(
            {
                "key": "voltage",
                "name": "Tensão",
                "type": "text",
                "unit": None,
                "required": False,
                "is_active": True,
                "options": [],
            }
        )
    return defs


def serialize_field_definitions(definitions: list[CategoryFieldDefinition]) -> list[dict[str, Any]]:
    return [d.model_dump(mode="json") for d in definitions]


def normalize_technical_data(raw: dict[str, Any] | None) -> dict[str, Any]:
    if not raw or not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or not key.strip():
            continue
        k = key.strip()
        if value is None:
            continue
        if isinstance(value, str):
            if not value.strip():
                continue
            out[k] = value.strip()
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            out[k] = value
        elif isinstance(value, bool):
            out[k] = value
        else:
            out[k] = str(value).strip()
    return out


def validate_technical_data(
    definitions: list[CategoryFieldDefinition],
    raw_data: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    Valida e normaliza technical_data conforme field_definitions da categoria.
    Levanta ValueError com mensagem em português.
    """
    data = normalize_technical_data(raw_data)
    active = active_field_definitions(definitions)
    if not active:
        if data:
            raise ValueError("Esta categoria não possui campos técnicos configurados.")
        return {}

    errors: list[str] = []
    result: dict[str, Any] = {}

    for field_def in active:
        value = data.get(field_def.key)
        missing = value is None or (isinstance(value, str) and not value.strip())

        if missing:
            if field_def.required:
                label = field_def.name
                errors.append(f'"{label}" é obrigatório.')
            continue

        if field_def.type == "number":
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                result[field_def.key] = value
                continue
            text = str(value).strip().replace(",", ".")
            try:
                num = float(text)
            except ValueError:
                errors.append(f'"{field_def.name}" deve ser numérico.')
                continue
            result[field_def.key] = num
            continue

        if field_def.type == "select":
            text = str(value).strip()
            if field_def.options and text not in field_def.options:
                errors.append(f'"{field_def.name}": selecione uma opção válida.')
                continue
            result[field_def.key] = text
            continue

        result[field_def.key] = str(value).strip()

    allowed_keys = {d.key for d in active}
    for key in data:
        if key not in allowed_keys:
            errors.append(f'Campo técnico desconhecido: "{key}".')

    if errors:
        raise ValueError(" ".join(errors))

    return result


def format_field_value(field_def: CategoryFieldDefinition, value: Any) -> str:
    """Valor formatado com unidade, ex: '20' + 'A' -> '20 A'."""
    if value is None or value == "":
        return ""
    text = str(value).strip()
    unit = (field_def.unit or "").strip()
    if unit:
        return f"{text} {unit}"
    return text


def resolve_category_field_definitions(category: Any) -> list[CategoryFieldDefinition]:
    """field_definitions da categoria ou flags legadas has_capacity / has_fluid_type / has_voltage."""
    raw_defs = getattr(category, "field_definitions", None) or []
    parsed = parse_field_definitions(raw_defs if isinstance(raw_defs, list) else [])
    if parsed:
        return active_field_definitions(parsed)
    return active_field_definitions(
        parse_field_definitions(
            default_definitions_from_legacy(
                has_capacity=bool(getattr(category, "has_capacity", False)),
                has_fluid_type=bool(getattr(category, "has_fluid_type", False)),
                has_voltage=bool(getattr(category, "has_voltage", False)),
            )
        )
    )


def technical_data_from_catalog(catalog: Any) -> dict[str, Any]:
    """Mescla technical_data JSONB com colunas legadas capacity/fluid_type/voltage."""
    data = normalize_technical_data(getattr(catalog, "technical_data", None) or {})
    cap = getattr(catalog, "capacity", None)
    if cap and "capacity" not in data:
        data["capacity"] = cap
    fluid = getattr(catalog, "fluid_type", None)
    if fluid and "fluid_type" not in data:
        data["fluid_type"] = fluid
    volt = getattr(catalog, "voltage", None)
    if volt and "voltage" not in data:
        data["voltage"] = volt
    return data


def build_technical_spec_display(
    definitions: list[CategoryFieldDefinition],
    technical_data: dict[str, Any],
) -> list[dict[str, str]]:
    """Lista {key, label, value} para exibição na ficha (pública ou interna)."""
    data = normalize_technical_data(technical_data)
    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    for field_def in definitions:
        value = data.get(field_def.key)
        if value is None or value == "":
            continue
        formatted = format_field_value(field_def, value)
        if not formatted:
            continue
        rows.append({"key": field_def.key, "label": field_def.name, "value": formatted})
        seen.add(field_def.key)
    for key, value in data.items():
        if key in seen or value is None or value == "":
            continue
        label = key.replace("_", " ").strip().title()
        rows.append({"key": key, "label": label, "value": str(value).strip()})
    return rows


def sync_legacy_catalog_columns(entry: Any, technical_data: dict[str, Any]) -> None:
    """Preenche capacity/fluid_type/voltage a partir de chaves conhecidas em technical_data."""
    cap = technical_data.get("capacity")
    entry.capacity = str(cap).strip() if cap is not None else None
    fluid = technical_data.get("fluid_type")
    entry.fluid_type = str(fluid).strip() if fluid is not None else None
    volt = technical_data.get("voltage")
    entry.voltage = str(volt).strip() if volt is not None else None
