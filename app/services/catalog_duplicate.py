"""Detecção de modelos duplicados no catálogo global de equipamentos."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.services.equipment_category_fields import empty_to_none, is_split_ac_category
from app.services.equipment_manuals import build_catalog_display_model
from models import EquipmentCatalog, EquipmentCatalogComponentType, EquipmentCategory


def resolve_catalog_unique_key(
    category: EquipmentCategory,
    *,
    brand: str,
    model_evaporator: str | None = None,
    model_condenser: str | None = None,
    model_fallback: str | None = None,
) -> tuple[str, EquipmentCatalogComponentType, str]:
    """Calcula a chave usada pela constraint única do catálogo."""
    brand_clean = brand.strip()
    evap = empty_to_none(model_evaporator)
    cond = empty_to_none(model_condenser)
    model = build_catalog_display_model(
        model_evaporator=evap,
        model_condenser=cond,
        fallback=empty_to_none(model_fallback),
    )
    split_ac = is_split_ac_category(category)
    if evap and cond:
        component_type = EquipmentCatalogComponentType.UNICO
    elif split_ac and evap and not cond:
        component_type = EquipmentCatalogComponentType.EVAPORADORA
        model = evap
    elif split_ac and cond and not evap:
        component_type = EquipmentCatalogComponentType.CONDENSADORA
        model = cond
    else:
        component_type = EquipmentCatalogComponentType.UNICO
        if (not model or model == "—") and evap:
            model = evap
    return brand_clean, component_type, model


def find_catalog_duplicate(
    db: Session,
    *,
    tenant_id: int,
    category: EquipmentCategory,
    brand: str,
    model_evaporator: str | None = None,
    model_condenser: str | None = None,
    model_fallback: str | None = None,
    exclude_catalog_id: uuid.UUID | None = None,
) -> EquipmentCatalog | None:
    brand_key, component_type, model_key = resolve_catalog_unique_key(
        category,
        brand=brand,
        model_evaporator=model_evaporator,
        model_condenser=model_condenser,
        model_fallback=model_fallback,
    )
    if not brand_key or not model_key or model_key == "—":
        return None

    stmt = select(EquipmentCatalog).where(
        EquipmentCatalog.tenant_id == tenant_id,
        EquipmentCatalog.category_id == category.id,
        EquipmentCatalog.brand == brand_key,
        EquipmentCatalog.component_type == component_type,
        EquipmentCatalog.model == model_key,
    )
    if exclude_catalog_id is not None:
        stmt = stmt.where(EquipmentCatalog.id != exclude_catalog_id)
    return db.execute(stmt).scalar_one_or_none()
