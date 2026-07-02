"""Geração de horários disponíveis para demonstrações comerciais."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import DemoAppointment, DemoAppointmentStatus, DemoScheduleBlock

DEMO_TZ = ZoneInfo("America/Sao_Paulo")
DEMO_DURATION_MINUTES = 45
DEMO_SLOT_HOURS = (9, 10, 11, 14, 15, 16)
DEMO_MIN_ADVANCE_HOURS = 24
DEMO_MAX_ADVANCE_DAYS = 30
DEMO_BUSINESS_WEEKDAYS = {0, 1, 2, 3, 4}  # seg–sex


def _active_statuses() -> tuple[str, ...]:
    return (
        DemoAppointmentStatus.SCHEDULED.value,
        DemoAppointmentStatus.CONFIRMED.value,
    )


def _slot_label(starts_at: datetime) -> str:
    local = starts_at.astimezone(DEMO_TZ)
    weekdays = ("seg", "ter", "qua", "qui", "sex", "sáb", "dom")
    wd = weekdays[local.weekday()]
    return f"{wd} {local.strftime('%d/%m')} às {local.strftime('%H:%M')}"


def _occupied_starts(
    range_start: datetime,
    range_end: datetime,
    *,
    exclude_id: int | None = None,
) -> set[datetime]:
    from app.demo_blocks_database import DemoBlocksSessionLocal

    stmt = (
        select(DemoAppointment.scheduled_at)
        .where(DemoAppointment.scheduled_at >= range_start)
        .where(DemoAppointment.scheduled_at < range_end)
        .where(DemoAppointment.status.in_(_active_statuses()))
    )
    if exclude_id is not None:
        stmt = stmt.where(DemoAppointment.id != exclude_id)
    occupied: set[datetime] = set()
    with DemoBlocksSessionLocal() as public_db:
        for row in public_db.scalars(stmt).all():
            local = row.astimezone(DEMO_TZ).replace(minute=0, second=0, microsecond=0)
            occupied.add(local)
    return occupied


def _blocked_starts(
    range_start: datetime,
    range_end: datetime,
) -> set[datetime]:
    from app.demo_blocks_database import DemoBlocksSessionLocal

    stmt = (
        select(DemoScheduleBlock.starts_at, DemoScheduleBlock.ends_at)
        .where(DemoScheduleBlock.ends_at > range_start)
        .where(DemoScheduleBlock.starts_at < range_end)
    )
    with DemoBlocksSessionLocal() as blocks_db:
        blocks = [(a.astimezone(DEMO_TZ), b.astimezone(DEMO_TZ)) for a, b in blocks_db.execute(stmt).all()]
    blocked: set[datetime] = set()
    cursor_day = range_start.date()
    end_day = range_end.date()
    while cursor_day <= end_day:
        if cursor_day.weekday() in DEMO_BUSINESS_WEEKDAYS:
            for hour in DEMO_SLOT_HOURS:
                slot_start = datetime.combine(cursor_day, time(hour, 0), tzinfo=DEMO_TZ)
                slot_end = slot_start + timedelta(minutes=DEMO_DURATION_MINUTES)
                for bs, be in blocks:
                    if slot_start < be and slot_end > bs:
                        blocked.add(slot_start.replace(minute=0, second=0, microsecond=0))
                        break
        cursor_day += timedelta(days=1)
    return blocked


def _iter_candidate_slots(
    db: Session,
    start_day: date,
    end_day: date,
    *,
    exclude_id: int | None = None,
) -> list[dict]:
    now = datetime.now(DEMO_TZ)
    earliest = now + timedelta(hours=DEMO_MIN_ADVANCE_HOURS)
    range_start = datetime.combine(start_day, time.min, tzinfo=DEMO_TZ)
    range_end = datetime.combine(end_day, time.min, tzinfo=DEMO_TZ)
    occupied = _occupied_starts(range_start, range_end, exclude_id=exclude_id)
    blocked = _blocked_starts(range_start, range_end)

    slots: list[dict] = []
    cursor = start_day
    while cursor < end_day:
        if cursor.weekday() in DEMO_BUSINESS_WEEKDAYS:
            for hour in DEMO_SLOT_HOURS:
                starts_at = datetime.combine(cursor, time(hour, 0), tzinfo=DEMO_TZ)
                norm = starts_at.replace(minute=0, second=0, microsecond=0)
                if starts_at < earliest:
                    continue
                if norm in occupied or norm in blocked:
                    continue
                ends_at = starts_at + timedelta(minutes=DEMO_DURATION_MINUTES)
                slots.append(
                    {
                        "starts_at": starts_at,
                        "ends_at": ends_at,
                        "label": _slot_label(starts_at),
                    }
                )
        cursor += timedelta(days=1)
    return slots


def list_demo_slots(db: Session, *, from_day: date | None = None, days: int = 14) -> list[dict]:
    """Retorna slots livres para demonstração (horário comercial, seg–sex)."""
    now = datetime.now(DEMO_TZ)
    earliest = now + timedelta(hours=DEMO_MIN_ADVANCE_HOURS)
    start_day = from_day or earliest.date()
    if start_day < earliest.date():
        start_day = earliest.date()

    days = max(1, min(days, DEMO_MAX_ADVANCE_DAYS))
    end_day = start_day + timedelta(days=days)
    return _iter_candidate_slots(db, start_day, end_day)


def list_demo_calendar_days(db: Session, *, year: int, month: int) -> list[dict]:
    """Resumo por dia para calendário mensal (site e operação)."""
    anchor = date(year, month, 1)
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    last_day = next_month - timedelta(days=1)

    now = datetime.now(DEMO_TZ)
    earliest = now + timedelta(hours=DEMO_MIN_ADVANCE_HOURS)
    max_day = now.date() + timedelta(days=DEMO_MAX_ADVANCE_DAYS)

    available_slots = list_demo_slots(db, from_day=anchor, days=(last_day - anchor).days + 1)
    available_by_day: dict[str, int] = {}
    for slot in available_slots:
        key = slot["starts_at"].astimezone(DEMO_TZ).date().isoformat()
        available_by_day[key] = available_by_day.get(key, 0) + 1

    days_out: list[dict] = []
    cursor = anchor
    while cursor <= last_day:
        key = cursor.isoformat()
        is_weekend = cursor.weekday() not in DEMO_BUSINESS_WEEKDAYS
        is_past_window = cursor < earliest.date() or cursor > max_day
        available = available_by_day.get(key, 0)
        total = len(DEMO_SLOT_HOURS) if not is_weekend else 0

        if is_weekend:
            status = "closed"
        elif is_past_window:
            status = "past"
        elif available <= 0:
            status = "full"
        else:
            status = "available"

        days_out.append(
            {
                "date": key,
                "status": status,
                "available_slots": available,
                "total_slots": total,
            }
        )
        cursor += timedelta(days=1)
    return days_out


def is_demo_slot_available(
    db: Session,
    scheduled_at: datetime,
    *,
    exclude_id: int | None = None,
) -> bool:
    """Verifica se o horário solicitado está livre e dentro das regras."""
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=DEMO_TZ)
    local = scheduled_at.astimezone(DEMO_TZ).replace(minute=0, second=0, microsecond=0)

    if local.weekday() not in DEMO_BUSINESS_WEEKDAYS:
        return False
    if local.hour not in DEMO_SLOT_HOURS or local.minute != 0 or local.second != 0:
        return False

    now = datetime.now(DEMO_TZ)
    if local < now + timedelta(hours=DEMO_MIN_ADVANCE_HOURS):
        return False
    if local.date() > now.date() + timedelta(days=DEMO_MAX_ADVANCE_DAYS):
        return False

    occupied = _occupied_starts(local, local + timedelta(minutes=1), exclude_id=exclude_id)
    if local in occupied:
        return False
    blocked = _blocked_starts(local, local + timedelta(minutes=1))
    return local not in blocked
