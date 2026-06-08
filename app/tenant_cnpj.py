"""Aplicação de dados CNPJá comercial ao cadastro da empresa (tenant)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.client_cnpj import CNPJ_COMMERCIAL_COOLDOWN_DAYS
from app.cnpja_client import CnpjaHttpError, _founded_to_date, fetch_office_commercial, office_payload_to_lookup
from app.nfse_auto_provider import apply_nfse_auto_from_cnpj_lookup
from app.platform_credentials import resolve_cnpja_api_key
from app.schemas import CnpjLookupOut
from app.tax_id import digits_only
from models import Tenant

logger = logging.getLogger(__name__)


def cnpj_commercial_cooldown_remaining(tenant: Tenant) -> int | None:
    """Dias restantes até permitir nova consulta comercial; None se já pode consultar."""
    last = tenant.last_cnpj_commercial_update
    if last is None:
        return None
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    elapsed = datetime.now(timezone.utc) - last
    if elapsed >= timedelta(days=CNPJ_COMMERCIAL_COOLDOWN_DAYS):
        return None
    remaining = CNPJ_COMMERCIAL_COOLDOWN_DAYS - elapsed.days
    return max(1, remaining)


def _extract_ibge_from_office(data: dict[str, Any]) -> str | None:
    addr = data.get("address")
    if not isinstance(addr, dict):
        return None
    municipality = addr.get("municipality")
    if municipality is None:
        return None
    ibge = digits_only(str(municipality))[:7]
    return ibge if len(ibge) == 7 else None


def apply_cnpj_commercial_to_tenant(
    tenant: Tenant,
    lookup: CnpjLookupOut,
    raw: dict[str, Any],
    *,
    merge_address: bool = True,
) -> None:
    """Persiste dados normalizados e o JSON completo da CNPJá comercial no tenant."""
    if lookup.company_name.strip():
        tenant.name = lookup.company_name.strip()
    if lookup.trade_name and lookup.trade_name.strip():
        tenant.trade_name = lookup.trade_name.strip()
    if lookup.main_activity_code and lookup.main_activity_code.strip():
        tenant.main_activity_code = lookup.main_activity_code.strip()
    if lookup.main_activity_description and lookup.main_activity_description.strip():
        tenant.main_activity_description = lookup.main_activity_description.strip()
    if lookup.legal_nature and lookup.legal_nature.strip():
        tenant.legal_nature = lookup.legal_nature.strip()
    if lookup.status_text and lookup.status_text.strip():
        tenant.registration_status = lookup.status_text.strip()
    founded = _founded_to_date(lookup.founded)
    if founded is not None:
        tenant.founded_at = founded
    if lookup.state_registration and lookup.state_registration.strip():
        tenant.state_registration = lookup.state_registration.strip()
    if lookup.ie_indicator in ("1", "2", "9"):
        tenant.ie_indicator = lookup.ie_indicator
    if lookup.contact_phone and not (tenant.phone or "").strip():
        tenant.phone = lookup.contact_phone
    if lookup.contact_email and not (tenant.email or "").strip():
        tenant.email = lookup.contact_email.lower()
    if merge_address and lookup.address:
        addr = lookup.address
        if addr.street:
            tenant.address_street = addr.street.strip() or tenant.address_street
        if addr.number:
            tenant.address_number = str(addr.number).strip() or tenant.address_number
        if addr.details:
            tenant.address_complement = addr.details.strip() or tenant.address_complement
        if addr.district:
            tenant.address_district = addr.district.strip() or tenant.address_district
        if addr.city:
            tenant.address_city = addr.city.strip() or tenant.address_city
        if addr.state:
            tenant.address_state = addr.state.strip().upper()[:2] or tenant.address_state
        if addr.zip:
            cep = digits_only(str(addr.zip))[:8]
            if cep:
                tenant.address_postal_code = cep
    ibge = _extract_ibge_from_office(raw)
    if ibge:
        tenant.address_ibge_code = ibge
    tenant.cnpj_commercial_json = raw
    tenant.is_verified_cnpj = True
    tenant.last_cnpj_commercial_update = datetime.now(timezone.utc)


def sync_tenant_from_cnpj_commercial(
    db: Session,
    tenant: Tenant,
    cnpj_digits: str,
    *,
    commit: bool = False,
) -> CnpjLookupOut:
    """Consulta CNPJá comercial e grava todos os dados disponíveis no tenant."""
    api_key = resolve_cnpja_api_key(db)
    if not api_key:
        raise ValueError("API CNPJá comercial não configurada.")

    digits = digits_only(cnpj_digits)
    if len(digits) != 14:
        raise ValueError("CNPJ inválido para consulta comercial.")

    try:
        raw = fetch_office_commercial(digits, api_key)
    except CnpjaHttpError as exc:
        if exc.status_code == 404:
            raise ValueError("CNPJ não encontrado na CNPJá comercial.") from exc
        raise ValueError("Não foi possível consultar o CNPJ na CNPJá comercial.") from exc
    except OSError as exc:
        raise ValueError("Não foi possível contatar o serviço CNPJá.") from exc

    lookup = office_payload_to_lookup(raw, "commercial")
    if not lookup.company_name.strip():
        raise ValueError("CNPJ sem razão social na resposta da CNPJá.")
    if lookup.tax_id != digits:
        lookup = lookup.model_copy(update={"tax_id": digits})

    apply_cnpj_commercial_to_tenant(tenant, lookup, raw)
    apply_nfse_auto_from_cnpj_lookup(db, tenant.id, lookup, commit=False)
    if commit:
        db.commit()
        db.refresh(tenant)
    return lookup
