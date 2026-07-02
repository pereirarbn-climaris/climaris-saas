"""Upload de screenshots do site institucional (S3)."""

from __future__ import annotations

import io
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.platform_branding import PlatformAssetUploadResult, delete_platform_asset_if_exists
from app.tenant_logo import (
    MAX_UPLOAD_BYTES,
    _build_public_url,
    _optional_acl,
    _resolve_s3_runtime_config,
    _s3_client_from_config,
    s3_bucket_for,
    s3_metadata_ascii,
)

SCREENSHOT_PREFIX = "platform-website/screenshots"
PAGE_IMAGE_PREFIX = "platform-website/pages"
SCREENSHOT_MAX_DIMENSION = 1600
SCREENSHOT_MAX_OUTPUT_BYTES = 900 * 1024


def process_and_upload_website_screenshot(
    *,
    slot: str,
    file_bytes: bytes,
    source_filename: str | None,
    db: Session | None = None,
) -> PlatformAssetUploadResult:
    return _process_and_upload_website_image(
        storage_key=f"{SCREENSHOT_PREFIX}/{slot}",
        asset_label=f"website_screenshot_{slot}",
        file_bytes=file_bytes,
        source_filename=source_filename,
        db=db,
    )


def delete_website_screenshot_if_exists(s3_key: str | None, db: Session | None = None) -> None:
    delete_platform_asset_if_exists(s3_key, db=db)


def process_and_upload_website_page_image(
    *,
    page_slug: str,
    slot: str,
    file_bytes: bytes,
    source_filename: str | None,
    db: Session | None = None,
) -> PlatformAssetUploadResult:
    if not page_slug or not slot:
        raise ValueError("Página ou slot inválido.")
    return _process_and_upload_website_image(
        storage_key=f"{PAGE_IMAGE_PREFIX}/{page_slug}/{slot}",
        asset_label=f"website_page_{page_slug}_{slot}",
        file_bytes=file_bytes,
        source_filename=source_filename,
        db=db,
    )


def _process_and_upload_website_image(
    *,
    storage_key: str,
    asset_label: str,
    file_bytes: bytes,
    source_filename: str | None,
    db: Session | None = None,
) -> PlatformAssetUploadResult:
    if not file_bytes:
        raise ValueError("Arquivo vazio.")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError("Arquivo maior que 8MB. Envie uma imagem menor.")

    try:
        from PIL import Image, ImageOps
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("Dependência Pillow não instalada no servidor para processar imagem.") from exc

    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            has_alpha = img.mode in ("RGBA", "LA") or ("transparency" in img.info)
            normalized = img.convert("RGBA" if has_alpha else "RGB")
            normalized.thumbnail((SCREENSHOT_MAX_DIMENSION, SCREENSHOT_MAX_DIMENSION), Image.Resampling.LANCZOS)

            out = io.BytesIO()
            if has_alpha:
                normalized.save(out, format="PNG", optimize=True)
                content_type = "image/png"
                ext = "png"
            else:
                quality = 86
                while quality >= 64:
                    out.seek(0)
                    out.truncate(0)
                    normalized.save(out, format="WEBP", quality=quality, method=6)
                    if out.tell() <= SCREENSHOT_MAX_OUTPUT_BYTES:
                        break
                    quality -= 6
                content_type = "image/webp"
                ext = "webp"
            data = out.getvalue()
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Arquivo inválido. Envie uma imagem PNG, JPG ou WebP.") from exc

    cfg = _resolve_s3_runtime_config(db)
    bucket = s3_bucket_for(cfg, "imagens")
    if not bucket:
        raise RuntimeError("AWS S3 (imagens) não configurado (bucket_imagens ou credencial aws-s3).")
    region = cfg.region or "us-east-1"
    endpoint_url = cfg.endpoint_url
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    key = f"{storage_key}/{timestamp}-{uuid4().hex[:10]}.{ext}"

    client = _s3_client_from_config(cfg)
    acl = _optional_acl()
    client.put_object(
        **{
            "Bucket": bucket,
            "Key": key,
            "Body": data,
            "ContentType": content_type,
            "CacheControl": "public, max-age=31536000, immutable",
            "Metadata": {
                "asset": asset_label,
                "source_name": s3_metadata_ascii(source_filename),
            },
            **({"ACL": acl} if acl else {}),
        }
    )
    public_url = (
        (cfg.public_base_url.rstrip("/") + f"/{key}")
        if cfg.public_base_url
        else _build_public_url(bucket, region, endpoint_url, key)
    )
    return PlatformAssetUploadResult(
        s3_key=key,
        public_url=public_url,
        content_type=content_type,
        size_bytes=len(data),
    )
