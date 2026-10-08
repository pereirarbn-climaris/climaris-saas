"""Upload de imagens de produto para S3 (URLs públicas para Mercado Livre e vitrine)."""

from __future__ import annotations

import io
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from botocore.exceptions import ClientError
from sqlalchemy.orm import Session

from app.tenant_logo import (
    TenantS3RuntimeConfig,
    _build_public_url,
    _optional_acl,
    _resolve_s3_runtime_config,
    _s3_client_from_config,
)
from app.tenant_logo import MAX_UPLOAD_BYTES as LOGO_MAX_BYTES

MAX_PRODUCT_IMAGE_BYTES = min(LOGO_MAX_BYTES, 10 * 1024 * 1024)
DEFAULT_MAX_DIMENSION = 1600
DEFAULT_MAX_OUTPUT_BYTES = 900 * 1024


@dataclass
class ProductImageUploadResult:
    s3_key: str
    public_url: str
    content_type: str
    size_bytes: int


def _product_prefix(cfg: TenantS3RuntimeConfig) -> str:
    raw = os.getenv("AWS_S3_PRODUCT_IMAGE_PREFIX", "product-images").strip()
    return raw or "product-images"


def process_and_upload_product_image(
    *,
    tenant_id: int,
    product_id: int,
    file_bytes: bytes,
    source_filename: str | None,
    db: Session | None = None,
) -> ProductImageUploadResult:
    if not file_bytes:
        raise ValueError("Arquivo vazio.")
    if len(file_bytes) > MAX_PRODUCT_IMAGE_BYTES:
        raise ValueError("Arquivo muito grande (máx. 10MB).")

    try:
        from PIL import Image, ImageOps
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("Dependência Pillow não instalada no servidor para processar imagem.") from exc

    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            has_alpha = img.mode in ("RGBA", "LA") or ("transparency" in img.info)
            normalized = img.convert("RGBA" if has_alpha else "RGB")
            normalized.thumbnail((DEFAULT_MAX_DIMENSION, DEFAULT_MAX_DIMENSION), Image.Resampling.LANCZOS)

            out = io.BytesIO()
            quality = 86
            while quality >= 62:
                out.seek(0)
                out.truncate(0)
                normalized.save(out, format="WEBP", quality=quality, method=6)
                if out.tell() <= DEFAULT_MAX_OUTPUT_BYTES:
                    break
                quality -= 6
            data = out.getvalue()
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Arquivo inválido. Envie JPG, PNG ou WEBP.") from exc

    cfg = _resolve_s3_runtime_config(db)
    bucket = cfg.bucket
    if not bucket:
        raise RuntimeError("AWS_S3_BUCKET não configurado (env ou credencial SaaS aws-s3).")
    region = cfg.region or "us-east-1"
    endpoint_url = cfg.endpoint_url
    prefix = _product_prefix(cfg)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    key = f"{prefix.strip('/')}/t{tenant_id}/p{product_id}/{timestamp}-{uuid4().hex[:10]}.webp"

    client = _s3_client_from_config(cfg)
    acl = _optional_acl()
    client.put_object(
        **{
            "Bucket": bucket,
            "Key": key,
            "Body": data,
            "ContentType": "image/webp",
            "CacheControl": "public, max-age=31536000, immutable",
            "Metadata": {
                "tenant_id": str(tenant_id),
                "product_id": str(product_id),
                "source_name": (source_filename or "upload").strip()[:120],
            },
            **({"ACL": acl} if acl else {}),
        }
    )
    public_base = cfg.public_base_url or os.getenv("AWS_S3_PUBLIC_BASE_URL", "").strip()
    if public_base:
        pub = f"{public_base.rstrip('/')}/{key}"
    else:
        pub = _build_public_url(bucket, region, endpoint_url, key)
    return ProductImageUploadResult(
        s3_key=key,
        public_url=pub,
        content_type="image/webp",
        size_bytes=len(data),
    )


def delete_product_image_if_exists(s3_key: str | None, db: Session | None = None) -> None:
    if not s3_key:
        return
    cfg = _resolve_s3_runtime_config(db)
    bucket = cfg.bucket
    if not bucket:
        return
    client = _s3_client_from_config(cfg)
    try:
        client.delete_object(Bucket=bucket, Key=s3_key)
    except ClientError:
        return
