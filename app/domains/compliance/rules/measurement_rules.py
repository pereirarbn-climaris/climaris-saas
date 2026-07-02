"""Regra: medições obrigatórias de engenharia presentes e preenchidas."""

from __future__ import annotations

from app.domains.compliance.schemas import ComplianceContext, ValidationErrorItem


class RequiredMeasurementRule:
    code = "required_measurements"
    description = "Medições obrigatórias de engenharia devem estar preenchidas."
    blocking = True

    def evaluate(self, digital_work_order: object, ctx: ComplianceContext) -> list[ValidationErrorItem]:
        snapshot = getattr(digital_work_order, "required_fields_snapshot", None) or {}
        required_defs = snapshot.get("required_measurements") or []
        if not required_defs:
            return []

        measurements = {m.metric_key: m for m in getattr(digital_work_order, "measurements", [])}
        errors: list[ValidationErrorItem] = []

        for spec in required_defs:
            key = str(spec.get("key") or "").strip()
            if not key:
                continue
            row = measurements.get(key)
            if row is None:
                label = spec.get("label") or key
                errors.append(
                    ValidationErrorItem(
                        code="measurement_missing",
                        message=f"Medição obrigatória ausente: {label}",
                        field=f"measurements.{key}",
                        blocking=True,
                    )
                )
                continue
            has_value = row.value_numeric is not None or bool((row.value_text or "").strip())
            if not has_value:
                label = spec.get("label") or key
                errors.append(
                    ValidationErrorItem(
                        code="measurement_empty",
                        message=f"Medição obrigatória sem valor: {label}",
                        field=f"measurements.{key}",
                        blocking=True,
                    )
                )

        return errors
