"""Upload de evidências fotográficas da OS digital (S3)."""

from __future__ import annotations

import mimetypes
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.tenant_logo import (
    _build_public_url,
    _optional_acl,
    _resolve_s3_runtime_config,
    _s3_client_from_config,
    s3_bucket_for,
)

MAX_EVIDENCE_BYTES = 12 * 1024 * 1024
ALLOWED_EVIDENCE_MIME = frozenset({"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"})


@dataclass
class DigitalWorkOrderEvidenceUploadResult:
    storage_key: str
    public_url: str
    mime_type: str
    size_bytes: int
    file_name: str


def _evidences_prefix() -> str:
    raw = os.getenv("AWS_S3_DIGITAL_OS_EVIDENCES_PREFIX", "digital-work-order-evidences").strip()
    return raw or "digital-work-order-evidences"


def upload_digital_work_order_evidence_file(
    *,
    tenant_id: int,
    digital_work_order_id: UUID,
    evidence_key: str,
    file_bytes: bytes,
    source_filename: str | None,
    source_content_type: str | None,
    db: Session | None = None,
) -> DigitalWorkOrderEvidenceUploadResult:
    if not file_bytes:
        raise ValueError("Arquivo vazio.")
    if len(file_bytes) > MAX_EVIDENCE_BYTES:
        raise ValueError("Arquivo muito grande (máx. 12MB).")

    file_name = (source_filename or "evidencia.jpg").strip()[:180] or "evidencia.jpg"
    guessed_type, _ = mimetypes.guess_type(file_name)
    content_type = (source_content_type or guessed_type or "image/jpeg").strip().lower()
    if content_type not in ALLOWED_EVIDENCE_MIME and not content_type.startswith("image/"):
        raise ValueError("Formato de imagem não suportado.")

    ext = os.path.splitext(file_name)[1].lower().strip(".")
    if not ext:
        ext = "jpg" if "jpeg" in content_type else content_type.split("/")[-1] or "jpg"

    cfg = _resolve_s3_runtime_config(db)
    bucket = s3_bucket_for(cfg, "imagens")
    if not bucket:
        raise RuntimeError("AWS S3 (imagens) não configurado.")

    prefix = _evidences_prefix()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    safe_key = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in evidence_key.strip())[:48] or "evidence"
    key = (
        f"{prefix.strip('/')}/t{tenant_id}/dwo{digital_work_order_id}/"
        f"{safe_key}/{timestamp}-{uuid4().hex[:10]}.{ext}"
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
            "digital_work_order_id": str(digital_work_order_id),
            "evidence_key": safe_key,
        },
    }
    if acl:
        put_kwargs["ACL"] = acl
    client.put_object(**put_kwargs)

    public_url = _build_public_url(bucket=bucket, key=key, region=cfg.region, endpoint_url=cfg.endpoint_url)
    return DigitalWorkOrderEvidenceUploadResult(
        storage_key=key,
        public_url=public_url,
        mime_type=content_type,
        size_bytes=len(file_bytes),
        file_name=file_name,
    )
