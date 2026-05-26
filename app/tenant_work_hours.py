"""Expediente da empresa → weekday_work_hours (fonte única para agenda e agendamentos)."""

from __future__ import annotations

import json


def parse_business_days(business_days: str | None) -> list[int]:
    days: list[int] = []
    for part in (business_days or "0,1,2,3,4").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            day = int(part)
        except ValueError:
            continue
        if 0 <= day <= 6:
            days.append(day)
    return sorted(set(days)) or [0, 1, 2, 3, 4]


def build_weekday_work_hours_mapping(
    *,
    business_days: str | None,
    workday_start: str | None,
    workday_end: str | None,
) -> dict[str, dict[str, str]]:
    start = (workday_start or "08:00").strip()
    end = (workday_end or "18:00").strip()
    if end <= start:
        start, end = "08:00", "18:00"
    return {str(day): {"start": start, "end": end} for day in parse_business_days(business_days)}


def weekday_work_hours_json_from_expediente(
    *,
    business_days: str | None,
    workday_start: str | None,
    workday_end: str | None,
) -> str:
    mapping = build_weekday_work_hours_mapping(
        business_days=business_days,
        workday_start=workday_start,
        workday_end=workday_end,
    )
    return json.dumps(mapping, ensure_ascii=False)


def sync_tenant_weekday_work_hours_from_expediente(tenant) -> None:
    tenant.weekday_work_hours = weekday_work_hours_json_from_expediente(
        business_days=tenant.business_days,
        workday_start=tenant.workday_start,
        workday_end=tenant.workday_end,
    )


def tenant_weekday_schedule_rows(tenant) -> list[tuple[int, str, str]]:
    if tenant.weekday_work_hours:
        try:
            mapping = json.loads(tenant.weekday_work_hours)
        except json.JSONDecodeError:
            mapping = None
        if isinstance(mapping, dict):
            rows: list[tuple[int, str, str]] = []
            for key, value in mapping.items():
                try:
                    weekday = int(str(key))
                except ValueError:
                    continue
                if weekday < 0 or weekday > 6 or not isinstance(value, dict):
                    continue
                start = value.get("start")
                end = value.get("end")
                if (
                    isinstance(start, str)
                    and isinstance(end, str)
                    and len(start) == 5
                    and len(end) == 5
                    and end > start
                ):
                    rows.append((weekday, start, end))
            if rows:
                rows.sort(key=lambda item: item[0])
                return rows

    mapping = build_weekday_work_hours_mapping(
        business_days=tenant.business_days,
        workday_start=tenant.workday_start,
        workday_end=tenant.workday_end,
    )
    return [(int(key), value["start"], value["end"]) for key, value in sorted(mapping.items(), key=lambda item: int(item[0]))]
