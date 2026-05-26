from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.services.equipment_catalog_form import (
    EquipmentCatalogMultipartForm,
    _extract_optional_pdf_upload,
)


def test_multipart_form_accepts_empty_optional_fields():
    cat_id = str(uuid.uuid4())
    parsed = EquipmentCatalogMultipartForm.model_validate(
        {
            "category_id": cat_id,
            "brand": "Gree",
            "capacity": "",
            "fluid_type": "  ",
            "voltage": None,
        }
    )
    assert str(parsed.category_id) == cat_id
    assert parsed.capacity is None
    assert parsed.fluid_type is None
    assert parsed.voltage is None


def test_multipart_form_rejects_category_name_instead_of_uuid():
    with pytest.raises(ValidationError) as exc_info:
        EquipmentCatalogMultipartForm.model_validate(
            {"category_id": "Climatizador", "brand": "Gree"}
        )
    errors = exc_info.value.errors()
    assert any(e["loc"] == ("category_id",) for e in errors)


def test_multipart_form_rejects_undefined_category_id():
    with pytest.raises(ValidationError):
        EquipmentCatalogMultipartForm.model_validate(
            {"category_id": "undefined", "brand": "Gree"}
        )


def test_extract_optional_pdf_returns_none_when_missing():
    from starlette.datastructures import FormData

    form = FormData([])
    assert _extract_optional_pdf_upload(form) is None
