from __future__ import annotations

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from app.tenant_business_calendar import (
    effective_preventive_reminder_day,
    is_tenant_business_day,
    is_within_tenant_work_hours,
    previous_business_day,
)


class _TenantStub:
    def __init__(
        self,
        *,
        business_days: str = "0,1,2,3,4",
        workday_start: str = "08:30",
        workday_end: str = "18:00",
        timezone: str = "America/Sao_Paulo",
        weekday_work_hours: str | None = None,
    ) -> None:
        self.business_days = business_days
        self.workday_start = workday_start
        self.workday_end = workday_end
        self.timezone = timezone
        self.weekday_work_hours = weekday_work_hours


def test_effective_reminder_advance_on_weekday():
    tenant = _TenantStub()
    due = date(2026, 5, 26)  # terça
    assert effective_preventive_reminder_day(tenant, due, 7, set()) == date(2026, 5, 19)


def test_effective_reminder_advance_from_sunday_to_friday():
    tenant = _TenantStub()
    due = date(2026, 5, 25)  # segunda; 7 dias antes = domingo 18
    assert effective_preventive_reminder_day(tenant, due, 7, set()) == date(2026, 5, 15)


def test_effective_reminder_due_on_weekend_moves_to_monday():
    tenant = _TenantStub()
    due = date(2026, 5, 24)  # domingo
    assert effective_preventive_reminder_day(tenant, due, 0, set()) == date(2026, 5, 25)


def test_is_within_work_hours_respects_expediente():
    tenant = _TenantStub(workday_start="08:30", workday_end="18:00")
    tz = ZoneInfo("America/Sao_Paulo")
    inside = datetime(2026, 5, 26, 14, 0, tzinfo=tz).astimezone(timezone.utc)
    before = datetime(2026, 5, 26, 7, 0, tzinfo=tz).astimezone(timezone.utc)
    weekend = datetime(2026, 5, 24, 10, 0, tzinfo=tz).astimezone(timezone.utc)
    assert is_within_tenant_work_hours(tenant, inside, set()) is True
    assert is_within_tenant_work_hours(tenant, before, set()) is False
    assert is_within_tenant_work_hours(tenant, weekend, set()) is False


def test_previous_business_day_skips_weekend():
    tenant = _TenantStub()
    assert previous_business_day(tenant, date(2026, 5, 17), set()) == date(2026, 5, 15)


def test_is_tenant_business_day_honors_weekend():
    tenant = _TenantStub()
    assert is_tenant_business_day(tenant, date(2026, 5, 26), set()) is True
    assert is_tenant_business_day(tenant, date(2026, 5, 24), set()) is False
