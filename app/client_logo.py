"""Upload e resolução de logo do cliente (etiquetas QR e materiais)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.tenant_logo import (
    delete_tenant_logo_if_exists,
    generate_tenant_logo_presigned_url,
    process_and_upload_tenant_logo,
)
from models import Client


def process_and_upload_client_logo(
    *,
    tenant_id: int,
    client_id: int,
    file_bytes: bytes,
    source_filename: str | None,
    db: Session | None = None,
):
    """Reutiliza pipeline WebP/S3 do logo do tenant com prefixo por cliente."""
    return process_and_upload_tenant_logo(
        tenant_id=tenant_id,
        file_bytes=file_bytes,
        source_filename=source_filename,
        db=db,
        key_prefix=f"client-logos/tenant-{tenant_id}/client-{client_id}",
    )


def resolve_client_logo_url(client: Client, *, db: Session | None = None, expires_seconds: int = 900) -> str | None:
    if client.logo_s3_key:
        try:
            return generate_tenant_logo_presigned_url(client.logo_s3_key, db=db, expires_seconds=expires_seconds)
        except Exception:
            pass
    return (client.logo_url or "").strip() or None


def clear_client_logo(client: Client, *, db: Session | None = None) -> None:
    old_key = client.logo_s3_key
    client.logo_s3_key = None
    client.logo_url = None
    client.logo_content_type = None
    client.logo_updated_at = None
    if old_key:
        delete_tenant_logo_if_exists(old_key, db=db)


def touch_client_logo_upload(client: Client, uploaded) -> None:
    client.logo_s3_key = uploaded.s3_key
    client.logo_url = uploaded.public_url
    client.logo_content_type = uploaded.content_type
    client.logo_updated_at = datetime.now(timezone.utc)
