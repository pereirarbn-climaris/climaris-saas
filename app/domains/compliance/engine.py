"""Validation Engine — bloqueia finalização quando requisitos de engenharia não são atendidos."""

from __future__ import annotations

from app.domains.compliance.rules.certification_rules import TechnicianCertificationRule
from app.domains.compliance.rules.evidence_rules import RequiredEvidenceRule
from app.domains.compliance.rules.measurement_rules import RequiredMeasurementRule
from app.domains.compliance.schemas import ComplianceContext, ValidationResult


class ValidationEngine:
    """
    Orquestra regras de compliance para OS digital.

    Fase 3: plugar novas regras via ``register_rule`` sem alterar o core.
    """

    def __init__(self) -> None:
        self._rules = [
            RequiredMeasurementRule(),
            RequiredEvidenceRule(),
            TechnicianCertificationRule(),
        ]

    def register_rule(self, rule: object) -> None:
        self._rules.append(rule)

    def validate_digital_work_order(
        self,
        digital_work_order: object,
        *,
        ctx: ComplianceContext,
    ) -> ValidationResult:
        result = ValidationResult()
        for rule in self._rules:
            errors = rule.evaluate(digital_work_order, ctx)
            for err in errors:
                result.add_error(
                    code=err.code,
                    message=err.message,
                    field=err.field,
                    blocking=err.blocking,
                )
        if not result.errors:
            result.is_valid = True
            result.is_blocking = False
        return result

    def can_finalize_service_order(
        self,
        digital_work_order: object,
        *,
        ctx: ComplianceContext,
    ) -> tuple[bool, ValidationResult]:
        result = self.validate_digital_work_order(digital_work_order, ctx=ctx)
        return (result.is_valid and not result.is_blocking, result)
