"""Schemas Pydantic de certificação técnica."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TechnicianCertificationModelIn(BaseModel):
    equipment_catalog_id: UUID | None = None
    brand: str | None = None
    model_code: str = Field(min_length=1, max_length=120)


class TechnicianCertificationModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    equipment_catalog_id: UUID | None
    brand: str | None
    model_code: str


class TechnicianCertificationCreate(BaseModel):
    technician_id: int
    manufacturer_partner_id: UUID
    certification_code: str | None = None
    issued_at: date | None = None
    expires_at: date | None = None
    homologated_models: list[TechnicianCertificationModelIn] = Field(default_factory=list)


class TechnicianCertificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: int
    technician_id: int
    manufacturer_partner_id: UUID
    certification_code: str | None
    status: str
    issued_at: date | None
    expires_at: date | None
    homologated_models: list[TechnicianCertificationModelOut] = Field(default_factory=list)
