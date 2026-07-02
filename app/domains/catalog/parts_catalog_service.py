"""Serviço de catálogo de peças — SKU, fabricante e compatibilidade."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from models import PartsCatalogCompatibility, PartsCatalogEntry


class PartsCatalogService:
    def __init__(self, db: Session, *, tenant_id: int) -> None:
        self.db = db
        self.tenant_id = tenant_id

    def get_by_id(self, entry_id: UUID) -> PartsCatalogEntry | None:
        return self.db.execute(
            select(PartsCatalogEntry)
            .where(PartsCatalogEntry.id == entry_id, PartsCatalogEntry.tenant_id == self.tenant_id)
            .options(selectinload(PartsCatalogEntry.compatibilities))
        ).scalar_one_or_none()

    def get_by_sku(self, sku: str) -> PartsCatalogEntry | None:
        return self.db.execute(
            select(PartsCatalogEntry)
            .where(
                PartsCatalogEntry.tenant_id == self.tenant_id,
                PartsCatalogEntry.sku == sku.strip(),
            )
            .options(selectinload(PartsCatalogEntry.compatibilities))
        ).scalar_one_or_none()

    def create_entry(
        self,
        *,
        sku: str,
        name: str,
        description: str | None = None,
        unit: str | None = None,
        manufacturer_partner_id: UUID | None = None,
        compatibilities: list[dict] | None = None,
    ) -> PartsCatalogEntry:
        entry = PartsCatalogEntry(
            tenant_id=self.tenant_id,
            sku=sku.strip(),
            name=name.strip(),
            description=description,
            unit=unit,
            manufacturer_partner_id=manufacturer_partner_id,
        )
        self.db.add(entry)
        self.db.flush()

        for spec in compatibilities or []:
            self.add_compatibility(
                entry,
                equipment_catalog_id=spec.get("equipment_catalog_id"),
                brand=spec.get("brand"),
                model_code=spec.get("model_code"),
                notes=spec.get("notes"),
            )

        return entry

    def add_compatibility(
        self,
        entry: PartsCatalogEntry,
        *,
        equipment_catalog_id: UUID | None = None,
        brand: str | None = None,
        model_code: str | None = None,
        notes: str | None = None,
    ) -> PartsCatalogCompatibility:
        row = PartsCatalogCompatibility(
            parts_catalog_entry_id=entry.id,
            equipment_catalog_id=equipment_catalog_id,
            brand=(brand or "").strip() or None,
            model_code=(model_code or "").strip() or None,
            notes=notes,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def find_compatible_for_model(
        self,
        *,
        model_code: str,
        equipment_catalog_id: UUID | None = None,
    ) -> list[PartsCatalogEntry]:
        model_norm = model_code.strip().lower()
        stmt = (
            select(PartsCatalogEntry)
            .join(PartsCatalogCompatibility)
            .where(
                PartsCatalogEntry.tenant_id == self.tenant_id,
                PartsCatalogEntry.is_active.is_(True),
            )
            .options(selectinload(PartsCatalogEntry.compatibilities))
        )
        if equipment_catalog_id is not None:
            stmt = stmt.where(
                (PartsCatalogCompatibility.equipment_catalog_id == equipment_catalog_id)
                | (PartsCatalogCompatibility.model_code.ilike(model_norm))
            )
        else:
            stmt = stmt.where(PartsCatalogCompatibility.model_code.ilike(model_norm))
        return list(self.db.execute(stmt).scalars().unique().all())
