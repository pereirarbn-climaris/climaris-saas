"""Site institucional — configuração (operação) e leitura pública."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_platform_operator
from app.platform_branding import fetch_platform_asset_bytes
from app.platform_website_assets import delete_website_screenshot_if_exists, process_and_upload_website_screenshot
from app.platform_website_cnpj import apply_cnpj_lookup_to_website_settings
from app.routers.cnpj import _lookup_cnpj_best_effort
from app.schemas import CnpjLookupOut
from app.schemas_website_settings import (
    SCREENSHOT_SLOTS,
    PlatformWebsiteCnpjLookupIn,
    PlatformWebsiteSettingsOut,
    PlatformWebsiteSettingsPatch,
    PublicWebsiteSettingsOut,
    WebsiteScreenshotOut,
)
from app.tax_id import normalize_and_validate_tax_document
from models import PlatformWebsiteSettings, User

router = APIRouter(prefix="/platform/website", tags=["platform-website"])
public_router = APIRouter(prefix="/public/website", tags=["public-website"])

_SINGLETON_ID = 1
_DEFAULT_SERVICES = [
    "Gestão operacional e ordens de serviço",
    "Inteligência financeira integrada",
    "Laudos e conformidade PMOC",
    "Orçamentos e contratos recorrentes",
]

ScreenshotSlot = Literal["hero", "dashboard", "finance", "orders"]


def _default_row() -> PlatformWebsiteSettings:
    return PlatformWebsiteSettings(
        id=_SINGLETON_ID,
        hero_title=(
            "Aumente a produtividade da sua equipe de campo e a rentabilidade dos seus contratos"
        ),
        hero_subtitle=(
            "O Climaris é o software B2B de gestão para empresas de climatização e refrigeração: "
            "contratos, orçamentos, OS, financeiro e conformidade técnica (PMOC) em uma plataforma."
        ),
        seo_title="Climaris — Software de Gestão para Empresas de Climatização e Refrigeração",
        seo_description=(
            "Sistema completo para gestão de contratos, orçamentos e conformidade técnica (PMOC). "
            "Software para empresas de refrigeração com gestão de OS e inteligência financeira."
        ),
        contact_email="contato@climaris.com.br",
        legal_name="Climaris",
        address_street="Araraquara — atendimento comercial e suporte regional",
        address_city="Araraquara",
        address_state="SP",
        address_postal="14800-000",
        services_json=list(_DEFAULT_SERVICES),
    )


def _get_or_create(db: Session) -> PlatformWebsiteSettings:
    row = db.get(PlatformWebsiteSettings, _SINGLETON_ID)
    if row is None:
        row = _default_row()
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _services_list(row: PlatformWebsiteSettings) -> list[str]:
    raw = row.services_json
    if isinstance(raw, list) and raw:
        return [str(s).strip() for s in raw if str(s).strip()]
    return list(_DEFAULT_SERVICES)


def _screenshot_url(slot: str, s3_key: str | None, updated_at: datetime | None) -> str | None:
    if not s3_key:
        return None
    version = int(updated_at.timestamp()) if updated_at else 0
    return f"/api/v1/platform/website/screenshots/{slot}/file?v={version}"


def _screenshot_field(row: PlatformWebsiteSettings, slot: ScreenshotSlot) -> tuple[str | None, str | None, datetime | None]:
    return (
        getattr(row, f"{slot}_s3_key"),
        getattr(row, f"{slot}_content_type"),
        getattr(row, f"{slot}_updated_at"),
    )


def _to_out(row: PlatformWebsiteSettings) -> PlatformWebsiteSettingsOut:
    screenshots: list[WebsiteScreenshotOut] = []
    for slot in SCREENSHOT_SLOTS:
        key, _, updated = _screenshot_field(row, slot)  # type: ignore[arg-type]
        screenshots.append(
            WebsiteScreenshotOut(
                slot=slot,
                has_image=bool(key),
                url=_screenshot_url(slot, key, updated),
                updated_at=updated,
            )
        )
    return PlatformWebsiteSettingsOut(
        hero_title=row.hero_title,
        hero_subtitle=row.hero_subtitle,
        seo_title=row.seo_title,
        seo_description=row.seo_description,
        contact_email=row.contact_email,
        contact_phone=row.contact_phone,
        legal_name=row.legal_name,
        trade_name=row.trade_name,
        cnpj=row.cnpj,
        is_verified_cnpj=bool(row.is_verified_cnpj),
        cnpj_verified_at=row.cnpj_verified_at,
        dpo_name=row.dpo_name,
        dpo_email=row.dpo_email,
        address_street=row.address_street,
        address_city=row.address_city,
        address_state=row.address_state,
        address_postal=row.address_postal,
        services=_services_list(row),
        screenshots=screenshots,
        updated_at=row.updated_at,
    )


def _to_public(row: PlatformWebsiteSettings) -> PublicWebsiteSettingsOut:
    screenshots: dict[str, str | None] = {}
    for slot in SCREENSHOT_SLOTS:
        key, _, updated = _screenshot_field(row, slot)  # type: ignore[arg-type]
        screenshots[slot] = _screenshot_url(slot, key, updated)
    return PublicWebsiteSettingsOut(
        hero_title=row.hero_title,
        hero_subtitle=row.hero_subtitle,
        seo_title=row.seo_title,
        seo_description=row.seo_description,
        contact_email=row.contact_email,
        contact_phone=row.contact_phone,
        legal_name=row.legal_name,
        trade_name=row.trade_name,
        cnpj=row.cnpj,
        is_verified_cnpj=bool(row.is_verified_cnpj),
        cnpj_verified_at=row.cnpj_verified_at,
        dpo_name=row.dpo_name,
        dpo_email=row.dpo_email,
        address_street=row.address_street,
        address_city=row.address_city,
        address_state=row.address_state,
        address_postal=row.address_postal,
        services=_services_list(row),
        screenshots=screenshots,
    )


@public_router.get("", response_model=PublicWebsiteSettingsOut)
def get_public_website_settings(db: Annotated[Session, Depends(get_db)]) -> PublicWebsiteSettingsOut:
    return _to_public(_get_or_create(db))


@router.get("", response_model=PlatformWebsiteSettingsOut)
def get_platform_website_settings(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformWebsiteSettingsOut:
    return _to_out(_get_or_create(db))


@router.patch("", response_model=PlatformWebsiteSettingsOut)
def patch_platform_website_settings(
    payload: PlatformWebsiteSettingsPatch,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformWebsiteSettingsOut:
    row = _get_or_create(db)
    data = payload.model_dump(exclude_unset=True)
    services = data.pop("services", None)
    for key, value in data.items():
        if value is not None or key == "is_verified_cnpj":
            setattr(row, key, value)
    if services is not None:
        cleaned = [s.strip() for s in services if s and s.strip()]
        if not cleaned:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe ao menos um serviço.")
        row.services_json = cleaned
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.post("/cnpj-lookup", response_model=CnpjLookupOut)
def platform_website_cnpj_lookup(
    payload: PlatformWebsiteCnpjLookupIn,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> CnpjLookupOut:
    """Consulta CNPJá e preenche os dados institucionais da plataforma (empresa Climaris / LGPD)."""
    try:
        digits = normalize_and_validate_tax_document(payload.cnpj, "cnpj")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    lookup = _lookup_cnpj_best_effort(digits, db)
    if lookup is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="CNPJ não encontrado. Verifique o número ou configure a chave CNPJA em Operação → Chaves API.",
        )

    row = _get_or_create(db)
    apply_cnpj_lookup_to_website_settings(row, lookup)
    db.add(row)
    db.commit()
    db.refresh(row)
    return lookup


def _validate_slot(slot: str) -> ScreenshotSlot:
    if slot not in SCREENSHOT_SLOTS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot de imagem inválido.")
    return slot  # type: ignore[return-value]


@router.post("/screenshots/{slot}", response_model=PlatformWebsiteSettingsOut)
async def upload_website_screenshot(
    slot: str,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
    file: UploadFile = File(...),
) -> PlatformWebsiteSettingsOut:
    valid_slot = _validate_slot(slot)
    row = _get_or_create(db)
    raw = await file.read()
    try:
        uploaded = process_and_upload_website_screenshot(
            slot=valid_slot,
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

    previous_key = getattr(row, f"{valid_slot}_s3_key")
    setattr(row, f"{valid_slot}_s3_key", uploaded.s3_key)
    setattr(row, f"{valid_slot}_content_type", uploaded.content_type)
    setattr(row, f"{valid_slot}_updated_at", datetime.now(timezone.utc))
    db.add(row)
    db.commit()
    db.refresh(row)
    if previous_key and previous_key != uploaded.s3_key:
        delete_website_screenshot_if_exists(previous_key, db=db)
    return _to_out(row)


@router.delete("/screenshots/{slot}", response_model=PlatformWebsiteSettingsOut)
def delete_website_screenshot(
    slot: str,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformWebsiteSettingsOut:
    valid_slot = _validate_slot(slot)
    row = _get_or_create(db)
    old_key = getattr(row, f"{valid_slot}_s3_key")
    setattr(row, f"{valid_slot}_s3_key", None)
    setattr(row, f"{valid_slot}_content_type", None)
    setattr(row, f"{valid_slot}_updated_at", None)
    db.add(row)
    db.commit()
    db.refresh(row)
    if old_key:
        delete_website_screenshot_if_exists(old_key, db=db)
    return _to_out(row)


@router.get("/screenshots/{slot}/file")
def get_website_screenshot_file(slot: str, db: Annotated[Session, Depends(get_db)]) -> Response:
    valid_slot = _validate_slot(slot)
    row = _get_or_create(db)
    s3_key = getattr(row, f"{valid_slot}_s3_key")
    if not s3_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imagem não cadastrada.")
    try:
        data, content_type = fetch_platform_asset_bytes(s3_key, db=db)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "public, max-age=300"})
