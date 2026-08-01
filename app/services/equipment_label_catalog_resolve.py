"""Resolve etiqueta (IA) → categoria do catálogo + find-or-create do modelo."""

from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.services.catalog_duplicate import find_catalog_duplicate
from app.services.category_field_definitions import (
    active_field_definitions,
    default_definitions_from_legacy,
    parse_field_definitions,
    serialize_field_definitions,
    sync_legacy_catalog_columns,
    validate_technical_data,
)
from app.services.equipment_category_fields import (
    empty_to_none,
    extract_extra_technical_fields,
    is_split_ac_category,
    normalize_catalog_technical_fields,
)
from app.services.equipment_manuals import build_catalog_display_model
from models import EquipmentCatalog, EquipmentCatalogComponentType, EquipmentCategory


def _apply_catalog_fields(
    entry: EquipmentCatalog,
    *,
    category: EquipmentCategory,
    brand: str,
    model_evaporator: str | None,
    model_condenser: str | None,
    capacity: str | None = None,
    fluid_type: str | None = None,
    voltage: str | None = None,
    technical_data: dict | None = None,
    model_fallback: str | None = None,
) -> None:
    definitions = parse_field_definitions(getattr(category, "field_definitions", None) or [])
    known_field_keys = {d.key for d in active_field_definitions(definitions)}
    merged_technical: dict = {}
    if technical_data is not None:
        payload_for_validation, extra_technical = extract_extra_technical_fields(technical_data, known_field_keys)
        try:
            merged_technical = validate_technical_data(definitions, payload_for_validation)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        if extra_technical:
            merged_technical.update(extra_technical)
    else:
        legacy_payload = {
            k: v
            for k, v in (
                ("capacity", empty_to_none(capacity)),
                ("fluid_type", empty_to_none(fluid_type)),
                ("voltage", empty_to_none(voltage)),
            )
            if v
        }
        if legacy_payload:
            try:
                merged_technical = validate_technical_data(definitions, legacy_payload)
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    entry.technical_data = merged_technical
    sync_legacy_catalog_columns(entry, merged_technical)
    cap, fluid, volt = normalize_catalog_technical_fields(
        category,
        capacity=entry.capacity,
        fluid_type=entry.fluid_type,
        voltage=entry.voltage,
    )
    entry.capacity = cap
    entry.fluid_type = fluid
    entry.voltage = volt
    entry.category_id = category.id
    entry.brand = brand.strip()
    entry.model_evaporator = empty_to_none(model_evaporator)
    entry.model_condenser = empty_to_none(model_condenser)
    entry.model = build_catalog_display_model(
        model_evaporator=entry.model_evaporator,
        model_condenser=entry.model_condenser,
        fallback=empty_to_none(model_fallback),
    )
    evap = entry.model_evaporator
    cond = entry.model_condenser
    split_ac = is_split_ac_category(category)
    if evap and cond:
        entry.component_type = EquipmentCatalogComponentType.UNICO
    elif split_ac and evap and not cond:
        entry.component_type = EquipmentCatalogComponentType.EVAPORADORA
        entry.model = evap
    elif split_ac and cond and not evap:
        entry.component_type = EquipmentCatalogComponentType.CONDENSADORA
        entry.model = cond
    else:
        entry.component_type = EquipmentCatalogComponentType.UNICO
        if not entry.model and evap:
            entry.model = evap
        elif not entry.model and cond:
            entry.model = cond


def _parse_btu(capacity: str | None) -> int | None:
    if not capacity:
        return None
    match = re.search(r"(\d{3,6})", capacity.replace(".", "").replace(",", ""))
    if not match:
        return None
    value = int(match.group(1))
    return value if value > 0 else None


def ensure_catalog_categories(db: Session, tenant_id: int) -> list[EquipmentCategory]:
    """Garante categorias padrão no catálogo global quando ainda não existem."""
    rows = db.execute(
        select(EquipmentCategory)
        .where(EquipmentCategory.tenant_id == tenant_id)
        .order_by(EquipmentCategory.sort_order.asc(), EquipmentCategory.name.asc())
    ).scalars().all()
    if rows:
        return list(rows)

    created: list[EquipmentCategory] = []
    for name, icon_key, sort_order, has_cap, has_fluid, has_volt in (
        ("Ar-condicionado", "ar_condicionado", 10, True, True, True),
        ("Climatizador", "climatizador", 20, True, True, True),
    ):
        definitions = parse_field_definitions(
            default_definitions_from_legacy(
                has_capacity=has_cap,
                has_fluid_type=has_fluid,
                has_voltage=has_volt,
            )
        )
        row = EquipmentCategory(
            tenant_id=tenant_id,
            name=name,
            icon_key=icon_key,
            sort_order=sort_order,
            has_capacity=has_cap,
            has_fluid_type=has_fluid,
            has_voltage=has_volt,
            field_definitions=serialize_field_definitions(definitions),
        )
        db.add(row)
        created.append(row)
    db.flush()
    return created


def pick_category_for_kind(db: Session, tenant_id: int, equipment_kind: str) -> EquipmentCategory:
    rows = ensure_catalog_categories(db, tenant_id)
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível preparar as categorias do catálogo de equipamentos.",
        )
    target_icon = "climatizador" if equipment_kind == "climatizador" else "ar_condicionado"
    for row in rows:
        if (row.icon_key or "").strip().lower() == target_icon:
            return row
    for row in rows:
        name = (row.name or "").lower()
        if equipment_kind == "climatizador" and "climatizador" in name:
            return row
        if equipment_kind != "climatizador" and (
            "condicion" in name or "ar-condicionado" in name or "split" in name
        ):
            return row
    return rows[0]


def _assign_model_to_technical_payload(data: dict[str, Any], category: EquipmentCategory, model_display: str) -> None:
    if not model_display:
        return
    definitions = active_field_definitions(
        parse_field_definitions(getattr(category, "field_definitions", None) or [])
    )
    for field_def in definitions:
        key_lower = field_def.key.lower()
        name_lower = field_def.name.lower()
        if "modelo" in name_lower or key_lower in ("model", "modelo", "modelo_equipamento", "modelo_do_equipamento"):
            data.setdefault(field_def.key, model_display)


def _fill_required_technical_defaults(
    data: dict[str, Any],
    category: EquipmentCategory,
    *,
    extraction: dict[str, str | None],
    equipment_kind: str,
    model_display: str,
) -> None:
    """Preenche campos técnicos obrigatórios ausentes na etiqueta (cadastro rápido via IA)."""
    definitions = active_field_definitions(
        parse_field_definitions(getattr(category, "field_definitions", None) or [])
    )
    cap = empty_to_none(extraction.get("capacidade_btus")) or empty_to_none(extraction.get("vazao_m3h"))
    fluid = empty_to_none(extraction.get("fluido_refrigerante"))
    volt = empty_to_none(extraction.get("tensao"))

    for field_def in definitions:
        if not field_def.required:
            continue
        existing = data.get(field_def.key)
        if existing is not None and str(existing).strip():
            continue
        key = field_def.key
        if key == "capacity" and cap:
            data[key] = cap
        elif key == "fluid_type" and fluid:
            data[key] = fluid
        elif key == "voltage" and volt:
            data[key] = volt
        elif ("modelo" in field_def.name.lower() or "model" in key.lower()) and model_display:
            data[key] = model_display
        elif key == "capacity" and equipment_kind == "climatizador" and cap:
            data[key] = cap
        else:
            data[key] = "—"


def _build_technical_payload_for_label_resolve(
    category: EquipmentCategory,
    extraction: dict[str, str | None],
    *,
    equipment_kind: str,
    model_evaporator: str | None,
    model_condenser: str | None,
    model_fallback: str | None,
) -> dict[str, Any]:
    data: dict[str, Any] = {}
    cap = empty_to_none(extraction.get("capacidade_btus")) or (
        empty_to_none(extraction.get("vazao_m3h")) if equipment_kind == "climatizador" else None
    )
    fluid = empty_to_none(extraction.get("fluido_refrigerante"))
    volt = empty_to_none(extraction.get("tensao"))
    if cap:
        data["capacity"] = cap
    if fluid:
        data["fluid_type"] = fluid
    if volt:
        data["voltage"] = volt

    if equipment_kind == "climatizador":
        for key in ("tipo_instalacao", "potencia_kw", "pressao_estatica"):
            val = extraction.get(key)
            if val:
                data[key] = val
    else:
        for key in ("tipo_equipamento", "tecnologia"):
            val = extraction.get(key)
            if val:
                data[key] = val

    model_display = build_catalog_display_model(
        model_evaporator=empty_to_none(model_evaporator),
        model_condenser=empty_to_none(model_condenser),
        fallback=empty_to_none(model_fallback),
    )
    if model_display and model_display != "—":
        _assign_model_to_technical_payload(data, category, model_display)

    _fill_required_technical_defaults(
        data,
        category,
        extraction=extraction,
        equipment_kind=equipment_kind,
        model_display=model_display if model_display != "—" else "",
    )
    return data


def find_or_create_catalog_from_label(
    db: Session,
    *,
    tenant_id: int,
    equipment_kind: str,
    extraction: dict[str, str | None],
) -> tuple[EquipmentCatalog, EquipmentCategory, bool]:
    """Retorna (catalog, category, created)."""
    category = pick_category_for_kind(db, tenant_id, equipment_kind)
    brand = (extraction.get("marca") or "").strip() or "Marca não identificada"

    if equipment_kind == "climatizador":
        model_evaporator = None
        model_condenser = None
        model_fallback = empty_to_none(extraction.get("modelo")) or "Não identificado na etiqueta"
        capacity = empty_to_none(extraction.get("vazao_m3h")) or empty_to_none(extraction.get("capacidade_btus"))
    else:
        model_evaporator = empty_to_none(extraction.get("modelo_evaporadora"))
        model_condenser = empty_to_none(extraction.get("modelo_condensadora"))
        model_fallback = None
        if not model_evaporator and not model_condenser:
            model_fallback = empty_to_none(extraction.get("modelo"))
        if not model_evaporator and not model_condenser and not model_fallback:
            model_fallback = "Não identificado na etiqueta"
        capacity = empty_to_none(extraction.get("capacidade_btus"))

    fluid_type = empty_to_none(extraction.get("fluido_refrigerante"))
    voltage = empty_to_none(extraction.get("tensao"))
    technical_data = _build_technical_payload_for_label_resolve(
        category,
        extraction,
        equipment_kind=equipment_kind,
        model_evaporator=model_evaporator,
        model_condenser=model_condenser,
        model_fallback=model_fallback,
    )

    duplicate = find_catalog_duplicate(
        db,
        tenant_id=tenant_id,
        category=category,
        brand=brand,
        model_evaporator=model_evaporator,
        model_condenser=model_condenser,
        model_fallback=model_fallback,
    )
    if duplicate is not None:
        return duplicate, category, False

    entry = EquipmentCatalog(
        tenant_id=tenant_id,
        category_id=category.id,
        manual_id=None,
        brand="",
        model="—",
    )
    _apply_catalog_fields(
        entry,
        category=category,
        brand=brand,
        model_evaporator=model_evaporator,
        model_condenser=model_condenser,
        capacity=capacity,
        fluid_type=fluid_type,
        voltage=voltage,
        technical_data=technical_data,
        model_fallback=model_fallback,
    )
    db.add(entry)
    db.flush()
    return entry, category, True


def suggested_identificacao_from_extraction(
    extraction: dict[str, str | None],
    *,
    equipment_kind: str,
    brand: str,
    model_display: str,
) -> str | None:
    tipo = extraction.get("tipo_equipamento") or extraction.get("tipo_instalacao")
    cap = extraction.get("capacidade_btus") or extraction.get("vazao_m3h")
    parts = [p for p in (tipo, cap, brand, model_display) if p and str(p).strip()]
    if not parts:
        label = "Climatizador" if equipment_kind == "climatizador" else "Ar-condicionado"
        return label
    return " · ".join(str(p).strip() for p in parts[:3])
