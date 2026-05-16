"""Gestão do catálogo de bancos/carteiras (operadora da plataforma)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_platform_operator
from app.finance_bank_catalog_storage import delete_logo_file, process_and_save_bank_logo
from app.schemas import FinanceBankCatalogAdminOut, FinanceBankCatalogAdminPatch
from models import FinanceBankCatalog, User

router = APIRouter(prefix="/platform/finance-bank-catalog", tags=["platform"])

_MAX_LOGO_BYTES = 900_000


def _resolved_logo_url(row: FinanceBankCatalog) -> str | None:
    ext = (row.logo_external_url or "").strip()
    if ext:
        return ext
    if row.logo_file_token:
        return f"/api/v1/finance/bank-catalog-assets/{row.logo_file_token}"
    return None


def _to_admin_out(row: FinanceBankCatalog) -> FinanceBankCatalogAdminOut:
    return FinanceBankCatalogAdminOut(
        id=row.id,
        slug=row.slug,
        bank_name=row.bank_name,
        display_label=row.display_label,
        sort_order=row.sort_order,
        is_active=row.is_active,
        logo_external_url=row.logo_external_url,
        logo_url=_resolved_logo_url(row),
        has_uploaded_logo=bool(row.logo_file_token),
    )


@router.get("", response_model=list[FinanceBankCatalogAdminOut])
def list_finance_bank_catalog(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> list[FinanceBankCatalogAdminOut]:
    rows = (
        db.execute(
            select(FinanceBankCatalog).order_by(FinanceBankCatalog.sort_order.asc(), FinanceBankCatalog.id.asc())
        )
        .scalars()
        .all()
    )
    return [_to_admin_out(r) for r in rows]


@router.patch("/{row_id}", response_model=FinanceBankCatalogAdminOut)
def patch_finance_bank_catalog_row(
    row_id: int,
    payload: FinanceBankCatalogAdminPatch,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> FinanceBankCatalogAdminOut:
    row = db.execute(select(FinanceBankCatalog).where(FinanceBankCatalog.id == row_id)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banco não encontrado no catálogo.")
    data = payload.model_dump(exclude_unset=True)
    if "logo_external_url" in data:
        raw = data["logo_external_url"]
        if raw is None or (isinstance(raw, str) and not str(raw).strip()):
            row.logo_external_url = None
        else:
            row.logo_external_url = str(raw).strip()
    if "display_label" in data and data["display_label"] is not None:
        row.display_label = str(data["display_label"]).strip()
    if "is_active" in data and data["is_active"] is not None:
        row.is_active = bool(data["is_active"])
    if "sort_order" in data and data["sort_order"] is not None:
        row.sort_order = int(data["sort_order"])
    db.commit()
    db.refresh(row)
    return _to_admin_out(row)


@router.post("/{row_id}/logo", response_model=FinanceBankCatalogAdminOut)
async def upload_finance_bank_catalog_logo(
    row_id: int,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
    file: UploadFile = File(...),
) -> FinanceBankCatalogAdminOut:
    row = db.execute(select(FinanceBankCatalog).where(FinanceBankCatalog.id == row_id)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banco não encontrado no catálogo.")
    raw = await file.read()
    if not raw or len(raw) > _MAX_LOGO_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Imagem vazia ou muito grande (máx. ~900 KB).")
    try:
        token, _size = process_and_save_bank_logo(raw)
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não foi possível processar a imagem.") from exc
    old = row.logo_file_token
    row.logo_file_token = token
    row.logo_mime = "image/webp"
    db.commit()
    db.refresh(row)
    delete_logo_file(old)
    return _to_admin_out(row)


@router.delete("/{row_id}/logo", response_model=FinanceBankCatalogAdminOut)
def delete_finance_bank_catalog_logo(
    row_id: int,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> FinanceBankCatalogAdminOut:
    row = db.execute(select(FinanceBankCatalog).where(FinanceBankCatalog.id == row_id)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banco não encontrado no catálogo.")
    old = row.logo_file_token
    row.logo_file_token = None
    row.logo_mime = None
    db.commit()
    db.refresh(row)
    delete_logo_file(old)
    return _to_admin_out(row)
