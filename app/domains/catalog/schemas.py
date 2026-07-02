"""Schemas Pydantic do catálogo de peças."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PartsCatalogCompatibilityIn(BaseModel):
    equipment_catalog_id: UUID | None = None
    brand: str | None = None
    model_code: str | None = None
    notes: str | None = None


class PartsCatalogCompatibilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    equipment_catalog_id: UUID | None
    brand: str | None
    model_code: str | None
    notes: str | None


class PartsCatalogEntryCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    unit: str | None = None
    manufacturer_partner_id: UUID | None = None
    compatibilities: list[PartsCatalogCompatibilityIn] = Field(default_factory=list)


class PartsCatalogEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: int
    manufacturer_partner_id: UUID | None
    sku: str
    name: str
    description: str | None
    unit: str | None
    is_active: bool
    compatibilities: list[PartsCatalogCompatibilityOut] = Field(default_factory=list)
