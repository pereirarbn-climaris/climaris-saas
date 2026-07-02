"""Testes de resolução de conflito na sincronização da OS digital."""

from __future__ import annotations

from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.domains.work_orders.digital_os_service import DigitalWorkOrderService


@pytest.fixture
def digital_order():
    order = MagicMock()
    order.id = uuid4()
    order.version = 3
    order.tenant_id = 1
    order.measurements = []
    order.evidences = []
    return order


def test_apply_measurements_sync_accepts_field_priority_on_version_mismatch(digital_order):
    db = MagicMock()
    service = DigitalWorkOrderService(db, tenant_id=1)
    service.upsert_measurement = MagicMock(return_value=MagicMock())
    service.detect_sync_conflict = MagicMock(return_value=True)
    service.complete_sync_mutation = MagicMock(return_value=4)

    result = service.apply_measurements_sync(
        digital_order,
        measurements=[{"metric_key": "pressao_succao", "value_numeric": 42.0, "recorded_offline": True}],
        last_version=2,
        actor_user_id=10,
    )

    assert result.conflict_detected is True
    assert result.version == 4
    service.detect_sync_conflict.assert_called_once()
    service.upsert_measurement.assert_called_once()
    service.complete_sync_mutation.assert_called_once_with(digital_order)


def test_detect_sync_conflict_skips_when_versions_match(digital_order):
    db = MagicMock()
    service = DigitalWorkOrderService(db, tenant_id=1)

    conflict = service.detect_sync_conflict(
        digital_order,
        last_version=3,
        sync_kind="measurements",
        actor_user_id=10,
    )

    assert conflict is False
    db.add.assert_not_called()


def test_detect_sync_conflict_logs_when_versions_differ(digital_order):
    db = MagicMock()
    service = DigitalWorkOrderService(db, tenant_id=1)

    conflict = service.detect_sync_conflict(
        digital_order,
        last_version=1,
        sync_kind="measurements",
        actor_user_id=10,
        metadata={"measurement_count": 1},
    )

    assert conflict is True
    db.add.assert_called_once()
    db.flush.assert_called_once()
