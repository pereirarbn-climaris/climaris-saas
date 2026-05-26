"""Leitura de metadados embutidos em `ServiceOrder.description` (laudo + tipo de serviço)."""

from __future__ import annotations

import json
from typing import Any

_META_MARKER = "\n---CLIMARIS_OS_META---\n"
_META_MARKER_ALT = "---CLIMARIS_OS_META---"

_SERVICE_TYPE_LABELS: dict[str, str] = {
    "corretiva": "Corretiva",
    "preventiva": "Preventiva",
    "instalacao": "Instalação",
}


def _find_meta_slice(description: str) -> tuple[int, int] | None:
    idx = description.find(_META_MARKER)
    if idx >= 0:
        return idx, len(_META_MARKER)
    idx = description.find(_META_MARKER_ALT)
    if idx >= 0:
        return idx, len(_META_MARKER_ALT)
    return None


def parse_service_order_meta(description: str | None) -> dict[str, Any] | None:
    if not description:
        return None
    hit = _find_meta_slice(description)
    if hit is None:
        trimmed = description.strip()
        if trimmed.startswith(_META_MARKER_ALT):
            json_part = trimmed[len(_META_MARKER_ALT) :].strip()
        else:
            return None
    else:
        json_part = description[hit[0] + hit[1] :].strip()
    try:
        parsed = json.loads(json_part)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def parse_tipo_servico(description: str | None) -> str | None:
    meta = parse_service_order_meta(description)
    if not meta:
        return None
    raw = meta.get("tipoServico")
    if not isinstance(raw, str):
        return None
    value = raw.strip().lower()
    return value or None


def parse_checklist_items(description: str | None) -> list[dict[str, str]]:
    meta = parse_service_order_meta(description)
    if not meta:
        return []
    raw = meta.get("checklist")
    if not isinstance(raw, list):
        return []
    out: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        desc = item.get("descricao") or item.get("description") or ""
        status = item.get("status") or "na"
        if not str(desc).strip():
            continue
        item_id = str(item.get("id") or "").strip() or None
        out.append(
            {
                "id": item_id,
                "descricao": str(desc).strip(),
                "status": str(status).strip().lower() or "na",
            }
        )
    return out


_PREVENTIVE_SERVICE_CATEGORIES = frozenset({"preventiva", "pmoc", "preventivo"})


def catalog_service_looks_preventive(
    service_name: str | None,
    periodicidade_meses: int | None,
    service_category: str | None = None,
) -> bool:
    cat = (service_category or "").strip().lower()
    if cat in _PREVENTIVE_SERVICE_CATEGORIES:
        return True
    if cat == "manutencao" and periodicidade_meses is not None and int(periodicidade_meses) > 0:
        return True
    if periodicidade_meses is not None and int(periodicidade_meses) > 0:
        return True
    name = (service_name or "").lower()
    return any(token in name for token in ("prevent", "pmoc", "higien"))


def is_preventive_service_line(
    description: str | None,
    service_name: str | None,
    periodicidade_meses: int | None,
    service_category: str | None = None,
) -> bool:
    tipo = parse_tipo_servico(description)
    if tipo == "preventiva":
        return True
    return catalog_service_looks_preventive(service_name, periodicidade_meses, service_category)


def preventive_sql_match():
    """Expressão SQL (OR) para linhas preventivas — espelha `is_preventive_service_line`."""
    from sqlalchemy import and_, func, or_

    from models import Service, ServiceOrder

    desc = ServiceOrder.description
    name_lower = func.lower(Service.name)
    cat_lower = func.lower(func.coalesce(Service.service_category, ""))
    return or_(
        desc.ilike('%"tipoServico":"preventiva"%'),
        desc.ilike('%"tipoServico": "preventiva"%'),
        desc.ilike('%"tipoServico":"Preventiva"%'),
        desc.ilike('%"tipoServico": "Preventiva"%'),
        Service.periodicidade_meses > 0,
        name_lower.like("%prevent%"),
        name_lower.like("%pmoc%"),
        name_lower.like("%higien%"),
        cat_lower.in_(tuple(_PREVENTIVE_SERVICE_CATEGORIES)),
        and_(cat_lower == "manutencao", Service.periodicidade_meses > 0),
    )


def service_type_label(description: str | None) -> str | None:
    tipo = parse_tipo_servico(description)
    if not tipo:
        return None
    return _SERVICE_TYPE_LABELS.get(tipo, tipo.replace("_", " ").title())
