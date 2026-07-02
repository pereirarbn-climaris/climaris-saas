"""Upload e remoção do banner promocional da gestão preventiva (S3) — por modelo."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.preventive_message_models import (
    load_preventive_message_models,
    normalize_preventive_model_id,
    sync_preventive_models_to_tenant,
    tenant_default_template_model_id,
    update_model_attachment,
)
from app.tenant_logo import delete_tenant_logo_if_exists, process_and_upload_tenant_logo
from models import Tenant


def _resolve_model_id(tenant: Tenant, model_id: str | None) -> str:
    mid = normalize_preventive_model_id(tenant, model_id)
    if mid:
        return mid
    return tenant_default_template_model_id(tenant)


def upload_preventive_promo_image(
    db: Session,
    *,
    tenant_id: int,
    file_bytes: bytes,
    source_filename: str | None,
    model_id: str | None = None,
) -> dict[str, str | None]:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise ValueError("Tenant não encontrado.")
    resolved_model_id = _resolve_model_id(tenant, model_id)
    uploaded = process_and_upload_tenant_logo(
        tenant_id=tenant_id,
        file_bytes=file_bytes,
        source_filename=source_filename,
        db=db,
        key_prefix=f"preventive-banners/tenant-{tenant_id}/{resolved_model_id}",
    )
    models = load_preventive_message_models(tenant)
    previous_key = None
    for model in models:
        if model["id"] == resolved_model_id:
            attach = model.get("attachment") if isinstance(model.get("attachment"), dict) else {}
            previous_key = (attach.get("promo_image_s3_key") or "").strip() or None
            break
    update_model_attachment(
        tenant,
        resolved_model_id,
        patch={
            "promo_image_s3_key": uploaded.s3_key,
            "promo_image_url": uploaded.public_url,
            "promo_image_mimetype": uploaded.content_type,
            "promo_image_enabled": True,
            "has_banner": True,
        },
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    if previous_key and previous_key != uploaded.s3_key:
        delete_tenant_logo_if_exists(previous_key, db=db)
    row = next(
        (m for m in load_preventive_message_models(tenant) if m["id"] == resolved_model_id),
        None,
    )
    attach = row.get("attachment") if isinstance(row, dict) else {}
    return {
        "model_id": resolved_model_id,
        "preventive_promo_image_url": attach.get("promo_image_url") if isinstance(attach, dict) else None,
        "preventive_promo_image_mimetype": attach.get("promo_image_mimetype") if isinstance(attach, dict) else None,
        "preventive_promo_image_s3_key": attach.get("promo_image_s3_key") if isinstance(attach, dict) else None,
    }


def clear_preventive_promo_image(
    db: Session,
    *,
    tenant_id: int,
    model_id: str | None = None,
) -> None:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise ValueError("Tenant não encontrado.")
    resolved_model_id = _resolve_model_id(tenant, model_id)
    models = load_preventive_message_models(tenant)
    previous_key = None
    for model in models:
        if model["id"] == resolved_model_id:
            attach = model.get("attachment") if isinstance(model.get("attachment"), dict) else {}
            previous_key = (attach.get("promo_image_s3_key") or "").strip() or None
            break
    update_model_attachment(
        tenant,
        resolved_model_id,
        patch={
            "promo_image_s3_key": None,
            "promo_image_url": None,
            "promo_image_mimetype": "image/jpeg",
            "promo_image_enabled": False,
            "has_banner": False,
        },
    )
    db.add(tenant)
    db.commit()
    if previous_key:
        delete_tenant_logo_if_exists(previous_key, db=db)


def preventive_model_banner_s3_key(tenant: Tenant, model_id: str | None) -> str | None:
    resolved = _resolve_model_id(tenant, model_id)
    for model in load_preventive_message_models(tenant):
        if model["id"] != resolved:
            continue
        attach = model.get("attachment") if isinstance(model.get("attachment"), dict) else {}
        key = (attach.get("promo_image_s3_key") or "").strip()
        return key or None
    return None
