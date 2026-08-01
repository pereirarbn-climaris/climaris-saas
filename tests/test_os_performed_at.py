"""Resolução da data de realização ao concluir OS (gestão preventiva)."""

from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.service_order_closure import resolve_os_performed_at
from models import ScheduleStatus


def test_resolve_os_performed_at_uses_explicit_date():
    order = SimpleNamespace(schedules=[])
    performed = resolve_os_performed_at(
        order,
        data_realizacao=date(2026, 4, 15),
        fallback=datetime(2026, 7, 30, 12, 0, tzinfo=timezone.utc),
    )
    assert performed.date() == date(2026, 4, 15)


def test_resolve_os_performed_at_falls_back_to_schedule():
    starts = datetime(2026, 4, 15, 9, 0, tzinfo=timezone.utc)
    order = SimpleNamespace(
        schedules=[
            SimpleNamespace(status=ScheduleStatus.CANCELLED, starts_at=datetime(2026, 1, 1, tzinfo=timezone.utc)),
            SimpleNamespace(status="confirmed", starts_at=starts),
        ]
    )
    performed = resolve_os_performed_at(
        order,
        data_realizacao=None,
        fallback=datetime(2026, 7, 30, 12, 0, tzinfo=timezone.utc),
    )
    assert performed == starts


def test_resolve_os_performed_at_falls_back_to_now_when_no_schedule():
    fallback = datetime(2026, 7, 30, 12, 0, tzinfo=timezone.utc)
    order = SimpleNamespace(schedules=[])
    performed = resolve_os_performed_at(order, data_realizacao=None, fallback=fallback)
    assert performed == fallback
