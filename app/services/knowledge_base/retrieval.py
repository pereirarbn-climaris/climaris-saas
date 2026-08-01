"""Busca semântica nos trechos indexados."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.config import KB_TOP_MANUALS
from app.services.knowledge_base.embeddings import embed_query
from models import EquipmentCatalog, EquipmentManualErrorCode, ManualChunk

_ERROR_CODE_PATTERN = re.compile(r"\b[A-Za-z]{1,3}\d{1,3}[A-Za-z]?\b")


@dataclass(frozen=True)
class RetrievedChunk:
    manual_id: uuid.UUID
    manual_title: str
    fabricante: str
    modelo: str
    tipo_documento: str
    versao: str
    pagina_origem: int
    content: str
    score: float


def _normalize_label(value: str | None) -> str | None:
    if value is None:
        return None
    s = value.strip()
    return s or None


def _manual_ids_for_brand_model(
    db: Session,
    *,
    tenant_id: int,
    brand: str | None,
    model: str | None,
) -> set[uuid.UUID]:
    brand_n = _normalize_label(brand)
    model_n = _normalize_label(model)
    if not brand_n and not model_n:
        return set()

    filters = [EquipmentCatalog.tenant_id == tenant_id]
    if brand_n:
        filters.append(func.lower(EquipmentCatalog.brand) == brand_n.lower())
    if model_n:
        filters.append(func.lower(EquipmentCatalog.model) == model_n.lower())

    rows = db.execute(
        select(EquipmentCatalog.manual_id).where(*filters, EquipmentCatalog.manual_id.is_not(None))
    ).all()
    return {row[0] for row in rows if row[0] is not None}


def _base_chunk_query(
    db: Session,
    *,
    tenant_id: int,
    brand: str | None,
    model: str | None,
) -> Select:
    brand_n = _normalize_label(brand)
    model_n = _normalize_label(model)
    manual_ids = _manual_ids_for_brand_model(db, tenant_id=tenant_id, brand=brand_n, model=model_n)

    stmt = select(ManualChunk).where(ManualChunk.tenant_id == tenant_id)
    if manual_ids:
        stmt = stmt.where(
            or_(
                ManualChunk.manual_id.in_(manual_ids),
                ManualChunk.fabricante == "",
            )
        )
    if brand_n:
        stmt = stmt.where(
            or_(
                func.lower(ManualChunk.fabricante) == brand_n.lower(),
                ManualChunk.fabricante == "",
            )
        )
    if model_n:
        stmt = stmt.where(
            or_(
                func.lower(ManualChunk.modelo) == model_n.lower(),
                ManualChunk.modelo == "",
            )
        )
    return stmt


def retrieve_relevant_chunks(
    db: Session,
    *,
    tenant_id: int,
    question: str,
    brand: str | None = None,
    model: str | None = None,
    top_manuals: int | None = None,
) -> list[RetrievedChunk]:
    limit_manuals = top_manuals or KB_TOP_MANUALS
    query_embedding = embed_query(question.strip(), db=db)
    distance = ManualChunk.embedding.cosine_distance(query_embedding)

    stmt = (
        _base_chunk_query(db, tenant_id=tenant_id, brand=brand, model=model)
        .add_columns(distance.label("distance"))
        .order_by(distance)
        .limit(limit_manuals * 6)
    )
    rows = db.execute(stmt).all()

    by_manual: dict[uuid.UUID, list[tuple[ManualChunk, float]]] = {}
    for chunk, dist in rows:
        score = 1.0 - float(dist)
        by_manual.setdefault(chunk.manual_id, []).append((chunk, score))

    selected_manuals = sorted(
        by_manual.items(),
        key=lambda item: max(score for _, score in item[1]),
        reverse=True,
    )[:limit_manuals]

    results: list[RetrievedChunk] = []
    for manual_id, chunk_scores in selected_manuals:
        chunk_scores.sort(key=lambda item: item[1], reverse=True)
        for chunk, score in chunk_scores[:3]:
            title_parts = [chunk.fabricante, chunk.modelo]
            title = " · ".join(p for p in title_parts if p) or "Manual técnico"
            results.append(
                RetrievedChunk(
                    manual_id=manual_id,
                    manual_title=title,
                    fabricante=chunk.fabricante,
                    modelo=chunk.modelo,
                    tipo_documento=chunk.tipo_documento,
                    versao=chunk.versao,
                    pagina_origem=chunk.pagina_origem,
                    content=chunk.content,
                    score=score,
                )
            )
    return results


def find_matching_error_codes(
    db: Session,
    *,
    tenant_id: int,
    question: str,
    brand: str | None = None,
    model: str | None = None,
    limit: int = 5,
) -> list[EquipmentManualErrorCode]:
    """
    Busca exata/estruturada por código de erro citado na pergunta do técnico (ex: "erro E5",
    "código F2"), priorizada sobre o RAG por chunks — tabelas de código costumam ficar
    fragmentadas entre trechos e a busca semântica erra o valor exato do código.
    """
    candidates = {m.group(0).upper() for m in _ERROR_CODE_PATTERN.finditer(question)}
    if not candidates:
        return []

    manual_ids = _manual_ids_for_brand_model(db, tenant_id=tenant_id, brand=brand, model=model)

    stmt = select(EquipmentManualErrorCode).where(
        EquipmentManualErrorCode.tenant_id == tenant_id,
        func.upper(EquipmentManualErrorCode.code).in_(candidates),
    )
    if manual_ids:
        stmt = stmt.where(EquipmentManualErrorCode.manual_id.in_(manual_ids))
    rows = db.execute(stmt.limit(limit)).scalars().all()
    return list(rows)
