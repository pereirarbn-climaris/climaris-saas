"""Serviços de registro industrial de equipamento."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from models import EquipmentAsset, EquipmentAssetWarrantyStatus, EquipmentWarrantyRecord


class EquipmentAssetService:
    def __init__(self, db: Session, *, tenant_id: int) -> None:
        self.db = db
        self.tenant_id = tenant_id

    def get_by_id(self, asset_id: UUID) -> EquipmentAsset | None:
        return self.db.execute(
            select(EquipmentAsset)
            .where(EquipmentAsset.id == asset_id, EquipmentAsset.tenant_id == self.tenant_id)
            .options(selectinload(EquipmentAsset.warranty_records))
        ).scalar_one_or_none()

    def create_asset(
        self,
        *,
        client_id: int,
        serial_number: str,
        model_code: str,
        brand: str | None = None,
        installation_date: date | None = None,
        manufacturer_partner_id: UUID | None = None,
        legacy_equipment_id: int | None = None,
        client_equipment_id: UUID | None = None,
        equipment_catalog_id: UUID | None = None,
        manufacturer_reference: str | None = None,
    ) -> EquipmentAsset:
        asset = EquipmentAsset(
            tenant_id=self.tenant_id,
            client_id=client_id,
            serial_number=serial_number.strip(),
            model_code=model_code.strip(),
            brand=(brand or "").strip() or None,
            installation_date=installation_date,
            manufacturer_partner_id=manufacturer_partner_id,
            legacy_equipment_id=legacy_equipment_id,
            client_equipment_id=client_equipment_id,
            equipment_catalog_id=equipment_catalog_id,
            manufacturer_reference=(manufacturer_reference or "").strip() or None,
            warranty_status=EquipmentAssetWarrantyStatus.UNKNOWN,
        )
        self.db.add(asset)
        self.db.flush()
        return asset

    def add_warranty_record(
        self,
        asset: EquipmentAsset,
        *,
        warranty_type: str,
        starts_at: date,
        ends_at: date | None = None,
        manufacturer_reference: str | None = None,
        notes: str | None = None,
    ) -> EquipmentWarrantyRecord:
        record = EquipmentWarrantyRecord(
            equipment_asset_id=asset.id,
            warranty_type=warranty_type,
            starts_at=starts_at,
            ends_at=ends_at,
            manufacturer_reference=manufacturer_reference,
            notes=notes,
        )
        self.db.add(record)
        self.db.flush()
        return record
