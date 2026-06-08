"""Consulta de CEP via ViaCEP (https://viacep.com.br/)."""

from __future__ import annotations

import json
import math
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.dependencies import get_current_user
from app.limiter import limiter
from app.schemas import CepLookupOut, CepStreetMatchOut, CepStreetSearchOut
from models import User

VIACEP_TMPL = "https://viacep.com.br/ws/{cep}/json/"
NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
NOMINATIM_FETCH_LIMIT = 50
STREET_SEARCH_MAX_RETURN = 40

BR_STATE_TO_UF: dict[str, str] = {
    "acre": "AC",
    "alagoas": "AL",
    "amapá": "AP",
    "amapa": "AP",
    "amazonas": "AM",
    "bahia": "BA",
    "ceará": "CE",
    "ceara": "CE",
    "distrito federal": "DF",
    "espírito santo": "ES",
    "espirito santo": "ES",
    "goiás": "GO",
    "goias": "GO",
    "maranhão": "MA",
    "maranhao": "MA",
    "mato grosso do sul": "MS",
    "mato grosso": "MT",
    "minas gerais": "MG",
    "pará": "PA",
    "para": "PA",
    "paraíba": "PB",
    "paraiba": "PB",
    "paraná": "PR",
    "parana": "PR",
    "pernambuco": "PE",
    "piauí": "PI",
    "piaui": "PI",
    "rio de janeiro": "RJ",
    "rio grande do norte": "RN",
    "rio grande do sul": "RS",
    "rondônia": "RO",
    "rondonia": "RO",
    "roraima": "RR",
    "santa catarina": "SC",
    "são paulo": "SP",
    "sao paulo": "SP",
    "sergipe": "SE",
    "tocantins": "TO",
}


def _cep_digits(raw: str) -> str:
    d = re.sub(r"\D", "", raw or "")
    if len(d) != 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CEP deve conter exatamente 8 dígitos.",
        )
    return d


def _fetch_viacep_url(url: str) -> object:
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
                detail="Parâmetros inválidos para consulta ViaCEP.",
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


def _fetch_viacep_json(digits: str) -> dict:
    url = VIACEP_TMPL.format(cep=digits)
    raw = _fetch_viacep_url(url)
    if not isinstance(raw, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Resposta inválida do ViaCEP.")
    return raw


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


def _norm_text(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value.strip().lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def _city_matches(left: str | None, right: str | None) -> bool:
    a = _norm_text(left)
    b = _norm_text(right)
    if not a or not b:
        return False
    return a == b or a in b or b in a


@dataclass
class _StreetCandidate:
    match: CepStreetMatchOut
    lat: float | None = None
    lon: float | None = None


def _parse_coord(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _nominatim_get(url: str) -> object:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "Climaris-ERP/1.0 (+https://app.climaris.com.br; address lookup)",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível buscar logradouros no momento.",
        ) from exc


def _geocode_city_anchor(city: str, uf: str) -> tuple[float, float] | None:
    params = {
        "format": "json",
        "limit": "1",
        "countrycodes": "br",
        "city": city.strip(),
        "state": uf.strip().upper()[:2],
        "country": "Brazil",
    }
    url = f"{NOMINATIM_SEARCH}?{urllib.parse.urlencode(params)}"
    raw = _nominatim_get(url)
    if not isinstance(raw, list) or not raw:
        return None
    first = raw[0]
    if not isinstance(first, dict):
        return None
    lat = _parse_coord(first.get("lat"))
    lon = _parse_coord(first.get("lon"))
    if lat is None or lon is None:
        return None
    return lat, lon


def _score_street_candidate(
    candidate: _StreetCandidate,
    *,
    street_term: str,
    filter_uf: str | None,
    filter_city: str | None,
    near_uf: str | None,
    near_city: str | None,
    anchor: tuple[float, float] | None,
) -> tuple[int, float]:
    match = candidate.match
    score = 0
    term = _norm_text(street_term)
    street = _norm_text(match.address_street)
    uf = (match.address_state or "").upper()

    if filter_uf and uf == filter_uf:
        score += 2000
    if filter_city:
        if _city_matches(filter_city, match.address_city):
            score += 1500 if _norm_text(filter_city) == _norm_text(match.address_city) else 800

    if near_uf and uf == near_uf.upper():
        score += 1000
    if near_city and _city_matches(near_city, match.address_city):
        score += 500 if _norm_text(near_city) == _norm_text(match.address_city) else 250

    if street.startswith(term):
        score += 100
    elif term and term in street:
        score += 40

    if match.cep and len(re.sub(r"\D", "", match.cep)) == 8:
        score += 10
    if match.address_district:
        score += 5

    distance_km = 9999.0
    if anchor and candidate.lat is not None and candidate.lon is not None:
        distance_km = _haversine_km(anchor[0], anchor[1], candidate.lat, candidate.lon)
        score -= int(min(distance_km, 500))

    return score, distance_km


def _rank_street_candidates(
    candidates: list[_StreetCandidate],
    *,
    street_term: str,
    filter_uf: str | None,
    filter_city: str | None,
    near_uf: str | None,
    near_city: str | None,
    limit: int = STREET_SEARCH_MAX_RETURN,
) -> tuple[list[CepStreetMatchOut], int, bool]:
    anchor: tuple[float, float] | None = None
    bias_city = filter_city or near_city
    bias_uf = filter_uf or near_uf
    if bias_city and bias_uf:
        anchor = _geocode_city_anchor(bias_city, bias_uf)

    ranked = [
        (
            candidate,
            *_score_street_candidate(
                candidate,
                street_term=street_term,
                filter_uf=filter_uf,
                filter_city=filter_city,
                near_uf=near_uf,
                near_city=near_city,
                anchor=anchor,
            ),
        )
        for candidate in candidates
    ]
    ranked.sort(
        key=lambda row: (
            -row[1],
            row[2],
            _norm_text(row[0].match.address_city),
            _norm_text(row[0].match.address_street),
        )
    )
    total = len(ranked)
    selected = [row[0].match for row in ranked[:limit]]
    return selected, total, total > limit


def _format_cep(raw: str | None) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 8:
        return f"{digits[:5]}-{digits[5:]}"
    return digits or ""


def _candidate_key(candidate: _StreetCandidate) -> str:
    match = candidate.match
    return "|".join(
        [
            _norm_text(match.address_street),
            _norm_text(match.address_district),
            _norm_text(match.address_city),
            (match.address_state or "").lower(),
            re.sub(r"\D", "", match.cep or ""),
        ]
    )


def _nominatim_item_to_candidate(item: dict) -> _StreetCandidate | None:
    addr = item.get("address")
    if not isinstance(addr, dict):
        return None
    road = addr.get("road") or addr.get("pedestrian") or addr.get("residential")
    if not road:
        return None
    city_name = (
        addr.get("city")
        or addr.get("town")
        or addr.get("municipality")
        or addr.get("village")
        or addr.get("county")
    )
    district = addr.get("suburb") or addr.get("neighbourhood") or addr.get("quarter") or addr.get("city_district")
    uf_code = _state_name_to_uf(str(addr.get("state") or ""))
    cep = _format_cep(str(addr.get("postcode") or ""))
    return _StreetCandidate(
        match=CepStreetMatchOut(
            cep=cep,
            address_street=str(road).strip(),
            address_district=str(district).strip() if district else None,
            address_city=str(city_name).strip() if city_name else None,
            address_state=uf_code,
            address_complement=None,
        ),
        lat=_parse_coord(item.get("lat")),
        lon=_parse_coord(item.get("lon")),
    )


def _merge_candidates(*groups: list[_StreetCandidate]) -> list[_StreetCandidate]:
    merged: list[_StreetCandidate] = []
    seen: set[str] = set()
    for group in groups:
        for candidate in group:
            key = _candidate_key(candidate)
            if key in seen:
                continue
            seen.add(key)
            merged.append(candidate)
    return merged


def _state_name_to_uf(state_name: str | None) -> str | None:
    if not state_name:
        return None
    text = state_name.strip()
    if len(text) == 2:
        return text.upper()
    return BR_STATE_TO_UF.get(text.lower())


def _search_viacep_street(uf: str, city: str, street: str) -> list[_StreetCandidate]:
    path = "/".join(urllib.parse.quote(part, safe="") for part in (uf, city, street))
    url = f"https://viacep.com.br/ws/{path}/json/"
    raw = _fetch_viacep_url(url)
    if not isinstance(raw, list):
        return []

    candidates: list[_StreetCandidate] = []
    for row in raw[:NOMINATIM_FETCH_LIMIT]:
        if not isinstance(row, dict) or row.get("erro") is True:
            continue
        try:
            out = _viacep_to_out(row)
        except HTTPException:
            continue
        candidates.append(
            _StreetCandidate(
                match=CepStreetMatchOut(
                    cep=out.cep,
                    address_street=out.address_street,
                    address_district=out.address_district,
                    address_city=out.address_city,
                    address_state=out.address_state,
                    address_complement=out.address_complement,
                )
            )
        )
    return candidates


def _nominatim_query(params: dict[str, str]) -> list[_StreetCandidate]:
    params = {**params, "format": "json", "addressdetails": "1", "countrycodes": "br"}
    if "limit" not in params:
        params["limit"] = str(NOMINATIM_FETCH_LIMIT)
    url = f"{NOMINATIM_SEARCH}?{urllib.parse.urlencode(params)}"
    raw = _nominatim_get(url)
    if not isinstance(raw, list):
        return []

    candidates: list[_StreetCandidate] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        candidate = _nominatim_item_to_candidate(item)
        if candidate:
            candidates.append(candidate)
    return candidates


def _search_nominatim_street(
    street: str,
    *,
    uf: str | None = None,
    city: str | None = None,
    near_uf: str | None = None,
    near_city: str | None = None,
) -> list[_StreetCandidate]:
    queries: list[dict[str, str]] = []

    if uf and city:
        queries.append({"street": street, "city": city, "state": uf, "country": "Brazil"})
    elif near_uf and near_city:
        queries.append({"street": street, "city": near_city, "state": near_uf, "country": "Brazil"})
    elif uf or near_uf:
        state = (uf or near_uf or "").upper()[:2]
        queries.append({"q": f"{street}, {state}, Brasil"})
    queries.append({"q": f"{street}, Brasil"})

    groups: list[list[_StreetCandidate]] = []
    for params in queries:
        group = _nominatim_query(params)
        if group:
            groups.append(group)
        if len(_merge_candidates(*groups)) >= NOMINATIM_FETCH_LIMIT:
            break

    return _merge_candidates(*groups)[:NOMINATIM_FETCH_LIMIT]


router = APIRouter(prefix="/cep", tags=["cep"])


@router.get("/search/street", response_model=CepStreetSearchOut)
@limiter.limit("40/minute")
def search_street(
    request: Request,
    _current_user: Annotated[User, Depends(get_current_user)],
    street: str = Query(..., min_length=3, max_length=120),
    uf: str | None = Query(default=None, min_length=2, max_length=2),
    city: str | None = Query(default=None, min_length=2, max_length=100),
    near_uf: str | None = Query(default=None, min_length=2, max_length=2),
    near_city: str | None = Query(default=None, min_length=2, max_length=100),
) -> CepStreetSearchOut:
    """Busca endereços pelo logradouro. Prioriza região informada ou endereço do cliente (near_*)."""
    street_norm = street.strip()
    if len(street_norm) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe ao menos 3 caracteres do logradouro.",
        )

    uf_norm = uf.strip().upper()[:2] if uf else None
    city_norm = city.strip() if city else None
    near_uf_norm = near_uf.strip().upper()[:2] if near_uf else None
    near_city_norm = near_city.strip() if near_city else None

    candidates: list[_StreetCandidate] = []
    source: Literal["viacep", "nominatim"] = "nominatim"

    if uf_norm and city_norm:
        candidates = _search_viacep_street(uf_norm, city_norm, street_norm)
        if candidates:
            source = "viacep"

    if not candidates:
        candidates = _search_nominatim_street(
            street_norm,
            uf=uf_norm,
            city=city_norm,
            near_uf=near_uf_norm,
            near_city=near_city_norm,
        )
        source = "nominatim"

    if not candidates:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum endereço encontrado.")

    matches, total_found, truncated = _rank_street_candidates(
        candidates,
        street_term=street_norm,
        filter_uf=uf_norm,
        filter_city=city_norm,
        near_uf=near_uf_norm,
        near_city=near_city_norm,
    )

    return CepStreetSearchOut(
        source=source,
        matches=matches,
        total_found=total_found,
        truncated=truncated,
    )


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
