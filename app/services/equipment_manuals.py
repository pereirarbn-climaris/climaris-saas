from __future__ import annotations

import uuid

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.services.knowledge_base.ingestion import schedule_manual_ingestion
from app.services.s3 import upload_manual_pdf
from models import EquipmentManual


def build_catalog_display_model(
    *,
    model_evaporator: str | None,
    model_condenser: str | None,
    fallback: str | None = None,
) -> str:
    """Rótulo legível para listagens (campo model)."""
    evap = (model_evaporator or "").strip()
    cond = (model_condenser or "").strip()
    if evap and cond:
        return f"{evap} + {cond}"
    if evap:
        return evap
    if cond:
        return cond
    return (fallback or "").strip() or "—"


async def create_equipment_manual_from_pdf(
    *,
    file: UploadFile,
    title: str,
    tenant_id: int,
    db: Session,
) -> EquipmentManual:
    title_clean = title.strip()
    if not title_clean:
        raise ValueError("Título do manual é obrigatório.")
    s3_url = await upload_manual_pdf(file, db=db)
    manual = EquipmentManual(tenant_id=tenant_id, title=title_clean, s3_url=s3_url)
    db.add(manual)
    db.flush()
    schedule_manual_ingestion(manual_id=manual.id, tenant_id=tenant_id)
    return manual


def get_equipment_manual_or_404(
    db: Session,
    manual_id: uuid.UUID,
    tenant_id: int,
) -> EquipmentManual:
    manual = db.execute(
        select(EquipmentManual).where(
            EquipmentManual.id == manual_id,
            EquipmentManual.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if manual is None:
        raise ValueError("Manual não encontrado.")
    return manual
