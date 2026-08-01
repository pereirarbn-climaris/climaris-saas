from __future__ import annotations

import mimetypes
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from botocore.exceptions import ClientError
from sqlalchemy.orm import Session

from app.tenant_logo import (
    _build_public_url,
    _optional_acl,
    _resolve_s3_runtime_config,
    _s3_client_from_config,
    s3_bucket_for,
    s3_metadata_ascii,
)

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
ALLOWED_CONTENT_TYPES = frozenset(
    {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/jpg",
    }
)


@dataclass
class ContractAttachmentUploadResult:
    s3_key: str
    public_url: str
    content_type: str
    size_bytes: int
    file_name: str


def _attachments_prefix() -> str:
    raw = os.getenv("AWS_S3_CLIENT_CONTRACTS_PREFIX", "client-contracts").strip()
    return raw or "client-contracts"


def _bucket_purpose_for_content_type(content_type: str) -> str:
    if content_type.startswith("image/"):
        return "imagens"
    return "manuais"


def upload_client_contract_attachment(
    *,
    tenant_id: int,
    client_id: int,
    contract_id: int,
    file_bytes: bytes,
    source_filename: str | None,
    source_content_type: str | None,
    db: Session | None = None,
) -> ContractAttachmentUploadResult:
    if not file_bytes:
        raise ValueError("Arquivo vazio.")
    if len(file_bytes) > MAX_ATTACHMENT_BYTES:
        raise ValueError("Arquivo muito grande (máx. 10MB).")

    file_name = (source_filename or "anexo").strip()[:180] or "anexo"
    guessed_type, _ = mimetypes.guess_type(file_name)
    content_type = (source_content_type or guessed_type or "application/octet-stream").strip().lower()
    if content_type == "image/jpg":
        content_type = "image/jpeg"
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("Formato não aceito. Use PDF, JPG ou PNG.")

    ext = os.path.splitext(file_name)[1].lower().strip(".") or (
        "pdf" if content_type == "application/pdf" else "bin"
    )

    cfg = _resolve_s3_runtime_config(db)
    purpose = _bucket_purpose_for_content_type(content_type)
    bucket = s3_bucket_for(cfg, purpose)  # type: ignore[arg-type]
    if not bucket:
        raise RuntimeError(
            f"AWS S3 ({purpose}) não configurado (bucket_{purpose} ou credencial aws-s3)."
        )

    region = cfg.region or "us-east-1"
    endpoint_url = cfg.endpoint_url
    prefix = _attachments_prefix()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    key = (
        f"{prefix.strip('/')}/t{tenant_id}/c{client_id}/ctr{contract_id}/"
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
                "client_id": str(client_id),
                "contract_id": str(contract_id),
                "source_name": s3_metadata_ascii(file_name),
            },
            **({"ACL": acl} if acl else {}),
        }
    )

    public_base = cfg.public_base_url or os.getenv("AWS_S3_PUBLIC_BASE_URL", "").strip()
    if public_base:
        public_url = f"{public_base.rstrip('/')}/{key}"
    else:
        public_url = _build_public_url(bucket, region, endpoint_url, key)

    return ContractAttachmentUploadResult(
        s3_key=key,
        public_url=public_url,
        content_type=content_type,
        size_bytes=len(file_bytes),
        file_name=file_name,
    )


def delete_client_contract_attachment_if_exists(
    s3_key: str | None,
    *,
    content_type: str | None = None,
    db: Session | None = None,
) -> None:
    if not s3_key:
        return
    cfg = _resolve_s3_runtime_config(db)
    purpose = _bucket_purpose_for_content_type((content_type or "").lower())
    bucket = s3_bucket_for(cfg, purpose)  # type: ignore[arg-type]
    if not bucket:
        # tenta o outro bucket se o tipo for desconhecido
        bucket = s3_bucket_for(cfg, "manuais") or s3_bucket_for(cfg, "imagens")
    if not bucket:
        return
    client = _s3_client_from_config(cfg)
    try:
        client.delete_object(Bucket=bucket, Key=s3_key)
    except ClientError:
        # fallback: tenta no outro bucket
        alt = "imagens" if purpose == "manuais" else "manuais"
        alt_bucket = s3_bucket_for(cfg, alt)  # type: ignore[arg-type]
        if alt_bucket and alt_bucket != bucket:
            try:
                client.delete_object(Bucket=alt_bucket, Key=s3_key)
            except ClientError:
                return
        return
