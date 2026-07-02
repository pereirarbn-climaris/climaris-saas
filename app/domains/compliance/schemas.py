"""Tipos compartilhados do motor de compliance."""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from pydantic import BaseModel, Field


class ComplianceContext(BaseModel):
    tenant_id: int
    technician_id: int | None = None
    equipment_asset_id: UUID | None = None


class ValidationErrorItem(BaseModel):
    code: str
    message: str
    field: str | None = None
    blocking: bool = True


@dataclass
class ValidationResult:
    is_valid: bool = True
    is_blocking: bool = False
    errors: list[ValidationErrorItem] = field(default_factory=list)

    def add_error(
        self,
        *,
        code: str,
        message: str,
        field: str | None = None,
        blocking: bool = True,
    ) -> None:
        self.errors.append(
            ValidationErrorItem(code=code, message=message, field=field, blocking=blocking)
        )
        if blocking:
            self.is_blocking = True
        self.is_valid = False


class ComplianceRule(BaseModel):
    """Contrato base para regras plugáveis no ValidationEngine."""

    code: str
    description: str = ""
    blocking: bool = True

    def evaluate(self, digital_work_order: object, ctx: ComplianceContext) -> list[ValidationErrorItem]:
        raise NotImplementedError
