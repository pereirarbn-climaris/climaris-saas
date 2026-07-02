"""Metadados de contexto (fabricante, modelo, tipo, versão) por manual."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import EquipmentCatalog, EquipmentManual

_EXTRA_MANUAL_KEYS: tuple[tuple[str, str, str], ...] = (
    ("manual_usuario_id", "manual_usuario", "Manual do usuário"),
    ("manual_instalacao_id", "manual_instalacao", "Manual de instalação"),
    ("manual_servico_id", "manual_servico", "Manual de serviço"),
)

_VERSION_RE = re.compile(r"\bv(?:ers(?:ão|ao)?\.?)?\s*(\d+(?:\.\d+)+)\b", re.IGNORECASE)


@dataclass(frozen=True)
class ManualChunkContext:
    fabricante: str
    modelo: str
    tipo_documento: str
    versao: str


def _extract_version(*, manual: EquipmentManual, catalog: EquipmentCatalog | None) -> str:
    if catalog is not None and isinstance(catalog.technical_data, dict):
        for key in ("manual_version", "versao_manual", "versao"):
            raw = catalog.technical_data.get(key)
            if isinstance(raw, str) and raw.strip():
                return raw.strip()[:40]
    match = _VERSION_RE.search(manual.title or "")
    if match:
        return match.group(1)[:40]
    return ""


def _append_context(
    contexts: list[ManualChunkContext],
    seen: set[tuple[str, str, str, str]],
    *,
    fabricante: str,
    modelo: str,
    tipo_documento: str,
    versao: str,
) -> None:
    key = (fabricante, modelo, tipo_documento, versao)
    if key in seen:
        return
    seen.add(key)
    contexts.append(
        ManualChunkContext(
            fabricante=fabricante,
            modelo=modelo,
            tipo_documento=tipo_documento,
            versao=versao,
        )
    )


def resolve_manual_chunk_contexts(
    db: Session,
    *,
    manual: EquipmentManual,
    tenant_id: int,
) -> list[ManualChunkContext]:
    manual_id = manual.id
    mid = str(manual_id)
    contexts: list[ManualChunkContext] = []
    seen: set[tuple[str, str, str, str]] = set()

    catalog_rows = db.execute(
        select(EquipmentCatalog).where(EquipmentCatalog.tenant_id == tenant_id)
    ).scalars().all()

    for catalog in catalog_rows:
        fabricante = (catalog.brand or "").strip()
        modelo = (catalog.model or "").strip()
        versao = _extract_version(manual=manual, catalog=catalog)

        if catalog.manual_id == manual_id:
            _append_context(
                contexts,
                seen,
                fabricante=fabricante,
                modelo=modelo,
                tipo_documento="manual_principal",
                versao=versao,
            )

        td = catalog.technical_data if isinstance(catalog.technical_data, dict) else {}
        for id_key, tipo_slug, _label in _EXTRA_MANUAL_KEYS:
            if str(td.get(id_key) or "").strip() == mid:
                _append_context(
                    contexts,
                    seen,
                    fabricante=fabricante,
                    modelo=modelo,
                    tipo_documento=tipo_slug,
                    versao=versao,
                )

    if not contexts:
        versao = _extract_version(manual=manual, catalog=None)
        tipo = "manual_tecnico"
        title_lower = (manual.title or "").lower()
        if "instala" in title_lower:
            tipo = "manual_instalacao"
        elif "usu" in title_lower:
            tipo = "manual_usuario"
        elif "servi" in title_lower:
            tipo = "manual_servico"
        _append_context(
            contexts,
            seen,
            fabricante="",
            modelo="",
            tipo_documento=tipo,
            versao=versao,
        )

    return contexts
