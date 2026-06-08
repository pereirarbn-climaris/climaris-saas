"""Identidade visual global do SaaS (logo, favicon, nome da plataforma)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_platform_operator
from app.platform_branding import (
    delete_platform_asset_if_exists,
    fetch_platform_asset_bytes,
    process_and_upload_platform_favicon,
    process_and_upload_platform_logo,
)
from app.schemas import PlatformBrandingOut, PlatformBrandingPatch
from models import PlatformBranding, User

router = APIRouter(prefix="/platform/branding", tags=["platform"])

_BRANDING_SINGLETON_ID = 1


def _get_or_create_branding(db: Session) -> PlatformBranding:
    row = db.get(PlatformBranding, _BRANDING_SINGLETON_ID)
    if row is None:
        row = PlatformBranding(id=_BRANDING_SINGLETON_ID, platform_name="Climaris")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _to_out(row: PlatformBranding) -> PlatformBrandingOut:
    logo_version = int(row.logo_updated_at.timestamp()) if row.logo_updated_at else None
    favicon_version = int(row.favicon_updated_at.timestamp()) if row.favicon_updated_at else None
    return PlatformBrandingOut(
        platform_name=row.platform_name,
        has_logo=bool(row.logo_s3_key),
        has_favicon=bool(row.favicon_s3_key),
        logo_url=f"/api/v1/platform/branding/logo/file?v={logo_version}" if row.logo_s3_key else None,
        favicon_url=f"/api/v1/platform/branding/favicon/file?v={favicon_version}" if row.favicon_s3_key else None,
        logo_updated_at=row.logo_updated_at,
        favicon_updated_at=row.favicon_updated_at,
    )


@router.get("", response_model=PlatformBrandingOut)
def get_platform_branding(db: Annotated[Session, Depends(get_db)]) -> PlatformBrandingOut:
    """Público — usado pelo SPA (login, sidebar, favicon)."""
    return _to_out(_get_or_create_branding(db))


@router.patch("", response_model=PlatformBrandingOut)
def patch_platform_branding(
    payload: PlatformBrandingPatch,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformBrandingOut:
    row = _get_or_create_branding(db)
    data = payload.model_dump(exclude_unset=True)
    if "platform_name" in data and data["platform_name"] is not None:
        name = str(data["platform_name"]).strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome da plataforma não pode ser vazio.")
        row.platform_name = name[:120]
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.post("/logo", response_model=PlatformBrandingOut)
async def upload_platform_logo(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
    file: UploadFile = File(...),
) -> PlatformBrandingOut:
    row = _get_or_create_branding(db)
    raw = await file.read()
    try:
        uploaded = process_and_upload_platform_logo(
            file_bytes=raw,
            source_filename=file.filename,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao processar ou enviar logo: {exc}",
        ) from exc

    previous_key = row.logo_s3_key
    row.logo_s3_key = uploaded.s3_key
    row.logo_url = uploaded.public_url
    row.logo_content_type = uploaded.content_type
    row.logo_updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    db.refresh(row)
    if previous_key and previous_key != uploaded.s3_key:
        delete_platform_asset_if_exists(previous_key, db=db)
    return _to_out(row)


@router.delete("/logo", response_model=PlatformBrandingOut)
def delete_platform_logo(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformBrandingOut:
    row = _get_or_create_branding(db)
    old_key = row.logo_s3_key
    row.logo_s3_key = None
    row.logo_url = None
    row.logo_content_type = None
    row.logo_updated_at = None
    db.add(row)
    db.commit()
    db.refresh(row)
    if old_key:
        delete_platform_asset_if_exists(old_key, db=db)
    return _to_out(row)


@router.get("/logo/file")
def get_platform_logo_file(db: Annotated[Session, Depends(get_db)]) -> Response:
    row = _get_or_create_branding(db)
    if not row.logo_s3_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo da plataforma não cadastrado.")
    try:
        data, content_type = fetch_platform_asset_bytes(row.logo_s3_key, db=db)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "public, max-age=300"})


@router.post("/favicon", response_model=PlatformBrandingOut)
async def upload_platform_favicon(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
    file: UploadFile = File(...),
) -> PlatformBrandingOut:
    row = _get_or_create_branding(db)
    raw = await file.read()
    try:
        uploaded = process_and_upload_platform_favicon(
            file_bytes=raw,
            source_filename=file.filename,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao processar ou enviar favicon: {exc}",
        ) from exc

    previous_key = row.favicon_s3_key
    row.favicon_s3_key = uploaded.s3_key
    row.favicon_url = uploaded.public_url
    row.favicon_content_type = uploaded.content_type
    row.favicon_updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    db.refresh(row)
    if previous_key and previous_key != uploaded.s3_key:
        delete_platform_asset_if_exists(previous_key, db=db)
    return _to_out(row)


@router.delete("/favicon", response_model=PlatformBrandingOut)
def delete_platform_favicon(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformBrandingOut:
    row = _get_or_create_branding(db)
    old_key = row.favicon_s3_key
    row.favicon_s3_key = None
    row.favicon_url = None
    row.favicon_content_type = None
    row.favicon_updated_at = None
    db.add(row)
    db.commit()
    db.refresh(row)
    if old_key:
        delete_platform_asset_if_exists(old_key, db=db)
    return _to_out(row)


@router.get("/favicon/file")
def get_platform_favicon_file(db: Annotated[Session, Depends(get_db)]) -> Response:
    row = _get_or_create_branding(db)
    if not row.favicon_s3_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Favicon da plataforma não cadastrado.")
    try:
        data, content_type = fetch_platform_asset_bytes(row.favicon_s3_key, db=db)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "public, max-age=300"})
