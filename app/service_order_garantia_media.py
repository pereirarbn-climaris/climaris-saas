"""Upload de evidência de vácuo (garantia de instalação) para S3."""

from __future__ import annotations

import mimetypes
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.tenant_logo import (
    _build_public_url,
    _optional_acl,
    _resolve_s3_runtime_config,
    _s3_client_from_config,
    s3_bucket_for,
)

MAX_VACUUM_EVIDENCE_BYTES = 12 * 1024 * 1024
ALLOWED_VACUUM_MIME = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
        "application/pdf",
        "application/json",
    }
)


@dataclass
class GarantiaVacuoEvidenceUploadResult:
    storage_key: str
    public_url: str
    mime_type: str
    size_bytes: int
    file_name: str


def _vacuum_prefix() -> str:
    raw = os.getenv("AWS_S3_GARANTIA_VACUUM_PREFIX", "service-order-garantia-vacuum").strip()
    return raw or "service-order-garantia-vacuum"


def upload_garantia_vacuo_evidence_file(
    *,
    tenant_id: int,
    service_order_id: int,
    file_bytes: bytes,
    source_filename: str | None,
    source_content_type: str | None,
    db: Session | None = None,
) -> GarantiaVacuoEvidenceUploadResult:
    if not file_bytes:
        raise ValueError("Arquivo vazio.")
    if len(file_bytes) > MAX_VACUUM_EVIDENCE_BYTES:
        raise ValueError("Arquivo muito grande (máx. 12MB).")

    file_name = (source_filename or "vacuo.jpg").strip()[:180] or "vacuo.jpg"
    guessed_type, _ = mimetypes.guess_type(file_name)
    content_type = (source_content_type or guessed_type or "application/octet-stream").strip().lower()
    if content_type not in ALLOWED_VACUUM_MIME and not content_type.startswith("image/"):
        if file_name.lower().endswith(".tjf"):
            content_type = "application/json"
        else:
            raise ValueError("Formato não suportado. Use foto (JPG, PNG, WebP), PDF ou relatório Testo (.tjf).")

    ext = os.path.splitext(file_name)[1].lower().strip(".")
    if not ext:
        ext = "jpg" if "jpeg" in content_type or content_type.startswith("image/") else "pdf"

    cfg = _resolve_s3_runtime_config(db)
    bucket = s3_bucket_for(cfg, "imagens")
    if not bucket:
        raise RuntimeError("AWS S3 (imagens) não configurado.")

    prefix = _vacuum_prefix()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    key = (
        f"{prefix.strip('/')}/t{tenant_id}/os{service_order_id}/"
        f"{timestamp}-{uuid4().hex[:10]}.{ext}"
    )

    client = _s3_client_from_config(cfg)
    acl = _optional_acl()
    put_kwargs: dict = {
        "Bucket": bucket,
        "Key": key,
        "Body": file_bytes,
        "ContentType": content_type,
        "Metadata": {
            "tenant_id": str(tenant_id),
            "service_order_id": str(service_order_id),
            "source_name": file_name[:120],
        },
    }
    if acl:
        put_kwargs["ACL"] = acl
    client.put_object(**put_kwargs)

    public_url = _build_public_url(bucket, cfg.region or "us-east-1", cfg.endpoint_url or "", key)
    return GarantiaVacuoEvidenceUploadResult(
        storage_key=key,
        public_url=public_url,
        mime_type=content_type,
        size_bytes=len(file_bytes),
        file_name=file_name,
    )


STARTUP_IMAGE_MIME = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
    }
)


def _startup_prefix() -> str:
    raw = os.getenv("AWS_S3_GARANTIA_STARTUP_PREFIX", "service-order-garantia-startup").strip()
    return raw or "service-order-garantia-startup"


def upload_garantia_startup_evidence_file(
    *,
    tenant_id: int,
    service_order_id: int,
    metric_key: str,
    file_bytes: bytes,
    source_filename: str | None,
    source_content_type: str | None,
    db: Session | None = None,
) -> GarantiaVacuoEvidenceUploadResult:
    if not file_bytes:
        raise ValueError("Arquivo vazio.")
    if len(file_bytes) > MAX_VACUUM_EVIDENCE_BYTES:
        raise ValueError("Arquivo muito grande (máx. 12MB).")

    safe_metric = re.sub(r"[^a-z0-9_]+", "_", (metric_key or "metric").strip().lower())[:40] or "metric"
    file_name = (source_filename or f"{safe_metric}.jpg").strip()[:180] or f"{safe_metric}.jpg"
    guessed_type, _ = mimetypes.guess_type(file_name)
    content_type = (source_content_type or guessed_type or "application/octet-stream").strip().lower()
    if content_type not in STARTUP_IMAGE_MIME and not content_type.startswith("image/"):
        raise ValueError("Formato não suportado. Use foto JPG, PNG ou WebP.")

    ext = os.path.splitext(file_name)[1].lower().strip(".")
    if not ext:
        ext = "jpg"

    cfg = _resolve_s3_runtime_config(db)
    bucket = s3_bucket_for(cfg, "imagens")
    if not bucket:
        raise RuntimeError("AWS S3 (imagens) não configurado.")

    prefix = _startup_prefix()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    key = (
        f"{prefix.strip('/')}/t{tenant_id}/os{service_order_id}/{safe_metric}/"
        f"{timestamp}-{uuid4().hex[:10]}.{ext}"
    )

    client = _s3_client_from_config(cfg)
    acl = _optional_acl()
    put_kwargs: dict = {
        "Bucket": bucket,
        "Key": key,
        "Body": file_bytes,
        "ContentType": content_type,
        "Metadata": {
            "tenant_id": str(tenant_id),
            "service_order_id": str(service_order_id),
            "metric_key": safe_metric,
            "source_name": file_name[:120],
        },
    }
    if acl:
        put_kwargs["ACL"] = acl
    client.put_object(**put_kwargs)

    public_url = _build_public_url(bucket, cfg.region or "us-east-1", cfg.endpoint_url or "", key)
    return GarantiaVacuoEvidenceUploadResult(
        storage_key=key,
        public_url=public_url,
        mime_type=content_type,
        size_bytes=len(file_bytes),
        file_name=file_name,
    )
