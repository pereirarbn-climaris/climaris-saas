from __future__ import annotations

import mimetypes
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from botocore.exceptions import ClientError
from sqlalchemy.orm import Session

from app.tenant_logo import _build_public_url, _optional_acl, _resolve_s3_runtime_config, _s3_client_from_config

MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024


@dataclass
class EquipmentDocumentAttachmentUploadResult:
    s3_key: str
    public_url: str
    content_type: str
    size_bytes: int
    file_name: str


def _attachments_prefix() -> str:
    raw = os.getenv("AWS_S3_EQUIPMENT_DOCUMENTS_PREFIX", "equipment-documents").strip()
    return raw or "equipment-documents"


def upload_equipment_document_attachment(
    *,
    tenant_id: int,
    equipment_id: int,
    document_id: int,
    file_bytes: bytes,
    source_filename: str | None,
    source_content_type: str | None,
    db: Session | None = None,
) -> EquipmentDocumentAttachmentUploadResult:
    if not file_bytes:
        raise ValueError("Arquivo vazio.")
    if len(file_bytes) > MAX_ATTACHMENT_BYTES:
        raise ValueError("Arquivo muito grande (máx. 20MB).")

    file_name = (source_filename or "anexo").strip()[:180] or "anexo"
    guessed_type, _ = mimetypes.guess_type(file_name)
    content_type = (source_content_type or guessed_type or "application/octet-stream").strip()
    ext = os.path.splitext(file_name)[1].lower().strip(".") or "bin"

    cfg = _resolve_s3_runtime_config(db)
    bucket = cfg.bucket
    if not bucket:
        raise RuntimeError("AWS_S3_BUCKET não configurado (env ou credencial SaaS aws-s3).")

    region = cfg.region or "us-east-1"
    endpoint_url = cfg.endpoint_url
    prefix = _attachments_prefix()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    key = (
        f"{prefix.strip('/')}/t{tenant_id}/e{equipment_id}/d{document_id}/"
        f"{timestamp}-{uuid4().hex[:10]}.{ext}"
    )

    client = _s3_client_from_config(cfg)
    acl = _optional_acl()
    client.put_object(
        **{
            "Bucket": bucket,
            "Key": key,
            "Body": file_bytes,
            "ContentType": content_type,
            "Metadata": {
                "tenant_id": str(tenant_id),
                "equipment_id": str(equipment_id),
                "document_id": str(document_id),
                "source_name": file_name,
            },
            **({"ACL": acl} if acl else {}),
        }
    )

    public_base = cfg.public_base_url or os.getenv("AWS_S3_PUBLIC_BASE_URL", "").strip()
    if public_base:
        public_url = f"{public_base.rstrip('/')}/{key}"
    else:
        public_url = _build_public_url(bucket, region, endpoint_url, key)

    return EquipmentDocumentAttachmentUploadResult(
        s3_key=key,
        public_url=public_url,
        content_type=content_type,
        size_bytes=len(file_bytes),
        file_name=file_name,
    )


def delete_equipment_document_attachment_if_exists(s3_key: str | None, db: Session | None = None) -> None:
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
