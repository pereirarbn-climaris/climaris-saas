"""Ingestão de PDFs do S3: PyMuPDF, chunking e vetorização OpenAI."""

from __future__ import annotations

import logging
import threading
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import KB_ENABLED
from app.services.knowledge_base.embeddings import embed_texts
from app.services.knowledge_base.metadata import resolve_manual_chunk_contexts
from app.services.knowledge_base.pdf_extract import chunk_pages, extract_pdf_pages
from app.services.s3 import download_manual_pdf_bytes
from models import EquipmentManual, ManualChunk, ManualIngestionStatus

logger = logging.getLogger("erp.knowledge_base.ingestion")

_ingestion_lock = threading.Lock()
_active_ingestions: set[str] = set()


def ingest_manual(
    db: Session,
    *,
    manual_id: uuid.UUID,
    tenant_id: int,
    force: bool = False,
) -> EquipmentManual:
    if not KB_ENABLED:
        raise RuntimeError("Knowledge Base desabilitada (KB_ENABLED=false).")

    manual = db.execute(
        select(EquipmentManual).where(
            EquipmentManual.id == manual_id,
            EquipmentManual.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if manual is None:
        raise ValueError("Manual não encontrado.")

    if manual.ingestion_status == ManualIngestionStatus.PROCESSING.value and not force:
        return manual

    manual.ingestion_status = ManualIngestionStatus.PROCESSING.value
    manual.ingestion_error = None
    db.flush()

    try:
        pdf_bytes = download_manual_pdf_bytes(manual.s3_url, db=db)
        pages = extract_pdf_pages(pdf_bytes)
        text_chunks = chunk_pages(pages)
        contexts = resolve_manual_chunk_contexts(db, manual=manual, tenant_id=tenant_id)

        db.execute(
            delete(ManualChunk).where(
                ManualChunk.manual_id == manual_id,
                ManualChunk.tenant_id == tenant_id,
            )
        )

        total_saved = 0
        for context in contexts:
            contents = [chunk.content for chunk in text_chunks]
            embeddings = embed_texts(contents)
            for chunk, embedding in zip(text_chunks, embeddings, strict=True):
                db.add(
                    ManualChunk(
                        tenant_id=tenant_id,
                        manual_id=manual_id,
                        fabricante=context.fabricante,
                        modelo=context.modelo,
                        tipo_documento=context.tipo_documento,
                        versao=context.versao,
                        pagina_origem=chunk.pagina_origem,
                        chunk_index=chunk.chunk_index,
                        content=chunk.content,
                        embedding=embedding,
                    )
                )
                total_saved += 1

        manual.ingestion_status = ManualIngestionStatus.READY.value
        manual.ingestion_error = None
        manual.ingested_at = datetime.now(timezone.utc)
        db.flush()
        logger.info(
            "manual_ingested manual_id=%s tenant_id=%s chunks=%s contexts=%s",
            manual_id,
            tenant_id,
            total_saved,
            len(contexts),
        )
        return manual
    except Exception as exc:
        manual.ingestion_status = ManualIngestionStatus.FAILED.value
        manual.ingestion_error = str(exc)[:2000]
        db.flush()
        logger.exception("manual_ingestion_failed manual_id=%s", manual_id)
        raise


def schedule_manual_ingestion(*, manual_id: uuid.UUID, tenant_id: int) -> bool:
    if not KB_ENABLED:
        return False

    key = str(manual_id)
    with _ingestion_lock:
        if key in _active_ingestions:
            return False
        _active_ingestions.add(key)

    def _run() -> None:
        from app.database import SessionLocal

        db = SessionLocal()
        try:
            ingest_manual(db, manual_id=manual_id, tenant_id=tenant_id)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
            with _ingestion_lock:
                _active_ingestions.discard(key)

    threading.Thread(target=_run, daemon=True, name=f"kb-ingest-{key[:8]}").start()
    return True


def schedule_tenant_manuals_ingestion(db: Session, *, tenant_id: int) -> int:
    if not KB_ENABLED:
        return 0

    manuals = db.execute(
        select(EquipmentManual).where(
            EquipmentManual.tenant_id == tenant_id,
            EquipmentManual.ingestion_status != ManualIngestionStatus.PROCESSING.value,
        )
    ).scalars().all()

    scheduled = 0
    for manual in manuals:
        manual.ingestion_status = ManualIngestionStatus.PROCESSING.value
        manual.ingestion_error = None
        if schedule_manual_ingestion(manual_id=manual.id, tenant_id=tenant_id):
            scheduled += 1
    if scheduled:
        db.commit()
    return scheduled
