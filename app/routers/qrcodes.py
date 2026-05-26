"""API de gestão de cartelas QR pré-geradas."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.qrcode_labels_pdf import build_qrcode_labels_pdf
from app.schemas import QrCodeGenerateRequest, QrCodeOut, QrCodeValidateOut
from app.services.qrcode_labels import (
    build_qrcode_public_url,
    count_qrcodes_by_status,
    generate_qrcode_batch,
    get_qrcode_by_code_id,
    normalize_code_id,
    link_available_qrcodes_to_equipments,
    reset_qrcode_inventory,
    validate_available_qrcode,
)
from app.services.qrcode_label_logos import resolve_qrcode_label_context
from models import QrCode, QrCodeStatus, Tenant, User, UserRole

router = APIRouter(prefix="/qrcodes", tags=["qrcodes"])


def _qrcode_to_out(row: QrCode, *, db: Session, tenant: Tenant) -> dict:
    status = row.status.value if hasattr(row.status, "value") else str(row.status)
    client_id, tenant_has_logo_flag = resolve_qrcode_label_context(db, tenant=tenant, row=row)
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "code_id": row.code_id,
        "status": status,
        "linked_to_equipment_id": row.linked_to_equipment_id,
        "client_id": client_id,
        "tenant_has_logo": tenant_has_logo_flag,
        "tracking_url": row.tracking_url or build_qrcode_public_url(row.code_id),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


@router.get(
    "",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def list_qrcodes(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status_filter: Annotated[QrCodeStatus | None, Query(alias="status")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> dict:
    query = select(QrCode).where(QrCode.tenant_id == current_user.tenant_id)
    if status_filter is not None:
        query = query.where(QrCode.status == status_filter)
    rows = db.execute(query.order_by(QrCode.id.desc()).offset(skip).limit(limit)).scalars().all()
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    return JSONResponse(
        content=jsonable_encoder(
            {
                "items": [_qrcode_to_out(r, db=db, tenant=tenant) for r in rows],
                "counts": count_qrcodes_by_status(db, current_user.tenant_id),
                "skip": skip,
                "limit": limit,
            }
        )
    )


@router.post(
    "/generate",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def generate_qrcodes(
    payload: QrCodeGenerateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    try:
        result = generate_qrcode_batch(db, tenant_id=current_user.tenant_id, quantity=payload.quantity)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return JSONResponse(
        content=jsonable_encoder(
            {
                "created": result.created,
                "code_ids": result.code_ids,
                "first_code_id": result.first_code_id,
                "last_code_id": result.last_code_id,
            }
        )
    )


@router.post(
    "/link-equipments",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def link_qrcodes_to_equipments(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Associa etiquetas QR disponíveis aos equipamentos cadastrados que ainda não têm cartela."""
    result = link_available_qrcodes_to_equipments(db, tenant_id=current_user.tenant_id)
    db.commit()
    message = f"Vinculadas {result.linked} etiqueta(s) a equipamento(s)."
    if result.equipment_still_without_qr:
        message += (
            f" {result.equipment_still_without_qr} equipamento(s) sem etiqueta"
            f" (faltam cartelas disponíveis — gere mais lotes)."
        )
    if result.qrcodes_still_available:
        message += f" {result.qrcodes_still_available} etiqueta(s) ainda disponíveis."
    return JSONResponse(
        content=jsonable_encoder(
            {
                "linked": result.linked,
                "equipment_without_qr": result.equipment_without_qr,
                "code_ids": result.qrcodes_used,
                "equipment_still_without_qr": result.equipment_still_without_qr,
                "qrcodes_still_available": result.qrcodes_still_available,
                "message": message,
            }
        )
    )


@router.post(
    "/reset",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def reset_qrcodes(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Remove todas as cartelas do tenant. Próxima geração começa em QR0000001."""
    deleted = reset_qrcode_inventory(db, tenant_id=current_user.tenant_id)
    db.commit()
    return JSONResponse(
        content=jsonable_encoder(
            {
                "deleted": deleted,
                "message": "Inventário zerado. Gere um novo lote para imprimir a partir de QR0000001.",
                "next_code_id": "QR0000001",
            }
        )
    )


@router.get(
    "/validate/{code_id}",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def validate_qrcode_for_link(
    code_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> QrCodeValidateOut:
    normalized = normalize_code_id(code_id)
    row = get_qrcode_by_code_id(db, normalized, tenant_id=current_user.tenant_id)
    if row is None:
        return QrCodeValidateOut(found=False, available=False, message="Código QR não encontrado.")
    available = row.status == QrCodeStatus.AVAILABLE and row.linked_to_equipment_id is None
    if available:
        return QrCodeValidateOut(
            found=True,
            available=True,
            code_id=row.code_id,
            message="Código disponível para vinculação.",
        )
    return QrCodeValidateOut(
        found=True,
        available=False,
        code_id=row.code_id,
        linked_to_equipment_id=row.linked_to_equipment_id,
        message="Este código já está vinculado a um equipamento.",
    )


@router.get(
    "/labels/pdf",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def export_qrcode_labels_pdf(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status_filter: Annotated[QrCodeStatus | None, Query(alias="status")] = QrCodeStatus.AVAILABLE,
    code_ids: Annotated[str | None, Query(description="Lista separada por vírgula; se vazio, usa status_filter")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    label_format: Annotated[str, Query(description="a4_grid | thermal_58")] = "a4_grid",
) -> Response:
    ids: list[str] = []
    if code_ids and code_ids.strip():
        ids = [normalize_code_id(part) for part in code_ids.split(",") if part.strip()]
        ids = [c for c in ids if c]
        rows = db.execute(
            select(QrCode).where(
                QrCode.tenant_id == current_user.tenant_id,
                QrCode.code_id.in_(ids),
            )
        ).scalars().all()
        ids = [r.code_id for r in rows]
    else:
        query = select(QrCode).where(QrCode.tenant_id == current_user.tenant_id)
        if status_filter is not None:
            query = query.where(QrCode.status == status_filter)
        rows = db.execute(query.order_by(QrCode.code_id.asc()).limit(limit)).scalars().all()
        ids = [r.code_id for r in rows]

    if not ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma etiqueta encontrada para impressão.")

    try:
        fmt = label_format if label_format in ("a4_grid", "thermal_58") else "a4_grid"
        pdf = build_qrcode_labels_pdf(code_ids=ids, label_format=fmt)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="etiquetas-qr.pdf"'},
    )
