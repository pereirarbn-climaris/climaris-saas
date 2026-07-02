"""Rotas administrativas de integridade de armazenamento (S3)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.storage_integrity import (
    get_storage_alerts,
    run_storage_reindex,
)
from models import User, UserRole

router = APIRouter(tags=["system"])


class ReindexRequest(BaseModel):
    regenerate_invalid_qr: bool = Field(default=True, description="Regerar etiquetas QR inválidas no S3")
    reupload_missing_budget_pdfs: bool = Field(
        default=False,
        description="Ignorado: PDFs de orçamento são gerados sob demanda (mantido por compatibilidade).",
    )


@router.get(
    "/system/storage-alerts",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def list_storage_alerts(
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    alerts = get_storage_alerts(current_user.tenant_id)
    return JSONResponse(content=jsonable_encoder({"tenant_id": current_user.tenant_id, "alerts": alerts}))


@router.post(
    "/system/reindex",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def system_reindex(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    body: ReindexRequest | None = None,
    regenerate_invalid_qr: Annotated[bool | None, Query()] = None,
    reupload_missing_budget_pdfs: Annotated[bool | None, Query()] = None,
) -> dict:
    """
    Limpa caches locais de verificação S3 e revalida etiquetas QR do tenant.
    """
    req = body or ReindexRequest()
    regen = regenerate_invalid_qr if regenerate_invalid_qr is not None else req.regenerate_invalid_qr
    reupload = (
        reupload_missing_budget_pdfs
        if reupload_missing_budget_pdfs is not None
        else req.reupload_missing_budget_pdfs
    )
    report = run_storage_reindex(
        db,
        tenant_id=current_user.tenant_id,
        regenerate_invalid_qr=regen,
        reupload_missing_budget_pdfs=reupload,
    )
    return JSONResponse(content=jsonable_encoder(report.to_dict()))
