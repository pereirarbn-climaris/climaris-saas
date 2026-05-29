"""Upload e remoção do banner promocional da gestão preventiva (S3)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.tenant_logo import delete_tenant_logo_if_exists, process_and_upload_tenant_logo
from models import Tenant


def upload_preventive_promo_image(
    db: Session,
    *,
    tenant_id: int,
    file_bytes: bytes,
    source_filename: str | None,
) -> dict[str, str | None]:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise ValueError("Tenant não encontrado.")
    uploaded = process_and_upload_tenant_logo(
        tenant_id=tenant_id,
        file_bytes=file_bytes,
        source_filename=source_filename,
        db=db,
        key_prefix=f"preventive-banners/tenant-{tenant_id}",
    )
    previous_key = tenant.preventive_promo_image_s3_key
    tenant.preventive_promo_image_s3_key = uploaded.s3_key
    tenant.preventive_promo_image_url = uploaded.public_url
    tenant.preventive_promo_image_mimetype = uploaded.content_type
    if not tenant.preventive_promo_image_enabled and uploaded.public_url:
        tenant.preventive_promo_image_enabled = True
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    if previous_key and previous_key != uploaded.s3_key:
        delete_tenant_logo_if_exists(previous_key, db=db)
    return {
        "preventive_promo_image_url": tenant.preventive_promo_image_url,
        "preventive_promo_image_mimetype": tenant.preventive_promo_image_mimetype,
        "preventive_promo_image_s3_key": tenant.preventive_promo_image_s3_key,
    }


def clear_preventive_promo_image(db: Session, *, tenant_id: int) -> None:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise ValueError("Tenant não encontrado.")
    previous_key = tenant.preventive_promo_image_s3_key
    tenant.preventive_promo_image_s3_key = None
    tenant.preventive_promo_image_url = None
    tenant.preventive_promo_image_mimetype = None
    tenant.preventive_promo_image_enabled = False
    db.add(tenant)
    db.commit()
    if previous_key:
        delete_tenant_logo_if_exists(previous_key, db=db)
