"""Consulta de CEP via ViaCEP (https://viacep.com.br/)."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.dependencies import get_current_user
from app.limiter import limiter
from app.schemas import CepLookupOut
from models import User

VIACEP_TMPL = "https://viacep.com.br/ws/{cep}/json/"


def _cep_digits(raw: str) -> str:
    d = re.sub(r"\D", "", raw or "")
    if len(d) != 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CEP deve conter exatamente 8 dígitos.",
        )
    return d


def _fetch_viacep_json(digits: str) -> dict:
    url = VIACEP_TMPL.format(cep=digits)
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "Climaris-ERP/1.0 (CEP lookup)",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        if exc.code == 400:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Formato de CEP inválido para o ViaCEP.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"ViaCEP retornou HTTP {exc.code}.",
        ) from exc
    except urllib.error.URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível consultar o ViaCEP. Tente novamente em instantes.",
        ) from exc


def _viacep_to_out(data: dict) -> CepLookupOut:
    if data.get("erro") is True:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CEP não encontrado na base dos Correios.")

    def s(key: str) -> str | None:
        v = data.get(key)
        if v is None:
            return None
        t = str(v).strip()
        return t if t else None

    cep_fmt = s("cep")
    uf = s("uf")
    if uf and len(uf) > 2:
        uf = uf[:2].upper()
    ibge = s("ibge")
    if ibge and len(ibge) > 7:
        ibge = ibge[:7]

    comp = s("complemento")
    unidade = s("unidade")
    parts = [p for p in (comp, unidade) if p]
    merged_comp = " — ".join(parts) if parts else None

    return CepLookupOut(
        cep=cep_fmt or "",
        address_street=s("logradouro"),
        address_complement=merged_comp,
        address_district=s("bairro"),
        address_city=s("localidade"),
        address_state=uf,
        address_postal_code=cep_fmt,
        address_ibge_code=ibge,
    )


router = APIRouter(prefix="/cep", tags=["cep"])


@router.get("/{cep}", response_model=CepLookupOut)
@limiter.limit("60/minute")
def lookup_cep(
    request: Request,
    cep: str,
    _current_user: Annotated[User, Depends(get_current_user)],
) -> CepLookupOut:
    """Retorna logradouro, bairro, cidade, UF e código IBGE a partir do CEP (somente usuário autenticado)."""
    digits = _cep_digits(cep)
    raw = _fetch_viacep_json(digits)
    return _viacep_to_out(raw)
