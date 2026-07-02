"""Knowledge Base (RAG) — consulta e indexação de manuais."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.config import KB_ENABLED
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.schemas import (
    KnowledgeAskIn,
    KnowledgeAskOut,
    KnowledgeIngestAllOut,
    KnowledgeIngestOut,
    KnowledgeManualUsedOut,
)
from app.services.knowledge_base.ingestion import schedule_manual_ingestion, schedule_tenant_manuals_ingestion
from app.services.knowledge_base.ask import ask_knowledge_base
from models import ClientEquipment, ClientEquipmentComponent, EquipmentManual, ManualChunk, ManualIngestionStatus, User, UserRole

router = APIRouter(prefix="/ai", tags=["ai-knowledge"])


def _resolve_brand_model_from_equipment(
    db: Session,
    *,
    tenant_id: int,
    equipment_id: uuid.UUID,
) -> tuple[str | None, str | None]:
    installation = db.execute(
        select(ClientEquipment)
        .options(joinedload(ClientEquipment.components).joinedload(ClientEquipmentComponent.catalog))
        .where(
            ClientEquipment.id == equipment_id,
            ClientEquipment.tenant_id == tenant_id,
        )
    ).unique().scalar_one_or_none()
    if installation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado.")

    for component in installation.components:
        catalog = component.catalog
        if catalog is None:
            continue
        brand = (catalog.brand or "").strip() or None
        model = (catalog.model or "").strip() or None
        if brand or model:
            return brand, model
    return None, None


@router.post("/ask", response_model=KnowledgeAskOut)
def ask_manual_knowledge(
    payload: KnowledgeAskIn,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> KnowledgeAskOut:
    if not KB_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Knowledge Base desabilitada.")

    brand = payload.brand
    model = payload.model
    if payload.equipment_id is not None:
        eq_brand, eq_model = _resolve_brand_model_from_equipment(
            db, tenant_id=current_user.tenant_id, equipment_id=payload.equipment_id
        )
        brand = brand or eq_brand
        model = model or eq_model

    try:
        result = ask_knowledge_base(
            db,
            tenant_id=current_user.tenant_id,
            question=payload.question,
            brand=brand,
            model=model,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return KnowledgeAskOut(
        answer=result["answer"],
        manuals_used=[KnowledgeManualUsedOut.model_validate(row) for row in result["manuals_used"]],
        chunks_found=result["chunks_found"],
        has_context=result["has_context"],
    )


@router.post("/knowledge/ingest/{manual_id}", response_model=KnowledgeIngestOut)
def ingest_manual_knowledge(
    manual_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.TECHNICIAN))],
) -> KnowledgeIngestOut:
    if not KB_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Knowledge Base desabilitada.")

    manual = db.execute(
        select(EquipmentManual).where(
            EquipmentManual.id == manual_id,
            EquipmentManual.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if manual is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manual não encontrado.")

    if manual.ingestion_status != ManualIngestionStatus.PROCESSING.value:
        manual.ingestion_status = ManualIngestionStatus.PROCESSING.value
        manual.ingestion_error = None
        db.commit()

    schedule_manual_ingestion(manual_id=manual_id, tenant_id=current_user.tenant_id)

    chunks_count = db.execute(
        select(func.count()).select_from(ManualChunk).where(
            ManualChunk.manual_id == manual_id,
            ManualChunk.tenant_id == current_user.tenant_id,
        )
    ).scalar_one()

    db.refresh(manual)
    return KnowledgeIngestOut(
        manual_id=str(manual.id),
        ingestion_status=manual.ingestion_status,
        ingestion_error=manual.ingestion_error,
        ingested_at=manual.ingested_at,
        chunks_count=int(chunks_count or 0),
    )


@router.post(
    "/knowledge/ingest-all",
    response_model=KnowledgeIngestAllOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def ingest_all_manuals_knowledge(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> KnowledgeIngestAllOut:
    if not KB_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Knowledge Base desabilitada.")

    scheduled = schedule_tenant_manuals_ingestion(db, tenant_id=current_user.tenant_id)
    if scheduled == 0:
        return KnowledgeIngestAllOut(
            scheduled=0,
            message="Nenhum manual pendente de indexação (ou todos já estão em processamento).",
        )
    return KnowledgeIngestAllOut(
        scheduled=scheduled,
        message=f"Indexação em background iniciada para {scheduled} manual(is).",
    )
