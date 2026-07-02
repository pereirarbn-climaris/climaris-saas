"""Serviço de OS digital — criação, medições e evidências."""

from __future__ import annotations

from dataclasses import dataclass

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.domains.compliance.engine import ValidationEngine
from app.domains.compliance.schemas import ComplianceContext, ValidationResult
from models import (
    DigitalWorkOrder,
    DigitalWorkOrderEvidence,
    DigitalWorkOrderEvidenceType,
    DigitalWorkOrderMeasurement,
    DigitalWorkOrderSyncStatus,
    DigitalWorkOrderValidationStatus,
    Schedule,
    ServiceOrder,
    SyncAuditLog,
)


DEFAULT_COMPLIANCE_SCHEMA_V1: dict = {
    "version": "1.0",
    "required_measurements": [
        {"key": "pressao_succao", "unit": "psi", "label": "Pressão de sucção"},
        {"key": "pressao_descarga", "unit": "psi", "label": "Pressão de descarga"},
        {"key": "corrente_compressor", "unit": "A", "label": "Corrente do compressor"},
        {"key": "temp_evaporacao", "unit": "°C", "label": "Temperatura de evaporação"},
    ],
    "required_evidences": [
        {"key": "placa_identificacao", "type": "photo", "label": "Foto da placa de identificação"},
        {"key": "ambiente_instalacao", "type": "photo", "label": "Foto do ambiente de instalação"},
    ],
}


@dataclass(frozen=True)
class SyncMutationResult:
    conflict_detected: bool
    version: int


@dataclass(frozen=True)
class EvidenceSyncResult:
    mutation: SyncMutationResult
    evidence: DigitalWorkOrderEvidence


class DigitalWorkOrderService:
    def __init__(self, db: Session, *, tenant_id: int) -> None:
        self.db = db
        self.tenant_id = tenant_id
        self._validator = ValidationEngine()

    def get_by_id(self, digital_id: UUID) -> DigitalWorkOrder | None:
        return self.db.execute(
            select(DigitalWorkOrder)
            .where(
                DigitalWorkOrder.id == digital_id,
                DigitalWorkOrder.tenant_id == self.tenant_id,
            )
            .options(
                selectinload(DigitalWorkOrder.measurements),
                selectinload(DigitalWorkOrder.evidences),
                selectinload(DigitalWorkOrder.service_order)
                .selectinload(ServiceOrder.technicians),
                selectinload(DigitalWorkOrder.service_order)
                .selectinload(ServiceOrder.schedules)
                .selectinload(Schedule.technicians),
            )
        ).scalar_one_or_none()

    def get_by_service_order_id(self, service_order_id: int) -> DigitalWorkOrder | None:
        return self.db.execute(
            select(DigitalWorkOrder)
            .where(
                DigitalWorkOrder.service_order_id == service_order_id,
                DigitalWorkOrder.tenant_id == self.tenant_id,
            )
            .options(
                selectinload(DigitalWorkOrder.measurements),
                selectinload(DigitalWorkOrder.evidences),
            )
        ).scalar_one_or_none()

    def ensure_for_service_order(
        self,
        order: ServiceOrder,
        *,
        equipment_asset_id: UUID | None = None,
        compliance_schema_version: str = "1.0",
    ) -> DigitalWorkOrder:
        existing = self.get_by_service_order_id(order.id)
        if existing is not None:
            return existing

        snapshot = DEFAULT_COMPLIANCE_SCHEMA_V1 if compliance_schema_version == "1.0" else {"version": compliance_schema_version}
        digital = DigitalWorkOrder(
            tenant_id=self.tenant_id,
            service_order_id=order.id,
            equipment_asset_id=equipment_asset_id,
            compliance_schema_version=compliance_schema_version,
            required_fields_snapshot=snapshot,
            validation_status=DigitalWorkOrderValidationStatus.DRAFT,
        )
        self.db.add(digital)
        self.db.flush()
        return digital

    def detect_sync_conflict(
        self,
        digital: DigitalWorkOrder,
        *,
        last_version: int | None,
        sync_kind: str,
        actor_user_id: int | None = None,
        metadata: dict | None = None,
    ) -> bool:
        """Compara ``last_version`` do cliente com a versão atual. Registra auditoria se divergir."""
        if last_version is None:
            return False
        if last_version == digital.version:
            return False

        log = SyncAuditLog(
            tenant_id=self.tenant_id,
            digital_work_order_id=digital.id,
            client_last_version=last_version,
            server_version=digital.version,
            sync_kind=sync_kind,
            resolution="field_priority",
            metadata_json=metadata or {},
            actor_user_id=actor_user_id,
        )
        self.db.add(log)
        self.db.flush()
        return True

    def complete_sync_mutation(self, digital: DigitalWorkOrder) -> int:
        digital.version += 1
        digital.last_synced_at = datetime.now(timezone.utc)
        self.db.flush()
        return digital.version

    def apply_measurements_sync(
        self,
        digital: DigitalWorkOrder,
        *,
        measurements: list[dict],
        last_version: int | None,
        actor_user_id: int | None,
    ) -> SyncMutationResult:
        conflict = self.detect_sync_conflict(
            digital,
            last_version=last_version,
            sync_kind="measurements",
            actor_user_id=actor_user_id,
            metadata={"measurement_count": len(measurements)},
        )
        for item in measurements:
            self.upsert_measurement(digital, recorded_by_user_id=actor_user_id, **item)
        version = self.complete_sync_mutation(digital)
        return SyncMutationResult(conflict_detected=conflict, version=version)

    def apply_evidence_sync(
        self,
        digital: DigitalWorkOrder,
        *,
        evidence_key: str,
        last_version: int | None,
        actor_user_id: int | None,
        **evidence_kwargs,
    ) -> EvidenceSyncResult:
        conflict = self.detect_sync_conflict(
            digital,
            last_version=last_version,
            sync_kind="evidence",
            actor_user_id=actor_user_id,
            metadata={"evidence_key": evidence_key},
        )
        evidence = self.upsert_evidence(
            digital,
            evidence_key=evidence_key,
            captured_by_user_id=actor_user_id,
            **evidence_kwargs,
        )
        version = self.complete_sync_mutation(digital)
        return EvidenceSyncResult(
            mutation=SyncMutationResult(conflict_detected=conflict, version=version),
            evidence=evidence,
        )

    def apply_evidences_batch_sync(
        self,
        digital: DigitalWorkOrder,
        *,
        evidences: list[dict],
        last_version: int | None,
        actor_user_id: int | None,
    ) -> tuple[SyncMutationResult, list[DigitalWorkOrderEvidence]]:
        conflict = self.detect_sync_conflict(
            digital,
            last_version=last_version,
            sync_kind="evidences",
            actor_user_id=actor_user_id,
            metadata={"evidence_count": len(evidences)},
        )
        saved: list[DigitalWorkOrderEvidence] = []
        for item in evidences:
            evidence_key = item["evidence_key"]
            kwargs = {k: v for k, v in item.items() if k != "evidence_key"}
            saved.append(
                self.upsert_evidence(
                    digital,
                    evidence_key=evidence_key,
                    captured_by_user_id=actor_user_id,
                    **kwargs,
                )
            )
        version = self.complete_sync_mutation(digital)
        return SyncMutationResult(conflict_detected=conflict, version=version), saved

    def upsert_measurement(
        self,
        digital: DigitalWorkOrder,
        *,
        metric_key: str,
        value_numeric: float | None = None,
        value_text: str | None = None,
        unit: str | None = None,
        is_required: bool = True,
        recorded_by_user_id: int | None = None,
        recorded_offline: bool = False,
    ) -> DigitalWorkOrderMeasurement:
        row = self.db.execute(
            select(DigitalWorkOrderMeasurement).where(
                DigitalWorkOrderMeasurement.digital_work_order_id == digital.id,
                DigitalWorkOrderMeasurement.metric_key == metric_key,
            )
        ).scalar_one_or_none()

        sync_status = (
            DigitalWorkOrderSyncStatus.PENDING if recorded_offline else DigitalWorkOrderSyncStatus.SYNCED
        )

        if row is None:
            row = DigitalWorkOrderMeasurement(
                digital_work_order_id=digital.id,
                metric_key=metric_key,
                is_required=is_required,
            )
            self.db.add(row)

        row.value_numeric = value_numeric
        row.value_text = value_text
        row.unit = unit
        row.is_required = is_required
        row.recorded_by_user_id = recorded_by_user_id
        row.recorded_offline = recorded_offline
        row.sync_status = sync_status
        row.recorded_at = datetime.now(timezone.utc)
        self.db.flush()
        return row

    def upsert_evidence(
        self,
        digital: DigitalWorkOrder,
        *,
        evidence_key: str,
        evidence_type: str = "photo",
        storage_key: str | None = None,
        mime_type: str | None = None,
        is_required: bool = False,
        latitude: float | None = None,
        longitude: float | None = None,
        accuracy_meters: float | None = None,
        captured_by_user_id: int | None = None,
        captured_offline: bool = False,
    ) -> DigitalWorkOrderEvidence:
        row = self.db.execute(
            select(DigitalWorkOrderEvidence).where(
                DigitalWorkOrderEvidence.digital_work_order_id == digital.id,
                DigitalWorkOrderEvidence.evidence_key == evidence_key,
            )
        ).scalar_one_or_none()

        try:
            ev_type = DigitalWorkOrderEvidenceType(evidence_type)
        except ValueError:
            ev_type = DigitalWorkOrderEvidenceType.PHOTO

        sync_status = (
            DigitalWorkOrderSyncStatus.PENDING if captured_offline else DigitalWorkOrderSyncStatus.SYNCED
        )

        if row is None:
            row = DigitalWorkOrderEvidence(
                digital_work_order_id=digital.id,
                evidence_key=evidence_key,
                evidence_type=ev_type,
                is_required=is_required,
            )
            self.db.add(row)

        row.evidence_type = ev_type
        row.storage_key = storage_key
        row.mime_type = mime_type
        row.is_required = is_required
        row.latitude = latitude
        row.longitude = longitude
        row.accuracy_meters = accuracy_meters
        row.captured_by_user_id = captured_by_user_id
        row.captured_offline = captured_offline
        row.sync_status = sync_status
        row.captured_at = datetime.now(timezone.utc)
        self.db.flush()
        return row

    def add_evidence(
        self,
        digital: DigitalWorkOrder,
        *,
        evidence_key: str,
        evidence_type: str = "photo",
        storage_key: str | None = None,
        mime_type: str | None = None,
        is_required: bool = False,
        latitude: float | None = None,
        longitude: float | None = None,
        accuracy_meters: float | None = None,
        captured_by_user_id: int | None = None,
        captured_offline: bool = False,
    ) -> DigitalWorkOrderEvidence:
        try:
            ev_type = DigitalWorkOrderEvidenceType(evidence_type)
        except ValueError:
            ev_type = DigitalWorkOrderEvidenceType.PHOTO

        sync_status = (
            DigitalWorkOrderSyncStatus.PENDING if captured_offline else DigitalWorkOrderSyncStatus.SYNCED
        )

        evidence = DigitalWorkOrderEvidence(
            digital_work_order_id=digital.id,
            evidence_key=evidence_key,
            evidence_type=ev_type,
            storage_key=storage_key,
            mime_type=mime_type,
            is_required=is_required,
            latitude=latitude,
            longitude=longitude,
            accuracy_meters=accuracy_meters,
            captured_by_user_id=captured_by_user_id,
            captured_offline=captured_offline,
            sync_status=sync_status,
        )
        self.db.add(evidence)
        self.db.flush()
        return evidence

    def evaluate_finalize(
        self, digital: DigitalWorkOrder, *, technician_id: int | None = None
    ) -> tuple[bool, ValidationResult]:
        """Executa ``ValidationEngine.can_finalize_service_order`` e persiste status."""
        self.db.refresh(digital, attribute_names=["measurements", "evidences"])
        ctx = ComplianceContext(
            tenant_id=self.tenant_id,
            technician_id=technician_id,
            equipment_asset_id=digital.equipment_asset_id,
        )
        can_finalize, result = self._validator.can_finalize_service_order(digital, ctx=ctx)
        digital.validation_errors = [e.model_dump() for e in result.errors]
        digital.validation_status = (
            DigitalWorkOrderValidationStatus.READY
            if can_finalize
            else DigitalWorkOrderValidationStatus.BLOCKED
            if result.is_blocking
            else DigitalWorkOrderValidationStatus.INCOMPLETE
        )
        digital.last_validated_at = datetime.now(timezone.utc)
        self.db.flush()
        return can_finalize, result

    def validate(self, digital: DigitalWorkOrder, *, technician_id: int | None = None) -> DigitalWorkOrder:
        """Executa o motor de compliance e atualiza status da OS digital."""
        self.db.refresh(digital, attribute_names=["measurements", "evidences"])
        ctx = ComplianceContext(
            tenant_id=self.tenant_id,
            technician_id=technician_id,
            equipment_asset_id=digital.equipment_asset_id,
        )
        result = self._validator.validate_digital_work_order(digital, ctx=ctx)
        digital.validation_errors = [e.model_dump() for e in result.errors]
        digital.validation_status = (
            DigitalWorkOrderValidationStatus.READY
            if result.is_valid
            else DigitalWorkOrderValidationStatus.BLOCKED
            if result.is_blocking
            else DigitalWorkOrderValidationStatus.INCOMPLETE
        )
        digital.last_validated_at = datetime.now(timezone.utc)
        self.db.flush()
        return digital
