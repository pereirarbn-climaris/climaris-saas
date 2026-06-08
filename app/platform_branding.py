from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.tenant_logo import (
    MAX_UPLOAD_BYTES,
    _build_public_url,
    _optional_acl,
    _resolve_s3_runtime_config,
    _s3_client_from_config,
    delete_tenant_logo_if_exists,
    fetch_s3_image_bytes,
    s3_bucket_for,
    s3_metadata_ascii,
)

LOGO_PREFIX = "platform-branding/logo"
LOGO_MAX_DIMENSION = 640
LOGO_MAX_OUTPUT_BYTES = 512 * 1024
FAVICON_PREFIX = "platform-branding/favicon"
FAVICON_MAX_DIMENSION = 128
FAVICON_MAX_OUTPUT_BYTES = 48 * 1024
MAX_FAVICON_UPLOAD_BYTES = 2 * 1024 * 1024


@dataclass
class PlatformAssetUploadResult:
    s3_key: str
    public_url: str
    content_type: str
    size_bytes: int


def _image_has_alpha(img) -> bool:
    if img.mode in ("RGBA", "LA"):
        return True
    if img.mode == "P":
        return "transparency" in img.info or img.info.get("transparency") is not None
    return "transparency" in img.info


def _normalize_logo_image(img):
    from PIL import Image

    if _image_has_alpha(img):
        if img.mode == "P":
            return img.convert("RGBA")
        if img.mode == "LA":
            return img.convert("RGBA")
        if img.mode != "RGBA":
            return img.convert("RGBA")
        return img
    return img.convert("RGB")


def process_and_upload_platform_logo(
    *,
    file_bytes: bytes,
    source_filename: str | None,
    db: Session | None = None,
) -> PlatformAssetUploadResult:
    if not file_bytes:
        raise ValueError("Arquivo vazio.")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError("Arquivo maior que 8MB. Envie uma imagem menor.")

    name = (source_filename or "").lower()
    is_svg = name.endswith(".svg")

    cfg = _resolve_s3_runtime_config(db)
    bucket = s3_bucket_for(cfg, "imagens")
    if not bucket:
        raise RuntimeError("AWS S3 (imagens) não configurado (bucket_imagens ou credencial aws-s3).")
    region = cfg.region or "us-east-1"
    endpoint_url = cfg.endpoint_url
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    token = uuid4().hex[:10]

    if is_svg:
        key = f"{LOGO_PREFIX}/{timestamp}-{token}.svg"
        content_type = "image/svg+xml"
        data = file_bytes
    else:
        try:
            from PIL import Image, ImageOps
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("Dependência Pillow não instalada no servidor para processar imagem.") from exc

        try:
            with Image.open(io.BytesIO(file_bytes)) as img:
                img = ImageOps.exif_transpose(img)
                has_alpha = _image_has_alpha(img)
                normalized = _normalize_logo_image(img)
                normalized.thumbnail((LOGO_MAX_DIMENSION, LOGO_MAX_DIMENSION), Image.Resampling.LANCZOS)

                if has_alpha:
                    ext = "png"
                    content_type = "image/png"
                    working = normalized
                    while True:
                        out = io.BytesIO()
                        working.save(out, format="PNG", optimize=True)
                        data = out.getvalue()
                        if len(data) <= LOGO_MAX_OUTPUT_BYTES or working.width <= 128 or working.height <= 128:
                            break
                        working = working.copy()
                        working.thumbnail(
                            (max(128, working.width - 80), max(128, working.height - 80)),
                            Image.Resampling.LANCZOS,
                        )
                else:
                    ext = "webp"
                    content_type = "image/webp"
                    out = io.BytesIO()
                    quality = 84
                    while quality >= 62:
                        out.seek(0)
                        out.truncate(0)
                        normalized.save(out, format="WEBP", quality=quality, method=6)
                        if out.tell() <= LOGO_MAX_OUTPUT_BYTES:
                            break
                        quality -= 6
                    data = out.getvalue()
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("Arquivo inválido. Envie uma imagem PNG, JPG, WebP ou SVG.") from exc

        key = f"{LOGO_PREFIX}/{timestamp}-{token}.{ext}"

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
                "asset": "platform_logo",
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


def process_and_upload_platform_favicon(
    *,
    file_bytes: bytes,
    source_filename: str | None,
    db: Session | None = None,
) -> PlatformAssetUploadResult:
    if not file_bytes:
        raise ValueError("Arquivo vazio.")
    if len(file_bytes) > MAX_FAVICON_UPLOAD_BYTES:
        raise ValueError("Arquivo maior que 2MB. Envie uma imagem menor.")

    try:
        from PIL import Image, ImageOps
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("Dependência Pillow não instalada no servidor para processar imagem.") from exc

    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            has_alpha = img.mode in ("RGBA", "LA") or ("transparency" in img.info)
            normalized = img.convert("RGBA" if has_alpha else "RGB")
            normalized.thumbnail((FAVICON_MAX_DIMENSION, FAVICON_MAX_DIMENSION), Image.Resampling.LANCZOS)

            out = io.BytesIO()
            normalized.save(out, format="PNG", optimize=True)
            data = out.getvalue()
            if len(data) > FAVICON_MAX_OUTPUT_BYTES:
                out.seek(0)
                out.truncate(0)
                smaller = normalized.copy()
                smaller.thumbnail((64, 64), Image.Resampling.LANCZOS)
                smaller.save(out, format="PNG", optimize=True)
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
    key = f"{FAVICON_PREFIX}/{timestamp}-{uuid4().hex[:10]}.png"

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
                "asset": "platform_favicon",
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
        content_type="image/png",
        size_bytes=len(data),
    )


def delete_platform_asset_if_exists(s3_key: str | None, db: Session | None = None) -> None:
    delete_tenant_logo_if_exists(s3_key, db=db)


def fetch_platform_asset_bytes(s3_key: str, *, db: Session | None = None) -> tuple[bytes, str]:
    return fetch_s3_image_bytes(s3_key, db=db)
