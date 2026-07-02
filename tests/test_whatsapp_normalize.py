from fastapi import HTTPException

from app.whatsapp import normalize_whatsapp_number


def test_normalize_whatsapp_number_local_mobile():
    assert normalize_whatsapp_number("16993798431") == "5516993798431"


def test_normalize_whatsapp_number_already_e164():
    assert normalize_whatsapp_number("5516993798431") == "5516993798431"


def test_normalize_whatsapp_number_short_e164_without_extra_prefix():
    assert normalize_whatsapp_number("55169999301") == "55169999301"


def test_normalize_whatsapp_number_collapses_double_country_code():
    assert normalize_whatsapp_number("5555169999301") == "55169999301"


def test_normalize_whatsapp_number_rejects_empty():
    try:
        normalize_whatsapp_number("")
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 422
