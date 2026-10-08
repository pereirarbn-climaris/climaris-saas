"""Testes da validação XSD da DPS (pacote oficial em Docs/nfse-xsd-extracted)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app import nfse_dps_xsd_validate as v
from app.nfse_dps_xml import build_dps_xml_unsigned


def test_xsd_validation_disabled_by_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NFSE_DPS_XSD_VALIDATE", "0")
    assert v.xsd_validation_enabled() is False


def test_invalid_fragment_fails_when_schema_present() -> None:
    if v.resolve_schema_root() is None:
        pytest.skip("Extraia o zip dos XSD em Docs/nfse-xsd-extracted/Schemas/1.01")
    bad = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"></DPS>'
    )
    ok, errs = v.validate_dps_xml(bad)
    assert ok is False
    assert errs


def test_unsigned_dps_from_builder_passes_xsd_when_schema_present() -> None:
    """Garante facet TSSerieDPS + libxml (após normalização do pattern no validador)."""
    if v.resolve_schema_root() is None:
        pytest.skip("Extraia o zip dos XSD em Docs/nfse-xsd-extracted/Schemas/1.01")

    tenant = SimpleNamespace(address_ibge_code="3503208", cnpj="42731692000198")
    client = SimpleNamespace(
        document="12345678901",
        name="Cliente Teste",
        address_ibge_code="3548906",
        address_postal_code="13560000",
        address_street="Av Paulista",
        address_number="1000",
        address_district="Bela Vista",
        address_complement="",
    )
    xml = build_dps_xml_unsigned(
        tenant=tenant,
        client=client,
        amount=100.0,
        discriminacao="Servico de teste XSD",
        codigo_tributacao_nacional="010101",
        codigo_nbs="115021000",
        mei_environment="homologacao",
        serie="NF",
        numero_dps="60000",
        op_simp_nac=2,
    )
    ok, errs = v.validate_dps_xml(xml)
    assert ok is True, errs


def test_validate_if_configured_skips_when_schema_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NFSE_XSD_SCHEMA_ROOT", "/nonexistent/nfse/xsd/1.01")
    monkeypatch.setenv("NFSE_DPS_XSD_VALIDATE", "1")
    ok, errs = v.validate_dps_xml_if_configured("<root/>")
    assert ok is True
    assert errs == []
