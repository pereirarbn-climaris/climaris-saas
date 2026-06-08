"""Testes de enriquecimento CNPJá comercial no tenant."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from app.cnpja_client import office_payload_to_lookup
from datetime import datetime, timedelta, timezone

from app.tenant_cnpj import apply_cnpj_commercial_to_tenant, cnpj_commercial_cooldown_remaining


def test_apply_cnpj_commercial_to_tenant_persists_normalized_and_raw() -> None:
    raw = {
        "taxId": "37335118000180",
        "alias": "CNPJA",
        "founded": "2019-08-13",
        "status": {"text": "Ativa"},
        "mainActivity": {"id": 6311900, "text": "Tratamento de dados"},
        "company": {
            "name": "CNPJA TECNOLOGIA LTDA",
            "nature": {"text": "Sociedade Empresária Limitada"},
        },
        "address": {
            "municipality": 3550308,
            "street": "Avenida Paulista",
            "number": "1000",
            "district": "Bela Vista",
            "city": "São Paulo",
            "state": "SP",
            "zip": "01310100",
        },
        "phones": [{"area": "11", "number": "999999999"}],
        "emails": [{"address": "contato@cnpja.com"}],
        "registrations": [
            {"number": "123456789", "state": "SP", "enabled": True, "type": {"text": "IE Normal"}},
        ],
    }
    lookup = office_payload_to_lookup(raw, "commercial")
    tenant = SimpleNamespace(
        name="Empresa Temp",
        trade_name=None,
        main_activity_code=None,
        main_activity_description=None,
        legal_nature=None,
        registration_status=None,
        founded_at=None,
        state_registration=None,
        ie_indicator=None,
        phone=None,
        email=None,
        address_street=None,
        address_number=None,
        address_complement=None,
        address_district=None,
        address_city=None,
        address_state=None,
        address_postal_code=None,
        address_ibge_code=None,
        cnpj_commercial_json=None,
        is_verified_cnpj=False,
        last_cnpj_commercial_update=None,
    )

    apply_cnpj_commercial_to_tenant(tenant, lookup, raw)

    assert tenant.name == "CNPJA TECNOLOGIA LTDA"
    assert tenant.trade_name == "CNPJA"
    assert tenant.main_activity_code == "6311-9/00"
    assert tenant.legal_nature == "Sociedade Empresária Limitada"
    assert tenant.registration_status == "Ativa"
    assert tenant.founded_at == date(2019, 8, 13)
    assert tenant.state_registration == "123456789"
    assert tenant.ie_indicator == "1"
    assert tenant.phone == "11999999999"
    assert tenant.email == "contato@cnpja.com"
    assert tenant.address_street == "Avenida Paulista"
    assert tenant.address_ibge_code == "3550308"
    assert tenant.cnpj_commercial_json == raw
    assert tenant.is_verified_cnpj is True
    assert tenant.last_cnpj_commercial_update is not None


def test_cnpj_commercial_cooldown_remaining_blocks_within_60_days() -> None:
    tenant = SimpleNamespace(
        last_cnpj_commercial_update=datetime.now(timezone.utc) - timedelta(days=10),
    )
    assert cnpj_commercial_cooldown_remaining(tenant) == 50


def test_cnpj_commercial_cooldown_remaining_none_after_60_days() -> None:
    tenant = SimpleNamespace(
        last_cnpj_commercial_update=datetime.now(timezone.utc) - timedelta(days=61),
    )
    assert cnpj_commercial_cooldown_remaining(tenant) is None
