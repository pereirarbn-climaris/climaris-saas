"""Cliente HTTP para CNPJá — API pública (open) e comercial (api.cnpja.com).

Documentação: https://cnpja.com/api/open e https://cnpja.com/api
A chave comercial fica apenas em variável de ambiente CNPJA_API_KEY (servidor).
"""

from __future__ import annotations

import json
import os
import re
import ssl
import time
import urllib.error
import urllib.request
from typing import Any, Literal

from app.schemas import CnpjAddressOut, CnpjLookupOut
from app.tax_id import digits_only as tax_digits_only

# Documentação: GET https://open.cnpja.com/office/{cnpj14} — mesmo padrão do curl/Invoke-RestMethod.
OPEN_BASE = os.getenv("CNPJA_OPEN_BASE", "https://open.cnpja.com").rstrip("/")
COMMERCIAL_BASE = os.getenv("CNPJA_API_BASE", "https://api.cnpja.com").rstrip("/")
BRASILAPI_CNPJ_BASE = os.getenv("BRASILAPI_CNPJ_BASE", "https://brasilapi.com.br/api/cnpj/v1").rstrip("/")

# A API pública limita por IP do chamador; o backend compartilha um IP — cache reduz chamadas repetidas.
_OPEN_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_COMMERCIAL_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_OPEN_TTL = 3600.0
_COMMERCIAL_TTL = 120.0
_CACHE_MAX_ENTRIES = 512


class CnpjaHttpError(Exception):
    """Erro HTTP ao chamar CNPJá (status e corpo opcional)."""

    def __init__(self, status_code: int, body: str = "") -> None:
        self.status_code = status_code
        self.body = body
        super().__init__(f"CNPJá HTTP {status_code}")


def normalize_cnpj_digits(value: str) -> str:
    """Somente 14 dígitos ou levanta ValueError."""
    digits = re.sub(r"\D", "", value or "")
    if len(digits) != 14:
        raise ValueError("CNPJ deve conter 14 dígitos.")
    return digits


def _cache_get(store: dict[str, tuple[float, dict[str, Any]]], key: str, ttl: float) -> dict[str, Any] | None:
    hit = store.get(key)
    if not hit:
        return None
    ts, val = hit
    if time.time() - ts > ttl:
        del store[key]
        return None
    return val


def _cache_set(store: dict[str, tuple[float, dict[str, Any]]], key: str, val: dict[str, Any]) -> None:
    if len(store) >= _CACHE_MAX_ENTRIES:
        store.clear()
    store[key] = (time.time(), val)


def _http_get_json(url: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
    h = {"Accept": "application/json", "User-Agent": "Climaris-ERP/1.0 (+https://climaris.com.br)", **(headers or {})}
    req = urllib.request.Request(url, headers=h, method="GET")
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=25, context=ctx) as resp:
            raw = resp.read().decode()
    except urllib.error.HTTPError as exc:
        body = b""
        try:
            body = exc.read()
        except Exception:
            pass
        raise CnpjaHttpError(exc.code, body.decode(errors="replace")) from exc
    except urllib.error.URLError as exc:
        reason = exc.reason if getattr(exc, "reason", None) else str(exc)
        raise CnpjaHttpError(
            0,
            f"Sem conexão com CNPJá ({reason}). Verifique rede, DNS ou firewall do servidor.",
        ) from exc
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        snippet = raw[:280].replace("\n", " ") if raw else ""
        raise CnpjaHttpError(
            502,
            f"Resposta inválida do serviço CNPJá (não é JSON). {snippet}",
        ) from exc


def fetch_office_open(tax_id: str) -> dict[str, Any]:
    cache_key = tax_id
    cached = _cache_get(_OPEN_CACHE, cache_key, _OPEN_TTL)
    if cached is not None:
        return cached
    url = f"{OPEN_BASE}/office/{tax_id}"
    data = _http_get_json(url)
    _cache_set(_OPEN_CACHE, cache_key, data)
    return data


def fetch_office_commercial(tax_id: str, api_key: str) -> dict[str, Any]:
    cache_key = tax_id
    cached = _cache_get(_COMMERCIAL_CACHE, cache_key, _COMMERCIAL_TTL)
    if cached is not None:
        return cached
    url = f"{COMMERCIAL_BASE}/office/{tax_id}"
    data = _http_get_json(url, headers={"Authorization": api_key.strip()})
    _cache_set(_COMMERCIAL_CACHE, cache_key, data)
    return data


def get_cnpja_api_key() -> str | None:
    key = os.getenv("CNPJA_API_KEY", "").strip()
    return key or None


def fetch_brasilapi_cnpj(digits_14: str) -> dict[str, Any]:
    """Fallback público (BrasilAPI) quando CNPJá não responde ou não tem o CNPJ."""
    url = f"{BRASILAPI_CNPJ_BASE}/{digits_14}"
    return _http_get_json(url)


def brasilapi_json_to_lookup(data: dict[str, Any], digits_14: str) -> CnpjLookupOut:
    """Converte JSON da BrasilAPI para o mesmo formato usado no cadastro."""
    name = (data.get("razao_social") or "").strip()
    nf = data.get("nome_fantasia")
    trade_name = str(nf).strip() if nf else None
    if trade_name == "":
        trade_name = None
    situacao = data.get("descricao_situacao_cadastral") or data.get("situacao_cadastral")
    status_text = str(situacao).strip() if situacao else None

    cnpj_field = data.get("cnpj")
    tax_id = tax_digits_only(str(cnpj_field)) if cnpj_field else digits_14
    if len(tax_id) != 14:
        tax_id = digits_14

    addr_out = None
    if data.get("municipio") or data.get("uf"):
        cep = data.get("cep")
        addr_out = CnpjAddressOut(
            street=data.get("logradouro"),
            number=str(data.get("numero")) if data.get("numero") is not None else None,
            details=data.get("complemento"),
            district=data.get("bairro"),
            city=data.get("municipio"),
            state=data.get("uf"),
            zip=str(cep) if cep is not None else None,
        )

    cnae = data.get("cnae_fiscal")
    main_activity = None
    if cnae is not None:
        main_activity = str(cnae)

    mei_raw = data.get("opcao_pelo_mei")
    optante_mei: bool | None = None
    if isinstance(mei_raw, bool):
        optante_mei = mei_raw
    elif isinstance(mei_raw, str):
        mei_norm = mei_raw.strip().lower()
        if mei_norm in {"sim", "s", "true", "1"}:
            optante_mei = True
        elif mei_norm in {"nao", "não", "n", "false", "0"}:
            optante_mei = False

    return CnpjLookupOut(
        source="brasilapi",
        tax_id=tax_id,
        company_name=name,
        trade_name=trade_name,
        status_text=status_text,
        founded=None,
        main_activity=main_activity,
        address=addr_out,
        optante_mei=optante_mei,
    )


def _extract_optante_mei_from_company(company: dict[str, Any]) -> bool | None:
    """Detecta enquadramento MEI no payload CNPJá (open/commercial)."""
    # CNPJá costuma expor blocos `simei` e `simples` em `company`.
    # Ex.: company.simei.optant = true/false
    simei = company.get("simei")
    if isinstance(simei, dict):
        for key in ("optant", "isOptant", "enabled"):
            val = simei.get(key)
            if isinstance(val, bool):
                return val

    simples = company.get("simples")
    if isinstance(simples, dict):
        mei_info = simples.get("mei")
        if isinstance(mei_info, dict):
            for key in ("optant", "isOptant", "enabled"):
                val = mei_info.get(key)
                if isinstance(val, bool):
                    return val
        # Alguns payloads simplificam para `simples.mei: true/false`.
        mei_flag = simples.get("mei")
        if isinstance(mei_flag, bool):
            return mei_flag
    return None


def office_payload_to_lookup(data: dict[str, Any], source: Literal["open", "commercial"]) -> CnpjLookupOut:
    """Monta CnpjLookupOut a partir do JSON `office` da CNPJá."""
    company = data.get("company")
    if not isinstance(company, dict):
        company = {}
    name = (company.get("name") or data.get("name") or "").strip()
    alias_raw = data.get("alias")
    trade_name = (str(alias_raw).strip() if alias_raw else None) or None
    status_obj = data.get("status")
    status_text = None
    if isinstance(status_obj, dict):
        st = status_obj.get("text")
        status_text = str(st) if st is not None else None
    tax_raw = data.get("taxId") or ""
    tax_id = re.sub(r"\D", "", str(tax_raw)) if tax_raw else ""

    addr_out = None
    addr = data.get("address")
    if isinstance(addr, dict):
        z = addr.get("zip")
        addr_out = CnpjAddressOut(
            street=addr.get("street"),
            number=str(addr.get("number")) if addr.get("number") is not None else None,
            details=addr.get("details"),
            district=addr.get("district"),
            city=addr.get("city"),
            state=addr.get("state"),
            zip=str(z) if z is not None else None,
        )

    main = data.get("mainActivity")
    main_activity = None
    if isinstance(main, dict):
        mt = main.get("text")
        main_activity = str(mt) if mt is not None else None

    founded = data.get("founded")
    founded_s = str(founded) if founded is not None else None
    optante_mei = _extract_optante_mei_from_company(company)

    return CnpjLookupOut(
        source=source,
        tax_id=tax_id,
        company_name=name,
        trade_name=trade_name,
        status_text=status_text,
        founded=founded_s,
        main_activity=main_activity,
        address=addr_out,
        optante_mei=optante_mei,
    )
