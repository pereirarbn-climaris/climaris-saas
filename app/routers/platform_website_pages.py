"""Páginas configuráveis do site institucional — operação e leitura pública."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_platform_operator
from app.platform_branding import fetch_platform_asset_bytes
from app.platform_website_assets import (
    delete_website_screenshot_if_exists,
    process_and_upload_website_page_image,
)
from app.schemas_website_pages import (
    PublicWebsitePageOut,
    WebsitePageImageOut,
    WebsitePageOut,
    WebsitePagePatch,
    WebsitePageSectionOut,
    WebsitePageSummaryOut,
)
from app.website_pages_registry import WebsitePageDefinition, get_page_definition, list_page_definitions
from models import PlatformWebsitePage, User

router = APIRouter(prefix="/platform/website/pages", tags=["platform-website-pages"])
public_router = APIRouter(prefix="/public/website/pages", tags=["public-website-pages"])


def _image_entry(images: dict[str, Any], slot: str) -> dict[str, Any]:
    raw = images.get(slot)
    return raw if isinstance(raw, dict) else {}


def _image_url(page_slug: str, slot: str, images: dict[str, Any]) -> str | None:
    entry = _image_entry(images, slot)
    s3_key = entry.get("s3_key")
    if not s3_key:
        return None
    updated_at = entry.get("updated_at")
    version = 0
    if isinstance(updated_at, str):
        try:
            version = int(datetime.fromisoformat(updated_at.replace("Z", "+00:00")).timestamp())
        except ValueError:
            version = 0
    return f"/api/v1/public/website/pages/{page_slug}/images/{slot}/file?v={version}"


def _sections_from_row(row: PlatformWebsitePage) -> list[WebsitePageSectionOut]:
    raw = row.sections_json if isinstance(row.sections_json, list) else []
    sections: list[WebsitePageSectionOut] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "").strip()
        title = str(item.get("title") or "").strip()
        description = str(item.get("description") or "").strip()
        bullets_raw = item.get("bullets")
        bullets = [str(b).strip() for b in bullets_raw if str(b).strip()] if isinstance(bullets_raw, list) else []
        if key and title:
            sections.append(
                WebsitePageSectionOut(key=key, title=title, description=description, bullets=bullets)
            )
    return sections


def _outcomes_from_row(row: PlatformWebsitePage) -> list[str]:
    raw = row.outcomes_json if isinstance(row.outcomes_json, list) else []
    return [str(s).strip() for s in raw if str(s).strip()]


def _images_out(row: PlatformWebsitePage, definition: WebsitePageDefinition) -> list[WebsitePageImageOut]:
    images = row.images_json if isinstance(row.images_json, dict) else {}
    result: list[WebsitePageImageOut] = []
    for slot_def in definition.image_slots:
        entry = _image_entry(images, slot_def.slot)
        updated_raw = entry.get("updated_at")
        updated_at: datetime | None = None
        if isinstance(updated_raw, str):
            try:
                updated_at = datetime.fromisoformat(updated_raw.replace("Z", "+00:00"))
            except ValueError:
                updated_at = None
        result.append(
            WebsitePageImageOut(
                slot=slot_def.slot,
                label=slot_def.label,
                hint=slot_def.hint,
                has_image=bool(entry.get("s3_key")),
                url=_image_url(row.slug, slot_def.slot, images),
                updated_at=updated_at,
            )
        )
    return result


def _to_out(row: PlatformWebsitePage, definition: WebsitePageDefinition) -> WebsitePageOut:
    return WebsitePageOut(
        slug=row.slug,
        label=row.label,
        path=row.path,
        title=row.title,
        subtitle=row.subtitle,
        hero_description=row.hero_description,
        seo_title=row.seo_title,
        seo_description=row.seo_description,
        sections=_sections_from_row(row),
        outcomes=_outcomes_from_row(row),
        images=_images_out(row, definition),
        is_published=row.is_published,
        updated_at=row.updated_at,
    )


def _to_public(row: PlatformWebsitePage, definition: WebsitePageDefinition) -> PublicWebsitePageOut:
    images = row.images_json if isinstance(row.images_json, dict) else {}
    image_urls = {
        slot_def.slot: _image_url(row.slug, slot_def.slot, images) for slot_def in definition.image_slots
    }
    return PublicWebsitePageOut(
        slug=row.slug,
        title=row.title,
        subtitle=row.subtitle,
        hero_description=row.hero_description,
        seo_title=row.seo_title,
        seo_description=row.seo_description,
        sections=_sections_from_row(row),
        outcomes=_outcomes_from_row(row),
        images=image_urls,
    )


def _default_row(definition: WebsitePageDefinition) -> PlatformWebsitePage:
    return PlatformWebsitePage(
        slug=definition.slug,
        label=definition.label,
        path=definition.path,
        title=definition.default_title,
        subtitle=definition.default_subtitle,
        hero_description=definition.default_hero_description,
        seo_title=definition.default_seo_title,
        seo_description=definition.default_seo_description,
        sections_json=list(definition.default_sections),
        outcomes_json=list(definition.default_outcomes),
        images_json={},
        sort_order=definition.sort_order,
        is_published=True,
    )


def _get_or_create(db: Session, slug: str) -> tuple[PlatformWebsitePage, WebsitePageDefinition]:
    definition = get_page_definition(slug)
    if definition is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Página não configurável.")
    row = db.get(PlatformWebsitePage, slug)
    if row is None:
        row = _default_row(definition)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row, definition


def _validate_image_slot(definition: WebsitePageDefinition, slot: str) -> None:
    if slot not in {s.slot for s in definition.image_slots}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot de imagem inválido.")


@router.get("", response_model=list[WebsitePageSummaryOut])
def list_platform_website_pages(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> list[WebsitePageSummaryOut]:
    rows = {r.slug: r for r in db.execute(select(PlatformWebsitePage)).scalars().all()}
    summaries: list[WebsitePageSummaryOut] = []
    for definition in list_page_definitions():
        row = rows.get(definition.slug)
        if row is None:
            summaries.append(
                WebsitePageSummaryOut(
                    slug=definition.slug,
                    label=definition.label,
                    path=definition.path,
                    sort_order=definition.sort_order,
                    is_published=True,
                    updated_at=None,
                )
            )
        else:
            summaries.append(
                WebsitePageSummaryOut(
                    slug=row.slug,
                    label=row.label,
                    path=row.path,
                    sort_order=row.sort_order,
                    is_published=row.is_published,
                    updated_at=row.updated_at,
                )
            )
    return summaries


@router.get("/{slug}", response_model=WebsitePageOut)
def get_platform_website_page(
    slug: str,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> WebsitePageOut:
    row, definition = _get_or_create(db, slug)
    return _to_out(row, definition)


@router.patch("/{slug}", response_model=WebsitePageOut)
def patch_platform_website_page(
    slug: str,
    payload: WebsitePagePatch,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> WebsitePageOut:
    row, definition = _get_or_create(db, slug)
    data = payload.model_dump(exclude_unset=True)
    sections = data.pop("sections", None)
    outcomes = data.pop("outcomes", None)
    for key, value in data.items():
        if value is not None:
            setattr(row, key, value)
    if sections is not None:
        if not sections:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe ao menos uma seção.")
        row.sections_json = [s.model_dump() for s in sections]
    if outcomes is not None:
        if not outcomes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe ao menos um resultado.")
        row.outcomes_json = outcomes
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row, definition)


@router.post("/{slug}/images/{slot}", response_model=WebsitePageOut)
async def upload_website_page_image(
    slug: str,
    slot: str,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
    file: UploadFile = File(...),
) -> WebsitePageOut:
    row, definition = _get_or_create(db, slug)
    _validate_image_slot(definition, slot)
    raw = await file.read()
    try:
        uploaded = process_and_upload_website_page_image(
            page_slug=slug,
            slot=slot,
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
            detail=f"Falha ao processar ou enviar imagem: {exc}",
        ) from exc

    images = dict(row.images_json) if isinstance(row.images_json, dict) else {}
    previous_key = _image_entry(images, slot).get("s3_key")
    now = datetime.now(timezone.utc).isoformat()
    images[slot] = {
        "s3_key": uploaded.s3_key,
        "content_type": uploaded.content_type,
        "updated_at": now,
    }
    row.images_json = images
    db.add(row)
    db.commit()
    db.refresh(row)
    if previous_key and previous_key != uploaded.s3_key:
        delete_website_screenshot_if_exists(previous_key, db=db)
    return _to_out(row, definition)


@router.delete("/{slug}/images/{slot}", response_model=WebsitePageOut)
def delete_website_page_image(
    slug: str,
    slot: str,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> WebsitePageOut:
    row, definition = _get_or_create(db, slug)
    _validate_image_slot(definition, slot)
    images = dict(row.images_json) if isinstance(row.images_json, dict) else {}
    old_key = _image_entry(images, slot).get("s3_key")
    if slot in images:
        del images[slot]
    row.images_json = images
    db.add(row)
    db.commit()
    db.refresh(row)
    if old_key:
        delete_website_screenshot_if_exists(old_key, db=db)
    return _to_out(row, definition)


@public_router.get("/{slug}", response_model=PublicWebsitePageOut)
def get_public_website_page(slug: str, db: Annotated[Session, Depends(get_db)]) -> PublicWebsitePageOut:
    row, definition = _get_or_create(db, slug)
    if not row.is_published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Página indisponível.")
    return _to_public(row, definition)


@public_router.get("/{slug}/images/{slot}/file")
def get_public_website_page_image(slug: str, slot: str, db: Annotated[Session, Depends(get_db)]) -> Response:
    row, definition = _get_or_create(db, slug)
    if not row.is_published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Página indisponível.")
    _validate_image_slot(definition, slot)
    images = row.images_json if isinstance(row.images_json, dict) else {}
    s3_key = _image_entry(images, slot).get("s3_key")
    if not s3_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imagem não cadastrada.")
    content_type = _image_entry(images, slot).get("content_type") or "application/octet-stream"
    try:
        data, resolved_type = fetch_platform_asset_bytes(s3_key, db=db)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(
        content=data,
        media_type=str(resolved_type or content_type),
        headers={"Cache-Control": "public, max-age=300"},
    )
