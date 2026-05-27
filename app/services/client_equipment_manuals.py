"""Manuais PDF vinculados a um equipamento do cliente (catálogo + technical_data)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.services.platform_catalog import catalog_tenant_ids_for_lookup
from app.services.s3 import generate_manual_presigned_url
from models import ClientEquipment, ClientEquipmentComponent, EquipmentCatalog, EquipmentManual

_EXTRA_MANUAL_KEYS: tuple[tuple[str, str], ...] = (
    ("manual_usuario_id", "Manual do usuário"),
    ("manual_instalacao_id", "Manual de instalação"),
    ("manual_servico_id", "Manual de serviço"),
)


def _component_label(catalog: EquipmentCatalog) -> str:
    brand = (catalog.brand or "").strip()
    model = (catalog.model or "").strip()
    parts = [p for p in (brand, model) if p]
    return " · ".join(parts) if parts else "Componente"


def _load_manual(
    db: Session,
    *,
    manual_id: uuid.UUID,
    allowed_tenants: set[int],
) -> EquipmentManual | None:
    return db.execute(
        select(EquipmentManual).where(
            EquipmentManual.id == manual_id,
            EquipmentManual.tenant_id.in_(allowed_tenants),
        )
    ).scalar_one_or_none()


def list_client_equipment_manuals(
    db: Session,
    *,
    tenant_id: int,
    equipment_id: uuid.UUID,
) -> list[dict[str, Any]]:
    installation = db.execute(
        select(ClientEquipment)
        .options(
            joinedload(ClientEquipment.components)
            .joinedload(ClientEquipmentComponent.catalog)
            .joinedload(EquipmentCatalog.manual),
            joinedload(ClientEquipment.components)
            .joinedload(ClientEquipmentComponent.catalog)
            .joinedload(EquipmentCatalog.category),
        )
        .where(
            ClientEquipment.id == equipment_id,
            ClientEquipment.tenant_id == tenant_id,
        )
    ).unique().scalar_one_or_none()

    if installation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado.")

    allowed_tenants = set(catalog_tenant_ids_for_lookup(db, tenant_id))
    seen_ids: set[str] = set()
    items: list[dict[str, Any]] = []

    def append_manual(
        *,
        manual: EquipmentManual,
        kind: str,
        component_label: str | None,
    ) -> None:
        mid = str(manual.id)
        if mid in seen_ids:
            return
        seen_ids.add(mid)
        try:
            download_url = generate_manual_presigned_url(manual.s3_url, db=db)
        except (RuntimeError, ValueError):
            download_url = manual.s3_url
        items.append(
            {
                "id": mid,
                "title": manual.title.strip() or kind,
                "url": download_url,
                "kind": kind,
                "component_label": component_label,
            }
        )

    for component in installation.components:
        catalog = component.catalog
        if catalog is None:
            continue
        comp_label = _component_label(catalog) if len(installation.components) > 1 else None

        if catalog.manual is not None:
            append_manual(
                manual=catalog.manual,
                kind="Manual principal",
                component_label=comp_label,
            )

        td = catalog.technical_data if isinstance(catalog.technical_data, dict) else {}
        for key, kind_label in _EXTRA_MANUAL_KEYS:
            raw_id = td.get(key)
            if not raw_id:
                continue
            try:
                manual_uuid = uuid.UUID(str(raw_id))
            except ValueError:
                continue
            manual = _load_manual(db, manual_id=manual_uuid, allowed_tenants=allowed_tenants)
            if manual is None:
                continue
            append_manual(manual=manual, kind=kind_label, component_label=comp_label)

    items.sort(key=lambda row: (row["component_label"] or "", row["title"].lower()))
    return items
