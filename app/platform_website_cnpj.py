"""Aplica consulta CNPJá aos dados institucionais da plataforma (site / LGPD)."""

from __future__ import annotations

from datetime import datetime, timezone

from app.schemas import CnpjLookupOut
from app.tax_id import digits_only
from models import PlatformWebsiteSettings


def _format_street(addr) -> str | None:
    if addr is None:
        return None
    parts: list[str] = []
    if addr.street and str(addr.street).strip():
        parts.append(str(addr.street).strip())
    if addr.number and str(addr.number).strip():
        parts.append(str(addr.number).strip())
    if not parts:
        return None
    line = ", ".join(parts)
    if addr.district and str(addr.district).strip():
        line = f"{line} — {str(addr.district).strip()}"
    return line


def apply_cnpj_lookup_to_website_settings(row: PlatformWebsiteSettings, lookup: CnpjLookupOut) -> None:
    """Preenche razão social, endereço e CNPJ a partir da consulta CNPJá."""
    if lookup.company_name.strip():
        row.legal_name = lookup.company_name.strip()
    if lookup.trade_name and lookup.trade_name.strip():
        row.trade_name = lookup.trade_name.strip()
    row.cnpj = digits_only(lookup.tax_id)
    if lookup.address:
        addr = lookup.address
        street = _format_street(addr)
        if street:
            row.address_street = street
        if addr.city and str(addr.city).strip():
            row.address_city = str(addr.city).strip()
        if addr.state and str(addr.state).strip():
            row.address_state = str(addr.state).strip().upper()[:2]
        if addr.zip:
            cep = digits_only(str(addr.zip))[:8]
            if cep:
                row.address_postal = cep
    if lookup.contact_phone and not (row.contact_phone or "").strip():
        row.contact_phone = lookup.contact_phone.strip()
    row.is_verified_cnpj = True
    row.cnpj_verified_at = datetime.now(timezone.utc)
