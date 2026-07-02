"""Schemas Pydantic da OS digital."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DigitalWorkOrderMeasurementIn(BaseModel):
    metric_key: str = Field(min_length=1, max_length=64)
    value_numeric: float | None = None
    value_text: str | None = None
    unit: str | None = None
    is_required: bool = True
    recorded_offline: bool = False


class DigitalWorkOrderEvidenceIn(BaseModel):
    evidence_key: str = Field(min_length=1, max_length=64)
    evidence_type: str = "photo"
    storage_key: str | None = None
    mime_type: str | None = None
    is_required: bool = False
    latitude: float | None = None
    longitude: float | None = None
    accuracy_meters: float | None = None
    captured_offline: bool = False


class DigitalWorkOrderMeasurementsBatchIn(BaseModel):
    last_version: int | None = None
    measurements: list[DigitalWorkOrderMeasurementIn] = Field(min_length=1)


class DigitalWorkOrderEvidencesBatchIn(BaseModel):
    last_version: int | None = None
    evidences: list[DigitalWorkOrderEvidenceIn] = Field(min_length=1)


class MissingRequirementOut(BaseModel):
    code: str
    message: str
    field: str | None = None
    blocking: bool = True


class DigitalWorkOrderValidateOut(BaseModel):
    can_finalize: bool
    missing_requirements: list[MissingRequirementOut]


class DigitalWorkOrderMeasurementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    metric_key: str
    value_numeric: float | None
    value_text: str | None
    unit: str | None
    is_required: bool
    recorded_offline: bool
    sync_status: str


class DigitalWorkOrderEvidenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    evidence_key: str
    evidence_type: str
    storage_key: str | None
    latitude: float | None
    longitude: float | None
    captured_offline: bool
    sync_status: str


class DigitalWorkOrderMeasurementsBatchOut(BaseModel):
    measurements: list[DigitalWorkOrderMeasurementOut]
    conflict_detected: bool = False
    version: int


class DigitalWorkOrderEvidencesBatchOut(BaseModel):
    evidences: list[DigitalWorkOrderEvidenceOut]
    conflict_detected: bool = False
    version: int


class DigitalWorkOrderEvidenceUploadOut(BaseModel):
    evidence: DigitalWorkOrderEvidenceOut
    conflict_detected: bool = False
    version: int


class DigitalWorkOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: int
    service_order_id: int
    equipment_asset_id: UUID | None
    compliance_schema_version: str
    validation_status: str
    validation_errors: list
    last_validated_at: datetime | None
    offline_client_id: str | None
    last_synced_at: datetime | None
    version: int


class DigitalWorkOrderDetailOut(DigitalWorkOrderOut):
    evidences: list[DigitalWorkOrderEvidenceOut] = Field(default_factory=list)
