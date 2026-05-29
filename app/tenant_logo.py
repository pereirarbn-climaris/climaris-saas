from __future__ import annotations

import io
import json
import os
import unicodedata
from dataclasses import dataclass
from typing import Literal
from datetime import datetime, timezone
from uuid import uuid4

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.security import decrypt_platform_secret
from models import PlatformApiCredential


MAX_UPLOAD_BYTES = 8 * 1024 * 1024
DEFAULT_MAX_DIMENSION = 640
DEFAULT_MAX_OUTPUT_BYTES = 220 * 1024


@dataclass
class TenantLogoUploadResult:
    s3_key: str
    public_url: str
    content_type: str
    size_bytes: int


S3BucketPurpose = Literal["default", "manuais", "imagens", "backups"]


@dataclass
class TenantS3RuntimeConfig:
    bucket: str
    region: str
    endpoint_url: str
    public_base_url: str
    prefix: str
    access_key: str
    secret_key: str
    bucket_manuais: str = ""
    bucket_imagens: str = ""
    bucket_backups: str = ""


def s3_bucket_for(cfg: TenantS3RuntimeConfig, purpose: S3BucketPurpose = "default") -> str:
    """Resolve o bucket por finalidade; faz fallback para `bucket` legado."""
    if purpose == "manuais":
        return (cfg.bucket_manuais or cfg.bucket).strip()
    if purpose == "imagens":
        return (cfg.bucket_imagens or cfg.bucket).strip()
    if purpose == "backups":
        return (cfg.bucket_backups or cfg.bucket).strip()
    return cfg.bucket.strip()


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def s3_metadata_ascii(value: str | None, *, default: str = "upload", max_len: int = 120) -> str:
    """Metadados S3 aceitam apenas ASCII — remove acentos do nome do arquivo."""
    raw = (value or default).strip() or default
    folded = unicodedata.normalize("NFKD", raw)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    safe = ascii_only.replace("/", "-").replace("\\", "-").strip()
    return (safe or default)[:max_len]


def _build_public_url(bucket: str, region: str, endpoint_url: str, key: str) -> str:
    base = _env("AWS_S3_PUBLIC_BASE_URL")
    if base:
        return f"{base.rstrip('/')}/{key}"
    if endpoint_url:
        return f"{endpoint_url.rstrip('/')}/{bucket}/{key}"
    if region and region != "us-east-1":
        return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
    return f"https://{bucket}.s3.amazonaws.com/{key}"


def _optional_acl() -> str | None:
    raw = _env("AWS_S3_OBJECT_ACL")
    return raw or None


def _resolve_s3_runtime_config(db: Session | None) -> TenantS3RuntimeConfig:
    cfg = TenantS3RuntimeConfig(
        bucket=_env("AWS_STORAGE_BUCKET_NAME") or _env("AWS_S3_BUCKET"),
        region=_env("AWS_S3_REGION", "us-east-1"),
        endpoint_url=_env("AWS_S3_ENDPOINT_URL"),
        public_base_url=_env("AWS_S3_PUBLIC_BASE_URL"),
        prefix=_env("AWS_S3_TENANT_LOGO_PREFIX", "tenant-logos"),
        access_key=_env("AWS_ACCESS_KEY_ID"),
        secret_key=_env("AWS_SECRET_ACCESS_KEY"),
        bucket_manuais=_env("AWS_S3_BUCKET_MANUAIS"),
        bucket_imagens=_env("AWS_S3_BUCKET_IMAGENS"),
        bucket_backups=_env("AWS_S3_BUCKET_BACKUPS"),
    )
    if db is None:
        return cfg

    row = db.execute(
        select(PlatformApiCredential).where(PlatformApiCredential.provider_slug == "aws-s3")
    ).scalar_one_or_none()
    if row is None:
        return cfg

    extra: dict[str, str] = {}
    if row.extra_config_json:
        try:
            parsed = json.loads(row.extra_config_json)
            if isinstance(parsed, dict):
                extra = {str(k): str(v) for k, v in parsed.items() if isinstance(v, (str, int, float))}
        except json.JSONDecodeError:
            extra = {}

    if not cfg.bucket:
        cfg.bucket = extra.get("bucket", "").strip()
    if not cfg.bucket_manuais:
        cfg.bucket_manuais = extra.get("bucket_manuais", "").strip()
    if not cfg.bucket_imagens:
        cfg.bucket_imagens = extra.get("bucket_imagens", "").strip()
    if not cfg.bucket_backups:
        cfg.bucket_backups = extra.get("bucket_backups", "").strip()
    # Legado: único campo "bucket" no painel = manuais se os específicos estiverem vazios
    if cfg.bucket and not cfg.bucket_manuais:
        cfg.bucket_manuais = cfg.bucket
    if not cfg.region:
        cfg.region = extra.get("region", "").strip() or "us-east-1"
    if not cfg.endpoint_url:
        cfg.endpoint_url = extra.get("endpoint_url", "").strip()
    if not cfg.public_base_url:
        cfg.public_base_url = extra.get("public_base_url", "").strip()
    if not cfg.prefix:
        cfg.prefix = extra.get("prefix", "").strip() or "tenant-logos"
    if not cfg.access_key and row.aws_access_key_id:
        cfg.access_key = decrypt_platform_secret(row.aws_access_key_id)
    if not cfg.secret_key and row.aws_secret_access_key:
        cfg.secret_key = decrypt_platform_secret(row.aws_secret_access_key)
    return cfg


def _s3_client_from_config(cfg: TenantS3RuntimeConfig):
    return boto3.client(
        "s3",
        region_name=cfg.region or None,
        endpoint_url=cfg.endpoint_url or None,
        aws_access_key_id=cfg.access_key or None,
        aws_secret_access_key=cfg.secret_key or None,
        config=BotoConfig(signature_version="s3v4"),
    )


def process_and_upload_tenant_logo(
    *,
    tenant_id: int,
    file_bytes: bytes,
    source_filename: str | None,
    db: Session | None = None,
    key_prefix: str | None = None,
) -> TenantLogoUploadResult:
    if not file_bytes:
        raise ValueError("Arquivo vazio.")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError("Arquivo maior que 8MB. Envie uma imagem menor.")

    try:
        from PIL import Image, ImageOps
    except Exception as exc:  # pragma: no cover - depende de ambiente
        raise RuntimeError("Dependência Pillow não instalada no servidor para processar imagem.") from exc

    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            has_alpha = img.mode in ("RGBA", "LA") or ("transparency" in img.info)
            normalized = img.convert("RGBA" if has_alpha else "RGB")
            normalized.thumbnail((DEFAULT_MAX_DIMENSION, DEFAULT_MAX_DIMENSION), Image.Resampling.LANCZOS)

            out = io.BytesIO()
            quality = 84
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
        raise ValueError("Arquivo inválido. Envie uma imagem JPG, PNG ou WEBP.") from exc

    cfg = _resolve_s3_runtime_config(db)
    bucket = s3_bucket_for(cfg, "imagens")
    if not bucket:
        raise RuntimeError("AWS S3 (imagens) não configurado (bucket_imagens ou credencial aws-s3).")
    region = cfg.region or "us-east-1"
    endpoint_url = cfg.endpoint_url
    prefix = (key_prefix or cfg.prefix or "tenant-logos").strip("/")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    key = f"{prefix}/{timestamp}-{uuid4().hex[:10]}.webp"

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
                "source_name": s3_metadata_ascii(source_filename),
            },
            **({"ACL": acl} if acl else {}),
        }
    )
    return TenantLogoUploadResult(
        s3_key=key,
        public_url=(cfg.public_base_url.rstrip("/") + f"/{key}") if cfg.public_base_url else _build_public_url(bucket, region, endpoint_url, key),
        content_type="image/webp",
        size_bytes=len(data),
    )


def delete_tenant_logo_if_exists(s3_key: str | None, db: Session | None = None) -> None:
    if not s3_key:
        return
    cfg = _resolve_s3_runtime_config(db)
    bucket = s3_bucket_for(cfg, "imagens")
    if not bucket:
        return
    client = _s3_client_from_config(cfg)
    try:
        client.delete_object(Bucket=bucket, Key=s3_key)
    except ClientError:
        return


def fetch_s3_image_bytes(s3_key: str, *, db: Session | None = None) -> tuple[bytes, str]:
    """Baixa bytes da imagem no bucket imagens (uso em proxy same-origin)."""
    cfg = _resolve_s3_runtime_config(db)
    bucket = s3_bucket_for(cfg, "imagens")
    if not bucket:
        raise RuntimeError("AWS S3 (imagens) não configurado.")
    client = _s3_client_from_config(cfg)
    try:
        resp = client.get_object(Bucket=bucket, Key=s3_key)
    except ClientError as exc:
        raise RuntimeError(f"Imagem não encontrada no armazenamento: {exc}") from exc
    body = resp["Body"].read()
    content_type = (resp.get("ContentType") or "image/webp").split(";")[0].strip()
    return body, content_type


def generate_tenant_logo_presigned_url(s3_key: str, *, db: Session | None = None, expires_seconds: int = 900) -> str:
    cfg = _resolve_s3_runtime_config(db)
    bucket = s3_bucket_for(cfg, "imagens")
    if not bucket:
        raise RuntimeError("AWS S3 (imagens) não configurado (env ou credencial SaaS aws-s3).")
    client = _s3_client_from_config(cfg)
    return client.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": bucket, "Key": s3_key},
        ExpiresIn=max(60, min(expires_seconds, 3600)),
    )
