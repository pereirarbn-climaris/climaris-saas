"""Upload de arquivos do PMOC (ART, análises de ar) para S3."""

from __future__ import annotations

import mimetypes
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from botocore.exceptions import ClientError
from sqlalchemy.orm import Session

from app.tenant_logo import _build_public_url, _optional_acl, _resolve_s3_runtime_config, _s3_client_from_config

MAX_PMOC_FILE_BYTES = 25 * 1024 * 1024


@dataclass
class PmocFileUploadResult:
    s3_key: str
    public_url: str
    content_type: str
    size_bytes: int
    file_name: str


def _prefix() -> str:
    raw = os.getenv("AWS_S3_PMOC_PREFIX", "pmoc-files").strip()
    return raw or "pmoc-files"


def upload_pmoc_file(
    *,
    tenant_id: int,
    pmoc_id: int,
    subfolder: str,
    file_bytes: bytes,
    source_filename: str | None,
    source_content_type: str | None,
    db: Session | None = None,
) -> PmocFileUploadResult:
    if not file_bytes:
        raise ValueError("Arquivo vazio.")
    if len(file_bytes) > MAX_PMOC_FILE_BYTES:
        raise ValueError("Arquivo muito grande (máx. 25MB).")

    file_name = (source_filename or "arquivo").strip()[:180] or "arquivo"
    guessed, _ = mimetypes.guess_type(file_name)
    content_type = (source_content_type or guessed or "application/octet-stream").strip()
    ext = os.path.splitext(file_name)[1].lower().strip(".")
    if not ext:
        ext = mimetypes.guess_extension(content_type) or "bin"
        if ext.startswith("."):
            ext = ext[1:]

    cfg = _resolve_s3_runtime_config(db)
    bucket = cfg.bucket
    if not bucket:
        raise RuntimeError("AWS_S3_BUCKET não configurado (env ou credencial SaaS aws-s3).")

    region = cfg.region or "us-east-1"
    endpoint_url = cfg.endpoint_url
    base = _prefix()
    sf = subfolder.strip("/") or "misc"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    key = f"{base.strip('/')}/t{tenant_id}/pmoc{pmoc_id}/{sf}/{timestamp}-{uuid4().hex[:10]}.{ext}"

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
                "pmoc_id": str(pmoc_id),
                "source_name": file_name[:120],
            },
            **({"ACL": acl} if acl else {}),
        }
    )

    public_base = cfg.public_base_url or os.getenv("AWS_S3_PUBLIC_BASE_URL", "").strip()
    if public_base:
        public_url = f"{public_base.rstrip('/')}/{key}"
    else:
        public_url = _build_public_url(bucket, region, endpoint_url, key)

    return PmocFileUploadResult(
        s3_key=key,
        public_url=public_url,
        content_type=content_type,
        size_bytes=len(file_bytes),
        file_name=file_name,
    )


def delete_pmoc_file_if_exists(s3_key: str | None, db: Session | None = None) -> None:
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
