"""Laudo técnico da OS — leitura/gravação no meta JSON de `ServiceOrder.description`."""

from __future__ import annotations

import base64
import json
import re
from typing import Any

from fastapi import HTTPException, status

from app.service_order_meta import parse_service_order_meta

_META_MARKER = "\n---CLIMARIS_OS_META---\n"
_META_MARKER_ALT = "---CLIMARIS_OS_META---"
_MAX_PHOTOS = 12
_MAX_PHOTO_BYTES = 600_000


def _find_meta_slice(description: str) -> tuple[int, int] | None:
    idx = description.find(_META_MARKER)
    if idx >= 0:
        return idx, len(_META_MARKER)
    idx = description.find(_META_MARKER_ALT)
    if idx >= 0:
        return idx, len(_META_MARKER_ALT)
    return None


def free_text_from_description(description: str | None) -> str:
    if not description:
        return ""
    hit = _find_meta_slice(description)
    if hit:
        return description[: hit[0]].strip()
    trimmed = description.strip()
    if trimmed.startswith(_META_MARKER_ALT):
        return ""
    return trimmed


def serialize_description_with_meta(free_text: str, meta: dict[str, Any]) -> str:
    payload = _META_MARKER + json.dumps(meta, ensure_ascii=False)
    base = free_text.strip()
    if not base:
        return payload.lstrip("\n") if payload.startswith("\n") else payload
    return f"{base}{payload}"


def parse_laudo_from_description(description: str | None) -> dict[str, Any]:
    meta = parse_service_order_meta(description) or {}
    return {
        "objetoLaudo": meta.get("objetoLaudo") or "",
        "metodologia": meta.get("metodologia") or "",
        "descricaoProblema": meta.get("descricaoProblema") or free_text_from_description(description),
        "diagnosticoTecnico": meta.get("diagnosticoTecnico") or "",
        "conclusao": meta.get("conclusao") or "",
        "planoAcao": meta.get("planoAcao") or "",
        "pressaoSuccao": meta.get("pressaoSuccao"),
        "pressaoDescarga": meta.get("pressaoDescarga"),
        "tensaoV": meta.get("tensaoV"),
        "correnteA": meta.get("correnteA"),
        "checklist": meta.get("checklist") if isinstance(meta.get("checklist"), list) else [],
        "laudoFotos": meta.get("laudoFotos") if isinstance(meta.get("laudoFotos"), list) else [],
        "clientSignatureBase64": meta.get("clientSignatureBase64"),
        "clientSignatureName": meta.get("clientSignatureName"),
        "clientSignatureAt": meta.get("clientSignatureAt"),
        "clientSignatureGeo": meta.get("clientSignatureGeo"),
    }


def _decode_photo_size(data_url: str) -> int:
    match = re.match(r"^data:image/[\w+.-]+;base64,(.+)$", (data_url or "").strip(), re.I | re.S)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Foto inválida: use imagem em base64 (JPEG/PNG/WEBP).",
        )
    try:
        return len(base64.b64decode(match.group(1)))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Foto inválida: não foi possível decodificar a imagem.",
        ) from exc


def _validate_photos(raw: Any) -> list[dict[str, Any]]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lista de fotos inválida.")
    if len(raw) > _MAX_PHOTOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Máximo de {_MAX_PHOTOS} fotos por laudo.",
        )
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        photo_id = str(item.get("id") or "").strip()
        data_url = item.get("dataUrl") or item.get("data_url") or ""
        if not photo_id or not isinstance(data_url, str) or not data_url.strip():
            continue
        size = _decode_photo_size(data_url)
        if size > _MAX_PHOTO_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cada foto deve ter no máximo {_MAX_PHOTO_BYTES // 1000} KB.",
            )
        caption = item.get("caption")
        out.append(
            {
                "id": photo_id,
                "dataUrl": data_url.strip(),
                "caption": str(caption).strip() if caption else "",
            }
        )
    return out


def apply_laudo_patch(*, description: str | None, payload: dict[str, Any]) -> str:
    meta: dict[str, Any] = dict(parse_service_order_meta(description) or {"v": 1})
    free_text = free_text_from_description(description)

    string_fields = (
        "objetoLaudo",
        "metodologia",
        "descricaoProblema",
        "diagnosticoTecnico",
        "conclusao",
        "planoAcao",
        "clientSignatureBase64",
        "clientSignatureName",
        "clientSignatureAt",
    )
    for key in string_fields:
        if key in payload and payload[key] is not None:
            meta[key] = payload[key]
            if key == "descricaoProblema":
                free_text = str(payload[key] or "").strip()

    numeric_fields = ("pressaoSuccao", "pressaoDescarga", "tensaoV", "correnteA")
    for key in numeric_fields:
        if key in payload:
            val = payload[key]
            meta[key] = val if val is not None else None

    if "clientSignatureGeo" in payload:
        geo = payload["clientSignatureGeo"]
        meta["clientSignatureGeo"] = geo if isinstance(geo, dict) else None

    if "checklist" in payload and payload["checklist"] is not None:
        checklist = payload["checklist"]
        if not isinstance(checklist, list):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Checklist inválido.")
        meta["checklist"] = checklist

    if "laudoFotos" in payload:
        meta["laudoFotos"] = _validate_photos(payload["laudoFotos"])

    if "garantia" in payload and payload["garantia"] is not None:
        garantia = payload["garantia"]
        if not isinstance(garantia, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dados de garantia inválidos.")
        meta["garantia"] = garantia

    meta["v"] = 1
    return serialize_description_with_meta(free_text, meta)
