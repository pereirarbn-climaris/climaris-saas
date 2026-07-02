"""Exceções do motor de compliance."""

from __future__ import annotations

from uuid import UUID


class ComplianceValidationError(Exception):
    """Bloqueio de encerramento por requisitos de engenharia/compliance incompletos."""

    def __init__(
        self,
        *,
        missing_requirements: list[dict],
        digital_work_order_id: UUID | None = None,
    ) -> None:
        self.missing_requirements = missing_requirements
        self.digital_work_order_id = digital_work_order_id
        messages = [str(item.get("message") or "").strip() for item in missing_requirements]
        messages = [m for m in messages if m]
        summary = "; ".join(messages) if messages else "Requisitos de compliance incompletos."
        super().__init__(summary)
