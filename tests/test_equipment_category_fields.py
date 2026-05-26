from __future__ import annotations

from types import SimpleNamespace

from app.services.equipment_category_fields import empty_to_none, normalize_catalog_technical_fields


def test_empty_to_none():
    assert empty_to_none(None) is None
    assert empty_to_none("") is None
    assert empty_to_none("   ") is None
    assert empty_to_none(" 12k ") == "12k"


def test_normalize_allows_empty_even_when_category_flags_true():
    category = SimpleNamespace(has_capacity=True, has_fluid_type=True, has_voltage=True)
    cap, fluid, volt = normalize_catalog_technical_fields(
        category,
        capacity="",
        fluid_type="  ",
        voltage=None,
    )
    assert cap is None
    assert fluid is None
    assert volt is None
