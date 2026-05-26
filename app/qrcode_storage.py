"""Upload de etiquetas QR (PNG/PDF) para S3."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from uuid import uuid4

from botocore.exceptions import ClientError
from sqlalchemy.orm import Session

from app.config import public_app_base_url
from app.pmoc_public_validation import generate_pmoc_validation_qr_png
from app.tenant_logo import (
    _build_public_url,
    _optional_acl,
    _resolve_s3_runtime_config,
    _s3_client_from_config,
    s3_bucket_for,
)

MAX_QR_FILE_BYTES = 8 * 1024 * 1024


@dataclass
class QrLabelUploadResult:
    s3_key: str
    public_url: str
    content_type: str
    size_bytes: int


def _prefix() -> str:
    raw = os.getenv("AWS_S3_QRCODE_PREFIX", "qrcode-labels").strip()
    return raw or "qrcode-labels"


def build_equipment_tracking_url(public_token: str) -> str:
    return f"{public_app_base_url()}/p/e/{public_token.strip()}"


def s3_object_exists(s3_key: str | None, *, db: Session | None = None, purpose: str = "imagens") -> bool:
    if not s3_key or not str(s3_key).strip():
        return False
    cfg = _resolve_s3_runtime_config(db)
    bucket = s3_bucket_for(cfg, purpose)  # type: ignore[arg-type]
    if not bucket:
        return False
    client = _s3_client_from_config(cfg)
    try:
        client.head_object(Bucket=bucket, Key=s3_key.strip())
        return True
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey", "NotFound"):
            return False
        raise


def upload_qr_label_bytes(
    *,
    tenant_id: int,
    qrcode_id: int,
    file_bytes: bytes,
    extension: str,
    content_type: str,
    db: Session | None = None,
) -> QrLabelUploadResult:
    if not file_bytes:
        raise ValueError("Arquivo vazio.")
    if len(file_bytes) > MAX_QR_FILE_BYTES:
        raise ValueError("Arquivo muito grande (máx. 8MB).")

    ext = extension.lstrip(".").lower() or "bin"
    cfg = _resolve_s3_runtime_config(db)
    bucket = s3_bucket_for(cfg, "imagens")
    if not bucket:
        raise RuntimeError("AWS S3 (imagens) não configurado (bucket_imagens ou credencial aws-s3).")

    region = cfg.region or "us-east-1"
    endpoint_url = cfg.endpoint_url
    base = _prefix()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    key = f"{base.strip('/')}/t{tenant_id}/qr{qrcode_id}/{timestamp}-{uuid4().hex[:10]}.{ext}"

    client = _s3_client_from_config(cfg)
    acl = _optional_acl()
    client.put_object(
        **{
            "Bucket": bucket,
            "Key": key,
            "Body": file_bytes,
            "ContentType": content_type,
            "Metadata": {"tenant_id": str(tenant_id), "qrcode_id": str(qrcode_id)},
            **({"ACL": acl} if acl else {}),
        }
    )

    public_base = cfg.public_base_url or os.getenv("AWS_S3_PUBLIC_BASE_URL", "").strip()
    if public_base:
        public_url = f"{public_base.rstrip('/')}/{key}"
    else:
        public_url = _build_public_url(bucket, region, endpoint_url, key)

    return QrLabelUploadResult(
        s3_key=key,
        public_url=public_url,
        content_type=content_type,
        size_bytes=len(file_bytes),
    )


def generate_qr_label_pdf_png(public_token: str) -> tuple[bytes, bytes]:
    """Retorna (png_bytes, pdf_bytes) para a etiqueta do equipamento."""
    url = build_equipment_tracking_url(public_token)
    png = generate_pmoc_validation_qr_png(url)

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    page_w, page_h = A4
    c = canvas.Canvas(buf, pagesize=A4)
    img = ImageReader(BytesIO(png))
    size = 120
    x = (page_w - size) / 2
    y = page_h - 180
    c.drawImage(img, x, y, width=size, height=size, mask="auto")
    c.setFont("Helvetica", 10)
    c.drawCentredString(page_w / 2, y - 20, url[:90])
    c.showPage()
    c.save()
    return png, buf.getvalue()


def regenerate_qr_label_files(
    *,
    tenant_id: int,
    qrcode_id: int,
    public_token: str,
    db: Session,
) -> tuple[str, str, str]:
    """Gera PNG + PDF, envia ao S3 e retorna (image_s3_key, pdf_s3_key, tracking_url)."""
    png, pdf = generate_qr_label_pdf_png(public_token)
    img = upload_qr_label_bytes(
        tenant_id=tenant_id,
        qrcode_id=qrcode_id,
        file_bytes=png,
        extension="png",
        content_type="image/png",
        db=db,
    )
    doc = upload_qr_label_bytes(
        tenant_id=tenant_id,
        qrcode_id=qrcode_id,
        file_bytes=pdf,
        extension="pdf",
        content_type="application/pdf",
        db=db,
    )
    return img.s3_key, doc.s3_key, build_equipment_tracking_url(public_token)
