"""Aplicação de dados CNPJá ao cadastro do cliente."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from models import Client

from app.schemas import CnpjLookupOut

CNPJ_COMMERCIAL_COOLDOWN_DAYS = 60


def cnpj_commercial_cooldown_remaining(client: Client) -> int | None:
    """Dias restantes até permitir nova consulta comercial; None se já pode consultar."""
    last = client.last_cnpj_commercial_update
    if last is None:
        return None
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    elapsed = datetime.now(timezone.utc) - last
    if elapsed >= timedelta(days=CNPJ_COMMERCIAL_COOLDOWN_DAYS):
        return None
    remaining = CNPJ_COMMERCIAL_COOLDOWN_DAYS - elapsed.days
    return max(1, remaining)


def apply_cnpj_lookup_to_client(client: Client, lookup: CnpjLookupOut, *, merge_address: bool = True) -> None:
    """Atualiza campos editáveis do cliente a partir da consulta (não altera CNPJ/razão social)."""
    if lookup.trade_name and lookup.trade_name.strip():
        client.trade_name = lookup.trade_name.strip()
    if isinstance(lookup.optante_mei, bool):
        client.optante_mei = lookup.optante_mei
    if merge_address and lookup.address:
        addr = lookup.address
        if addr.street:
            client.address_street = addr.street.strip() or client.address_street
        if addr.number:
            client.address_number = str(addr.number).strip() or client.address_number
        if addr.details:
            client.address_complement = addr.details.strip() or client.address_complement
        if addr.district:
            client.address_district = addr.district.strip() or client.address_district
        if addr.city:
            client.address_city = addr.city.strip() or client.address_city
        if addr.state:
            client.address_state = addr.state.strip().upper()[:2] or client.address_state
        if addr.zip:
            from app.tax_id import digits_only

            cep = digits_only(str(addr.zip))[:8]
            if cep:
                client.address_postal_code = cep
    client.is_verified_cnpj = True
