"""Coleta e download de fotos de evidência da garantia (vácuo + startup)."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Any
from urllib.request import urlopen

from sqlalchemy.orm import Session

from app.tenant_logo import fetch_s3_image_bytes

_IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"})


@dataclass(frozen=True)
class GarantiaEvidencePhoto:
    caption: str
    image_bytes: bytes


def _block_str(block: dict[str, Any], *keys: str) -> str:
    for key in keys:
        val = block.get(key)
        if val is not None and str(val).strip():
            return str(val).strip()
    return ""


def _is_image_evidence_block(block: dict[str, Any]) -> bool:
    mime = _block_str(block, "mimeType", "mime_type").lower()
    if mime:
        if mime.startswith("image/"):
            return True
        if mime in ("application/json", "application/pdf"):
            return False
    file_name = _block_str(block, "fileName", "file_name").lower()
    if file_name.endswith((".tjf", ".json", ".pdf")):
        return False
    if any(file_name.endswith(ext) for ext in _IMAGE_EXTENSIONS):
        return True
    storage_key = _block_str(block, "storageKey", "storage_key").lower()
    if storage_key:
        return any(storage_key.endswith(ext) for ext in _IMAGE_EXTENSIONS)
    return True


def _load_image_bytes(
    *,
    storage_key: str | None,
    public_url: str | None,
    db: Session | None,
) -> bytes | None:
    if storage_key:
        try:
            body, content_type = fetch_s3_image_bytes(storage_key, db=db)
            if body and (not content_type or content_type.startswith("image/")):
                return body
        except Exception:
            pass
    if public_url:
        try:
            with urlopen(public_url, timeout=10) as response:
                body = response.read()
            if body:
                return body
        except Exception:
            pass
    return None


def _caption_with_value(label: str, value: str, unit: str) -> str:
    val = (value or "").strip()
    if val and val != "—":
        suffix = f" {unit}" if unit else ""
        return f"{label} — {val}{suffix}"
    return label


def collect_garantia_evidence_photo_specs(
    garantia: dict[str, Any],
    doc: dict[str, Any],
) -> list[dict[str, str | None]]:
    """Metadados das fotos (sem download) — ordem fixa no anexo."""
    specs: list[dict[str, str | None]] = []

    vacuo = garantia.get("vacuoFoto")
    if isinstance(vacuo, dict) and _is_image_evidence_block(vacuo):
        specs.append(
            {
                "storage_key": _block_str(vacuo, "storageKey", "storage_key") or None,
                "public_url": _block_str(vacuo, "publicUrl", "public_url") or None,
                "caption": _caption_with_value(
                    "Vácuo — visor do vacuômetro",
                    _block_str(vacuo, "vacuoFinalMicronsAi") or str(doc.get("vacuo_microns") or ""),
                    "µ",
                ),
            }
        )

    metric_specs: list[tuple[str, str, str, str]] = [
        ("pressaoFoto", "Pressão de trabalho", "pressao_psi", "PSI"),
        ("tensaoFoto", "Tensão medida", "tensao_v", "V"),
        ("correnteFoto", "Corrente do compressor", "corrente_a", "A"),
        ("tempInsuflamentoFoto", "Temp. insuflamento", "temp_insuflamento", "°C"),
        ("tempRetornoFoto", "Temp. retorno", "temp_retorno", "°C"),
    ]
    for field, label, doc_key, unit in metric_specs:
        block = garantia.get(field)
        if not isinstance(block, dict) or not _is_image_evidence_block(block):
            continue
        extracted = _block_str(block, "extractedValue", "extracted_value")
        value = extracted or str(doc.get(doc_key) or "")
        specs.append(
            {
                "storage_key": _block_str(block, "storageKey", "storage_key") or None,
                "public_url": _block_str(block, "publicUrl", "public_url") or None,
                "caption": _caption_with_value(label, value, unit),
            }
        )
    return specs


def load_garantia_evidence_photos(
    garantia: dict[str, Any],
    doc: dict[str, Any],
    *,
    db: Session | None = None,
) -> list[GarantiaEvidencePhoto]:
    loaded: list[GarantiaEvidencePhoto] = []
    for spec in collect_garantia_evidence_photo_specs(garantia, doc):
        blob = _load_image_bytes(
            storage_key=spec.get("storage_key"),
            public_url=spec.get("public_url"),
            db=db,
        )
        if not blob:
            continue
        loaded.append(GarantiaEvidencePhoto(caption=str(spec.get("caption") or "Evidência"), image_bytes=blob))
    return loaded


def has_garantia_evidence_photos(garantia: dict[str, Any], doc: dict[str, Any]) -> bool:
    return bool(collect_garantia_evidence_photo_specs(garantia, doc))


def has_startup_measurements(garantia: dict[str, Any], doc: dict[str, Any]) -> bool:
    if has_garantia_evidence_photos(garantia, doc):
        return True
    for key in ("vacuo_microns", "pressao_psi", "tensao_v", "corrente_a", "temp_insuflamento", "temp_retorno"):
        val = str(doc.get(key) or "").strip()
        if val and val != "—":
            return True
    return False


def format_metric_cell(value: str, has_photo: bool, unit: str) -> str:
    val = (value or "").strip()
    if val and val != "—":
        return f"{val} {unit}".strip()
    if has_photo:
        return "Conforme foto (anexo)"
    return "—"
