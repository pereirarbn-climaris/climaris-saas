"""Testes da consulta de CEP (ViaCEP + fallback BrasilAPI)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.routers.cep import (
    _brasilapi_to_out,
    _cep_out_has_useful_data,
    _viacep_errored,
    _viacep_to_out,
)


def test_viacep_errored_accepts_string_true() -> None:
    assert _viacep_errored({"erro": "true"}) is True
    assert _viacep_errored({"erro": "True"}) is True
    assert _viacep_errored({"erro": True}) is True
    assert _viacep_errored({"cep": "01310-100"}) is False


def test_viacep_to_out_raises_on_string_erro() -> None:
    with pytest.raises(HTTPException) as exc:
        _viacep_to_out({"erro": "true"})
    assert exc.value.status_code == 404


def test_viacep_to_out_maps_fields() -> None:
    out = _viacep_to_out(
        {
            "cep": "01310-100",
            "logradouro": "Avenida Paulista",
            "bairro": "Bela Vista",
            "localidade": "São Paulo",
            "uf": "SP",
            "ibge": "3550308",
        }
    )
    assert out.source == "viacep"
    assert out.address_street == "Avenida Paulista"
    assert out.address_city == "São Paulo"
    assert out.address_state == "SP"
    assert _cep_out_has_useful_data(out) is True


def test_brasilapi_to_out_partial_address() -> None:
    out = _brasilapi_to_out(
        {
            "cep": "14805070",
            "state": "SP",
            "city": "Araraquara",
            "neighborhood": None,
            "street": None,
        },
        "14805070",
    )
    assert out.source == "brasilapi"
    assert out.cep == "14805-070"
    assert out.address_city == "Araraquara"
    assert out.address_state == "SP"
    assert out.address_street is None
    assert _cep_out_has_useful_data(out) is True
