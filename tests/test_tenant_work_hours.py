from app.tenant_work_hours import (
    build_weekday_work_hours_mapping,
    parse_business_days,
    sync_tenant_weekday_work_hours_from_expediente,
    weekday_work_hours_json_from_expediente,
)


class _FakeTenant:
    business_days = "0,1,2,3,4"
    workday_start = "08:30"
    workday_end = "23:00"
    weekday_work_hours = None


def test_build_weekday_work_hours_from_expediente():
    mapping = build_weekday_work_hours_mapping(
        business_days="0,2,4",
        workday_start="08:30",
        workday_end="23:00",
    )
    assert mapping == {
        "0": {"start": "08:30", "end": "23:00"},
        "2": {"start": "08:30", "end": "23:00"},
        "4": {"start": "08:30", "end": "23:00"},
    }


def test_parse_business_days_defaults_to_weekdays():
    assert parse_business_days("") == [0, 1, 2, 3, 4]


def test_sync_tenant_weekday_work_hours_from_expediente():
    tenant = _FakeTenant()
    sync_tenant_weekday_work_hours_from_expediente(tenant)
    assert tenant.weekday_work_hours == weekday_work_hours_json_from_expediente(
        business_days=tenant.business_days,
        workday_start=tenant.workday_start,
        workday_end=tenant.workday_end,
    )
