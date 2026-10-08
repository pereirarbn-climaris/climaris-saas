"""Define canal NFS-e (prestador) a partir da consulta CNPJ na Receita / CNPJá.

O tomador da nota não deve determinar o provedor — apenas o cadastro da empresa (tenant).
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.cnpja_client import (
    CnpjaHttpError,
    brasilapi_json_to_lookup,
    fetch_brasilapi_cnpj,
    fetch_office_commercial,
    fetch_office_open,
    get_cnpja_api_key,
    office_payload_to_lookup,
)
from app.nfse_service import get_or_create_nfse_settings
from app.schemas import CnpjLookupOut

logger = logging.getLogger(__name__)


def _fetch_office_open_with_commercial_fallback(digits: str) -> tuple[dict, str]:
    try:
        return fetch_office_open(digits), "open"
    except (CnpjaHttpError, OSError) as first:
        key = get_cnpja_api_key()
        if not key:
            raise first
        try:
            return fetch_office_commercial(digits, key), "commercial"
        except (CnpjaHttpError, OSError):
            raise first


def fetch_cnpj_lookup_best_effort(digits_14: str) -> CnpjLookupOut | None:
    """Consulta CNPJá (open → comercial) com fallback BrasilAPI; não levanta exceção."""
    if len(digits_14) != 14:
        return None
    try:
        raw, src = _fetch_office_open_with_commercial_fallback(digits_14)
        out = office_payload_to_lookup(raw, src)
        if out.tax_id != digits_14:
            out = out.model_copy(update={"tax_id": digits_14})
        return out
    except Exception:
        logger.debug("CNPJá indisponível para auto NFS-e; tentando BrasilAPI", exc_info=True)
    try:
        br = fetch_brasilapi_cnpj(digits_14)
        return brasilapi_json_to_lookup(br, digits_14)
    except Exception:
        logger.warning("Não foi possível obter regime do CNPJ %s para NFS-e automática.", digits_14[:4])
        return None


def apply_nfse_auto_from_cnpj_lookup(db: Session, tenant_id: int, lookup: CnpjLookupOut | None, *, commit: bool = False) -> None:
    """Preenche auto_nfse_provider + mei_opt_in quando MEI é detectado na consulta."""
    if lookup is None:
        return
    settings = get_or_create_nfse_settings(db, tenant_id, commit=False)
    if lookup.optante_mei is True:
        settings.auto_nfse_provider = "national_mei"
        settings.mei_opt_in = True
    elif lookup.optante_mei is False:
        settings.auto_nfse_provider = "focus"
    db.add(settings)
    if commit:
        db.commit()
        db.refresh(settings)


def sync_nfse_auto_from_cnpj_digits(db: Session, tenant_id: int, cnpj_digits: str, *, commit: bool = False) -> None:
    """Busca regime pelo CNPJ e aplica em tenant_nfse_settings."""
    d = "".join(c for c in (cnpj_digits or "") if c.isdigit())
    if len(d) != 14:
        return
    lookup = fetch_cnpj_lookup_best_effort(d)
    apply_nfse_auto_from_cnpj_lookup(db, tenant_id, lookup, commit=commit)
