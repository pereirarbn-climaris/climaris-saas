"""Regra: evidências obrigatórias (fotos geolocalizadas) presentes."""

from __future__ import annotations

from app.domains.compliance.schemas import ComplianceContext, ValidationErrorItem


class RequiredEvidenceRule:
    code = "required_evidences"
    description = "Evidências fotográficas obrigatórias devem estar anexadas."
    blocking = True

    def evaluate(self, digital_work_order: object, ctx: ComplianceContext) -> list[ValidationErrorItem]:
        snapshot = getattr(digital_work_order, "required_fields_snapshot", None) or {}
        required_defs = snapshot.get("required_evidences") or []
        if not required_defs:
            return []

        evidences = {e.evidence_key: e for e in getattr(digital_work_order, "evidences", [])}
        errors: list[ValidationErrorItem] = []

        for spec in required_defs:
            key = str(spec.get("key") or "").strip()
            if not key:
                continue
            row = evidences.get(key)
            if row is None or not (row.storage_key or "").strip():
                label = spec.get("label") or key
                errors.append(
                    ValidationErrorItem(
                        code="evidence_missing",
                        message=f"Evidência obrigatória ausente: {label}",
                        field=f"evidences.{key}",
                        blocking=True,
                    )
                )
                continue
            if row.latitude is None or row.longitude is None:
                label = spec.get("label") or key
                errors.append(
                    ValidationErrorItem(
                        code="evidence_not_geolocated",
                        message=f"Evidência sem geolocalização: {label}",
                        field=f"evidences.{key}",
                        blocking=True,
                    )
                )

        return errors
