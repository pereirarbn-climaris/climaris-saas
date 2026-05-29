"""Dias úteis, feriados e expediente da empresa (envios automáticos WhatsApp)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.tenant_work_hours import parse_business_days, tenant_weekday_schedule_rows
from models import Tenant, TenantHoliday

_FIXED_NATIONAL_HOLIDAYS_MM_DD = frozenset(
    {
        "01-01",
        "04-21",
        "05-01",
        "09-07",
        "10-12",
        "11-02",
        "11-15",
        "11-20",
        "12-25",
    }
)


def parse_hhmm(value: str) -> time:
    hour, minute = value.split(":")
    return time(hour=int(hour), minute=int(minute))


def tenant_zoneinfo(tenant: Tenant) -> ZoneInfo:
    try:
        return ZoneInfo(tenant.timezone or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def tenant_business_weekdays(tenant: Tenant) -> set[int]:
    rows = tenant_weekday_schedule_rows(tenant)
    if rows:
        return {weekday for weekday, _start, _end in rows}
    return set(parse_business_days(tenant.business_days))


def tenant_weekday_work_bounds(tenant: Tenant, weekday: int) -> tuple[time, time] | None:
    for row_weekday, start_raw, end_raw in tenant_weekday_schedule_rows(tenant):
        if row_weekday != weekday:
            continue
        try:
            start = parse_hhmm(start_raw)
            end = parse_hhmm(end_raw)
        except Exception:
            return None
        if end <= start:
            return None
        return start, end
    return None


def load_tenant_holiday_dates(db: Session, tenant_id: int) -> set[date]:
    return set(
        db.execute(
            select(TenantHoliday.holiday_date).where(TenantHoliday.tenant_id == tenant_id)
        ).scalars().all()
    )


def is_blocked_holiday(target_date: date, tenant_holidays: set[date]) -> bool:
    if target_date in tenant_holidays:
        return True
    mm_dd = f"{target_date.month:02d}-{target_date.day:02d}"
    return mm_dd in _FIXED_NATIONAL_HOLIDAYS_MM_DD


def is_tenant_business_day(tenant: Tenant, target_date: date, tenant_holidays: set[date]) -> bool:
    if is_blocked_holiday(target_date, tenant_holidays):
        return False
    return target_date.weekday() in tenant_business_weekdays(tenant)


def previous_business_day(tenant: Tenant, target_date: date, tenant_holidays: set[date]) -> date:
    cursor = target_date
    for _ in range(370):
        if is_tenant_business_day(tenant, cursor, tenant_holidays):
            return cursor
        cursor -= timedelta(days=1)
    return target_date


def next_business_day(tenant: Tenant, target_date: date, tenant_holidays: set[date]) -> date:
    cursor = target_date
    for _ in range(370):
        if is_tenant_business_day(tenant, cursor, tenant_holidays):
            return cursor
        cursor += timedelta(days=1)
    return target_date


def effective_preventive_reminder_day(
    tenant: Tenant,
    due: date,
    advance_days: int,
    tenant_holidays: set[date],
) -> date:
    """Dia civil do lembrete automático, ajustado para dias úteis da empresa."""
    advance_days = max(0, int(advance_days or 0))
    if advance_days > 0:
        raw = due - timedelta(days=advance_days)
        if is_tenant_business_day(tenant, raw, tenant_holidays):
            return raw
        return previous_business_day(tenant, raw, tenant_holidays)
    if is_tenant_business_day(tenant, due, tenant_holidays):
        return due
    return next_business_day(tenant, due, tenant_holidays)


def is_within_tenant_work_hours(
    tenant: Tenant,
    now_utc: datetime,
    tenant_holidays: set[date],
) -> bool:
    now_utc = now_utc if now_utc.tzinfo is not None else now_utc.replace(tzinfo=timezone.utc)
    local = now_utc.astimezone(tenant_zoneinfo(tenant))
    if not is_tenant_business_day(tenant, local.date(), tenant_holidays):
        return False
    bounds = tenant_weekday_work_bounds(tenant, local.date().weekday())
    if bounds is None:
        return False
    day_start, day_end = bounds
    current = local.time().replace(second=0, microsecond=0)
    return day_start <= current <= day_end
