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
import urllib.parse
import urllib.request
from datetime import date
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


def fetch_office_commercial(
    tax_id: str,
    api_key: str,
    *,
    registrations: str | None = "ORIGIN",
    simples: bool = True,
) -> dict[str, Any]:
    """Consulta comercial com Receita Federal + Cadastro de Contribuintes (IE na UF de origem)."""
    cache_key = f"{tax_id}|{registrations or ''}|{int(simples)}"
    cached = _cache_get(_COMMERCIAL_CACHE, cache_key, _COMMERCIAL_TTL)
    if cached is not None:
        return cached
    params: list[tuple[str, str]] = []
    if registrations:
        params.append(("registrations", registrations))
    if simples:
        params.append(("simples", "true"))
    qs = urllib.parse.urlencode(params)
    url = f"{COMMERCIAL_BASE}/office/{tax_id}"
    if qs:
        url = f"{url}?{qs}"
    data = _http_get_json(url, headers={"Authorization": api_key.strip()})
    _cache_set(_COMMERCIAL_CACHE, cache_key, data)
    return data


def get_cnpja_api_key(db=None) -> str | None:
    """Compat: env primeiro; com `db`, tenta credencial `cnpja` da plataforma."""
    from app.platform_credentials import resolve_cnpja_api_key

    return resolve_cnpja_api_key(db)


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
    main_activity_code = format_cnae_code(cnae) if cnae is not None else None
    main_activity_description = None
    cnae_desc = data.get("cnae_fiscal_descricao")
    if cnae_desc is not None:
        main_activity_description = str(cnae_desc).strip() or None
    main_activity = main_activity_description
    if main_activity_code and main_activity_description:
        main_activity = f"{main_activity_code} - {main_activity_description}"
    elif main_activity_code:
        main_activity = main_activity_code

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

    legal_nature_raw = data.get("descricao_natureza_juridica")
    legal_nature = str(legal_nature_raw).strip() if legal_nature_raw else None
    if legal_nature == "":
        legal_nature = None

    return CnpjLookupOut(
        source="brasilapi",
        tax_id=tax_id,
        company_name=name,
        trade_name=trade_name,
        status_text=status_text,
        founded=None,
        main_activity=main_activity,
        main_activity_code=main_activity_code,
        main_activity_description=main_activity_description,
        legal_nature=legal_nature,
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


def format_cnae_code(raw_id: str | int | None) -> str | None:
    if raw_id is None:
        return None
    digits = re.sub(r"\D", "", str(raw_id))
    if len(digits) == 7:
        return f"{digits[:4]}-{digits[4]}/{digits[5:7]}"
    text = str(raw_id).strip()
    return text or None


def _parse_founded_date(raw: Any) -> str | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    return text[:10]


def _founded_to_date(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        parts = raw.split("-")
        if len(parts) == 3:
            return date(int(parts[0]), int(parts[1]), int(parts[2]))
    except (TypeError, ValueError):
        return None
    return None


def _extract_state_registration(
    data: dict[str, Any],
) -> tuple[str | None, Literal["1", "2", "9"] | None]:
    regs = data.get("registrations")
    if not isinstance(regs, list) or not regs:
        return None, None

    addr = data.get("address")
    origin_uf = None
    if isinstance(addr, dict):
        origin_uf = str(addr.get("state") or "").strip().upper()[:2] or None

    def _number_from_reg(reg: dict[str, Any]) -> str | None:
        number = reg.get("number")
        if number is None:
            return None
        text = str(number).strip()
        return text or None

    def _ie_from_reg(reg: dict[str, Any]) -> Literal["1", "2", "9"]:
        type_obj = reg.get("type")
        type_text = ""
        if isinstance(type_obj, dict):
            type_text = str(type_obj.get("text") or "").lower()
        if "isent" in type_text:
            return "2"
        number = _number_from_reg(reg)
        if reg.get("enabled") and number:
            return "1"
        if number:
            return "1"
        return "9"

    if origin_uf:
        for reg in regs:
            if not isinstance(reg, dict):
                continue
            st = str(reg.get("state") or "").strip().upper()[:2]
            if st == origin_uf:
                return _number_from_reg(reg), _ie_from_reg(reg)

    for reg in regs:
        if isinstance(reg, dict) and reg.get("enabled"):
            return _number_from_reg(reg), _ie_from_reg(reg)

    for reg in regs:
        if isinstance(reg, dict) and reg.get("number"):
            return _number_from_reg(reg), _ie_from_reg(reg)

    return None, None


def _extract_main_activity(data: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    main = data.get("mainActivity")
    code: str | None = None
    description: str | None = None
    if isinstance(main, dict):
        if main.get("id") is not None:
            code = format_cnae_code(main.get("id"))
        text = main.get("text")
        if text is not None:
            description = str(text).strip() or None
    legacy = data.get("main_activity")
    if isinstance(legacy, str) and legacy.strip() and not description:
        description = legacy.strip()
    combined = description
    if code and description:
        combined = f"{code} - {description}"
    elif code:
        combined = code
    return code, description, combined


def _extract_legal_nature(data: dict[str, Any]) -> str | None:
    company = data.get("company")
    if not isinstance(company, dict):
        return None
    nature = company.get("nature")
    if isinstance(nature, dict):
        text = nature.get("text")
        if text is not None:
            cleaned = str(text).strip()
            return cleaned or None
    return None


def _extract_first_phone(data: dict[str, Any]) -> str | None:
    phones = data.get("phones")
    if not isinstance(phones, list):
        return None
    for row in phones:
        if not isinstance(row, dict):
            continue
        area = str(row.get("area") or "").strip()
        number = re.sub(r"\D", "", str(row.get("number") or ""))
        if area and number:
            return f"{area}{number}"
        if number:
            return number
    return None


def _extract_first_email(data: dict[str, Any]) -> str | None:
    emails = data.get("emails")
    if not isinstance(emails, list):
        return None
    for row in emails:
        if not isinstance(row, dict):
            continue
        address = row.get("address")
        if isinstance(address, str) and address.strip():
            return address.strip().lower()
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
        status_text = str(st).strip() if st is not None else None
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

    main_activity_code, main_activity_description, main_activity = _extract_main_activity(data)
    legal_nature = _extract_legal_nature(data)
    founded_s = _parse_founded_date(data.get("founded"))
    optante_mei = _extract_optante_mei_from_company(company)
    state_registration, ie_indicator = _extract_state_registration(data)
    contact_phone = _extract_first_phone(data)
    contact_email = _extract_first_email(data)

    return CnpjLookupOut(
        source=source,
        tax_id=tax_id,
        company_name=name,
        trade_name=trade_name,
        status_text=status_text,
        founded=founded_s,
        main_activity=main_activity,
        main_activity_code=main_activity_code,
        main_activity_description=main_activity_description,
        legal_nature=legal_nature,
        state_registration=state_registration,
        ie_indicator=ie_indicator,
        contact_phone=contact_phone,
        contact_email=contact_email,
        address=addr_out,
        optante_mei=optante_mei,
    )
