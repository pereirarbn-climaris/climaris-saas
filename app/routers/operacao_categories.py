from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.schemas import (
    EquipmentCategoryCreate,
    EquipmentCategoryListOut,
    EquipmentCategoryOut,
    EquipmentCategoryUpdate,
)
from app.services.category_field_definitions import (
    CategoryFieldDefinition,
    default_definitions_from_legacy,
    legacy_flags_from_definitions,
    parse_field_definitions,
    serialize_field_definitions,
    slugify_field_key,
)
from app.services.equipment_category_icons import normalize_icon_key
from app.services.platform_catalog import resolve_catalog_list_tenant_id, resolve_catalog_write_tenant_id
from models import EquipmentCatalog, EquipmentCategory, User, UserRole

router = APIRouter(prefix="/operacao/categories", tags=["operacao-categories"])


def _category_query(tenant_id: int):
    return (
        select(EquipmentCategory)
        .where(EquipmentCategory.tenant_id == tenant_id)
        .order_by(EquipmentCategory.sort_order.asc(), EquipmentCategory.name.asc())
    )


def _build_field_definitions_from_payload(
    payload_defs: list | None,
    *,
    has_fluid_type: bool,
    has_capacity: bool,
    has_voltage: bool,
) -> list[CategoryFieldDefinition]:
    if payload_defs is not None and len(payload_defs) > 0:
        raw_list: list[dict] = []
        for item in payload_defs:
            data = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            key = data.get("key") or slugify_field_key(str(data.get("name", "")))
            if not key:
                continue
            data["key"] = key
            raw_list.append(data)
        return parse_field_definitions(raw_list)
    return parse_field_definitions(
        default_definitions_from_legacy(
            has_capacity=has_capacity,
            has_fluid_type=has_fluid_type,
            has_voltage=has_voltage,
        )
    )


def _apply_field_definitions_to_row(
    row: EquipmentCategory,
    definitions: list[CategoryFieldDefinition],
) -> None:
    row.field_definitions = serialize_field_definitions(definitions)
    has_capacity, has_fluid, has_voltage = legacy_flags_from_definitions(definitions)
    row.has_capacity = has_capacity
    row.has_fluid_type = has_fluid
    row.has_voltage = has_voltage


def _get_category_or_404(
    db: Session, category_id: uuid.UUID, tenant_id: int
) -> EquipmentCategory:
    row = db.execute(
        select(EquipmentCategory).where(
            EquipmentCategory.id == category_id,
            EquipmentCategory.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria não encontrada.")
    return row


@router.get(
    "",
    response_model=EquipmentCategoryListOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def list_equipment_categories(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentCategoryListOut:
    catalog_tenant_id = resolve_catalog_list_tenant_id(db, current_user)
    rows = db.execute(_category_query(catalog_tenant_id)).scalars().all()
    return EquipmentCategoryListOut(items=[EquipmentCategoryOut.model_validate(row) for row in rows])


@router.post(
    "",
    response_model=EquipmentCategoryOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def create_equipment_category(
    payload: EquipmentCategoryCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentCategory:
    name = payload.name.strip()
    definitions = _build_field_definitions_from_payload(
        payload.field_definitions,
        has_fluid_type=payload.has_fluid_type,
        has_capacity=payload.has_capacity,
        has_voltage=payload.has_voltage,
    )
    row = EquipmentCategory(
        tenant_id=resolve_catalog_write_tenant_id(db, current_user),
        name=name,
        icon_key=normalize_icon_key(payload.icon_key, fallback_name=name),
        sort_order=payload.sort_order,
        has_fluid_type=payload.has_fluid_type,
        has_capacity=payload.has_capacity,
        has_voltage=payload.has_voltage,
        field_definitions=[],
    )
    _apply_field_definitions_to_row(row, definitions)
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma categoria com este nome.",
        ) from exc
    db.refresh(row)
    return row


@router.patch(
    "/{category_id}",
    response_model=EquipmentCategoryOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def update_equipment_category(
    category_id: uuid.UUID,
    payload: EquipmentCategoryUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentCategory:
    tenant_id = resolve_catalog_write_tenant_id(db, current_user)
    row = _get_category_or_404(db, category_id, tenant_id)

    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.icon_key is not None:
        row.icon_key = normalize_icon_key(payload.icon_key, fallback_name=row.name)
    if payload.sort_order is not None:
        row.sort_order = payload.sort_order
    if payload.has_fluid_type is not None:
        row.has_fluid_type = payload.has_fluid_type
    if payload.has_capacity is not None:
        row.has_capacity = payload.has_capacity
    if payload.has_voltage is not None:
        row.has_voltage = payload.has_voltage

    if payload.field_definitions is not None:
        definitions = _build_field_definitions_from_payload(
            payload.field_definitions,
            has_fluid_type=row.has_fluid_type,
            has_capacity=row.has_capacity,
            has_voltage=row.has_voltage,
        )
        _apply_field_definitions_to_row(row, definitions)
    elif any(
        v is not None
        for v in (payload.has_fluid_type, payload.has_capacity, payload.has_voltage)
    ):
        definitions = _build_field_definitions_from_payload(
            None,
            has_fluid_type=row.has_fluid_type,
            has_capacity=row.has_capacity,
            has_voltage=row.has_voltage,
        )
        _apply_field_definitions_to_row(row, definitions)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma categoria com este nome.",
        ) from exc
    db.refresh(row)
    return row


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def delete_equipment_category(
    category_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    tenant_id = resolve_catalog_write_tenant_id(db, current_user)
    row = _get_category_or_404(db, category_id, tenant_id)

    in_use = db.execute(
        select(func.count())
        .select_from(EquipmentCatalog)
        .where(
            EquipmentCatalog.category_id == row.id,
            EquipmentCatalog.tenant_id == tenant_id,
        )
    ).scalar_one()
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não é possível excluir: existem modelos no catálogo usando esta categoria.",
        )

    db.delete(row)
    db.commit()
