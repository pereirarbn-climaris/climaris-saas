from __future__ import annotations

import io
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.tenant_logo import (
    TenantLogoUploadResult,
    _build_public_url,
    _optional_acl,
    _resolve_s3_runtime_config,
    _s3_client_from_config,
    s3_bucket_for,
    s3_metadata_ascii,
)

MAX_SIGNATURE_BYTES = 2 * 1024 * 1024
MAX_SIGNATURE_WIDTH = 420
MAX_SIGNATURE_HEIGHT = 160


def process_and_upload_budget_signature(
    *,
    tenant_id: int,
    file_bytes: bytes,
    source_filename: str | None,
    db: Session | None = None,
) -> TenantLogoUploadResult:
    if not file_bytes:
        raise ValueError("Arquivo vazio.")
    if len(file_bytes) > MAX_SIGNATURE_BYTES:
        raise ValueError("Arquivo maior que 2MB. Envie uma imagem PNG menor.")

    try:
        from PIL import Image, ImageOps
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("Dependência Pillow não instalada no servidor para processar imagem.") from exc

    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            has_alpha = img.mode in ("RGBA", "LA") or ("transparency" in img.info)
            normalized = img.convert("RGBA" if has_alpha else "RGB")
            normalized.thumbnail(
                (MAX_SIGNATURE_WIDTH, MAX_SIGNATURE_HEIGHT),
                Image.Resampling.LANCZOS,
            )
            out = io.BytesIO()
            normalized.save(out, format="PNG", optimize=True)
            data = out.getvalue()
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Arquivo inválido. Envie uma imagem PNG com fundo transparente.") from exc

    cfg = _resolve_s3_runtime_config(db)
    bucket = s3_bucket_for(cfg, "imagens")
    if not bucket:
        raise RuntimeError("AWS S3 (imagens) não configurado (bucket_imagens ou credencial aws-s3).")
    region = cfg.region or "us-east-1"
    endpoint_url = cfg.endpoint_url
    prefix = (cfg.prefix or "tenant-logos").strip("/")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    key = f"{prefix}/budget-signatures/{tenant_id}/{timestamp}-{uuid4().hex[:10]}.png"

    client = _s3_client_from_config(cfg)
    acl = _optional_acl()
    client.put_object(
        **{
            "Bucket": bucket,
            "Key": key,
            "Body": data,
            "ContentType": "image/png",
            "CacheControl": "public, max-age=31536000, immutable",
            "Metadata": {
                "tenant_id": str(tenant_id),
                "source_name": s3_metadata_ascii(source_filename, default="signature"),
            },
            **({"ACL": acl} if acl else {}),
        }
    )
    return TenantLogoUploadResult(
        s3_key=key,
        public_url=(cfg.public_base_url.rstrip("/") + f"/{key}") if cfg.public_base_url else _build_public_url(bucket, region, endpoint_url, key),
        content_type="image/png",
        size_bytes=len(data),
    )
