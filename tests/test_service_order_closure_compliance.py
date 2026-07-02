"""Testes de bloqueio de encerramento por compliance da OS digital."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.domains.compliance.exceptions import ComplianceValidationError
from app.domains.compliance.schemas import ValidationErrorItem, ValidationResult
from app.service_order_closure import assert_can_close_service_order
from models import UserRole


class _FakeDigitalService:
    def __init__(self, digital, *, can_finalize: bool, errors: list | None = None) -> None:
        self._digital = digital
        self._can_finalize = can_finalize
        self._errors = errors or []

    def get_by_service_order_id(self, _service_order_id: int):
        return self._digital

    def evaluate_finalize(self, _digital, *, technician_id: int | None = None):
        result = ValidationResult(
            is_valid=self._can_finalize,
            is_blocking=not self._can_finalize,
            errors=self._errors,
        )
        return self._can_finalize, result


def _patch_digital_service(monkeypatch, fake: _FakeDigitalService) -> None:
    monkeypatch.setattr(
        "app.service_order_closure.DigitalWorkOrderService",
        lambda db, tenant_id: fake,
    )


def test_assert_can_close_without_digital_os(monkeypatch):
    fake = _FakeDigitalService(digital=None, can_finalize=False)
    _patch_digital_service(monkeypatch, fake)
    order = SimpleNamespace(id=1)
    user = SimpleNamespace(id=10, role=UserRole.TECHNICIAN)
    assert_can_close_service_order(
        None,
        order=order,
        tenant_id=1,
        user=user,
        force_close=False,
    )


def test_assert_can_close_blocks_when_compliance_fails(monkeypatch):
    digital_id = uuid4()
    digital = SimpleNamespace(id=digital_id)
    errors = [
        ValidationErrorItem(
            code="measurement_missing",
            message="Medição de pressão ausente",
            field="measurements.pressao_succao",
        )
    ]
    fake = _FakeDigitalService(digital=digital, can_finalize=False, errors=errors)
    _patch_digital_service(monkeypatch, fake)
    order = SimpleNamespace(id=1, technicians=[], schedules=[])
    user = SimpleNamespace(id=10, role=UserRole.TECHNICIAN)

    with pytest.raises(ComplianceValidationError) as exc_info:
        assert_can_close_service_order(
            None,
            order=order,
            tenant_id=1,
            user=user,
            force_close=False,
        )

    assert exc_info.value.digital_work_order_id == digital_id
    assert exc_info.value.missing_requirements[0]["message"] == "Medição de pressão ausente"


def test_assert_can_close_allows_when_compliance_ok(monkeypatch):
    digital = SimpleNamespace(id=uuid4())
    fake = _FakeDigitalService(digital=digital, can_finalize=True)
    _patch_digital_service(monkeypatch, fake)
    order = SimpleNamespace(id=1, technicians=[], schedules=[])
    user = SimpleNamespace(id=10, role=UserRole.TECHNICIAN)
    assert_can_close_service_order(
        None,
        order=order,
        tenant_id=1,
        user=user,
        force_close=False,
    )


def test_force_close_requires_admin(monkeypatch):
    digital = SimpleNamespace(id=uuid4())
    fake = _FakeDigitalService(digital=digital, can_finalize=False)
    _patch_digital_service(monkeypatch, fake)
    order = SimpleNamespace(id=1, technicians=[], schedules=[])
    user = SimpleNamespace(id=10, role=UserRole.TECHNICIAN)

    with pytest.raises(PermissionError):
        assert_can_close_service_order(
            None,
            order=order,
            tenant_id=1,
            user=user,
            force_close=True,
        )


def test_force_close_admin_skips_block(monkeypatch):
    digital = SimpleNamespace(id=uuid4())
    fake = _FakeDigitalService(digital=digital, can_finalize=False)
    _patch_digital_service(monkeypatch, fake)
    order = SimpleNamespace(id=1, technicians=[], schedules=[])
    user = SimpleNamespace(id=1, role=UserRole.ADMIN)
    assert_can_close_service_order(
        None,
        order=order,
        tenant_id=1,
        user=user,
        force_close=True,
    )
