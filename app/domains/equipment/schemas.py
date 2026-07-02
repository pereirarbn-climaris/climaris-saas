"""Schemas Pydantic do domínio de equipamento industrial."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EquipmentWarrantyRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    warranty_type: str
    starts_at: date
    ends_at: date | None
    manufacturer_reference: str | None
    notes: str | None
    created_at: datetime


class EquipmentAssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: int
    client_id: int
    manufacturer_partner_id: UUID | None
    legacy_equipment_id: int | None
    client_equipment_id: UUID | None
    equipment_catalog_id: UUID | None
    serial_number: str
    model_code: str
    brand: str | None
    installation_date: date | None
    warranty_status: str
    manufacturer_reference: str | None
    is_active: bool
    warranty_records: list[EquipmentWarrantyRecordOut] = Field(default_factory=list)


class EquipmentAssetCreate(BaseModel):
    client_id: int
    serial_number: str = Field(min_length=1, max_length=120)
    model_code: str = Field(min_length=1, max_length=120)
    brand: str | None = None
    installation_date: date | None = None
    manufacturer_partner_id: UUID | None = None
    legacy_equipment_id: int | None = None
    client_equipment_id: UUID | None = None
    equipment_catalog_id: UUID | None = None
    manufacturer_reference: str | None = None
