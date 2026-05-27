from __future__ import annotations

import asyncio
import io
import os
import queue
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import uuid4

from boto3.s3.transfer import TransferConfig
from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.tenant_logo import (
    S3BucketPurpose,
    _build_public_url,
    _optional_acl,
    _resolve_s3_runtime_config,
    _s3_client_from_config,
    s3_bucket_for,
)

MANUALS_PREFIX = "manuais"
MAX_MANUAL_PDF_BYTES = 100 * 1024 * 1024
CHUNK_SIZE = 1024 * 1024  # 1 MiB por leitura
S3_UPLOAD_QUEUE_TIMEOUT_SEC = 600  # 10 min — uploads grandes em link lento
S3_TRANSFER_CONFIG = TransferConfig(
    multipart_threshold=8 * 1024 * 1024,
    multipart_chunksize=8 * 1024 * 1024,
    max_concurrency=4,
    use_threads=True,
)
PDF_CONTENT_TYPES = frozenset(
    {
        "application/pdf",
        "application/x-pdf",
        "application/acrobat",
        "application/vnd.pdf",
    }
)


def _safe_pdf_filename(filename: str | None) -> str:
    safe_name = (filename or "manual.pdf").strip().replace("/", "-").replace("\\", "-")[:120]
    if not safe_name.lower().endswith(".pdf"):
        safe_name = f"{safe_name}.pdf"
    return safe_name


def _validate_manual_pdf_metadata(file: UploadFile) -> None:
    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    is_pdf_name = filename.endswith(".pdf")
    is_pdf_type = content_type in PDF_CONTENT_TYPES or content_type == ""

    if not is_pdf_name and not is_pdf_type:
        raise ValueError("Envie um arquivo PDF (.pdf).")
    if content_type and content_type not in PDF_CONTENT_TYPES and not is_pdf_name:
        raise ValueError("Tipo de arquivo inválido. Envie um PDF.")


def _validate_manual_pdf_header(first_chunk: bytes) -> None:
    if not first_chunk.startswith(b"%PDF"):
        raise ValueError("O arquivo não parece ser um PDF válido.")


def _validate_manual_pdf_size(total_bytes: int) -> None:
    if total_bytes == 0:
        raise ValueError("Arquivo PDF vazio.")
    if total_bytes > MAX_MANUAL_PDF_BYTES:
        max_mb = MAX_MANUAL_PDF_BYTES // (1024 * 1024)
        raise ValueError(f"PDF muito grande (máximo {max_mb} MB).")


def _validate_manual_pdf(file: UploadFile, file_bytes: bytes) -> None:
    """Validação em memória (testes e compatibilidade)."""
    _validate_manual_pdf_metadata(file)
    _validate_manual_pdf_size(len(file_bytes))
    if file_bytes and not (file.filename or "").lower().endswith(".pdf"):
        _validate_manual_pdf_header(file_bytes[:8])


class _ChunkQueueReader(io.RawIOBase):
    """
    Interface file-like síncrona para boto3.upload_fileobj.
    Uma corrotina async alimenta chunks via feed(); o upload roda em thread separada.
  """

    def __init__(self) -> None:
        super().__init__()
        self._queue: queue.Queue[bytes | None] = queue.Queue(maxsize=16)
        self._pending = b""
        self._eof = False

    def feed(self, chunk: bytes) -> None:
        if chunk:
            self._queue.put(chunk)

    def close_feed(self) -> None:
        self._eof = True
        self._queue.put(None)

    def readable(self) -> bool:
        return True

    def read(self, size: int = -1) -> bytes:
        if size == 0:
            return b""
        target = CHUNK_SIZE if size < 0 else size
        out = b""
        while len(out) < target:
            if not self._pending:
                if self._eof and self._queue.empty():
                    break
                try:
                    item = self._queue.get(timeout=S3_UPLOAD_QUEUE_TIMEOUT_SEC)
                except queue.Empty as exc:
                    raise TimeoutError(
                        "Tempo esgotado aguardando dados do upload para o S3."
                    ) from exc
                if item is None:
                    self._eof = True
                    break
                self._pending = item
            if not self._pending:
                break
            take = min(target - len(out), len(self._pending))
            out += self._pending[:take]
            self._pending = self._pending[take:]
        return out


def _upload_reader_to_s3(
    body: io.RawIOBase,
    safe_name: str,
    *,
    db: Session | None,
) -> str:
    """Envia stream file-like ao S3 (multipart automático acima de 8 MB)."""
    cfg = _resolve_s3_runtime_config(db)
    bucket = (
        os.getenv("AWS_STORAGE_BUCKET_NAME", "").strip()
        or os.getenv("AWS_S3_BUCKET", "").strip()
        or s3_bucket_for(cfg, "manuais")
    )
    if not bucket:
        raise RuntimeError(
            "Bucket S3 (manuais) não configurado. Defina bucket_manuais em Operação → Chaves API "
            "ou AWS_S3_BUCKET_MANUAIS / AWS_STORAGE_BUCKET_NAME no .env."
        )

    region = cfg.region or os.getenv("AWS_S3_REGION", "us-east-1").strip() or "us-east-1"
    endpoint_url = cfg.endpoint_url
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    key = f"{MANUALS_PREFIX.strip('/')}/{timestamp}-{uuid4().hex[:10]}-{safe_name}"

    client = _s3_client_from_config(cfg)
    acl = _optional_acl()
    extra_args = {
        "ContentType": "application/pdf",
        "ContentDisposition": f'inline; filename="{safe_name}"',
        "CacheControl": "public, max-age=86400",
        "Metadata": {"source_name": safe_name[:120]},
    }
    if acl:
        extra_args["ACL"] = acl

    client.upload_fileobj(
        body,
        bucket,
        key,
        Config=S3_TRANSFER_CONFIG,
        ExtraArgs=extra_args,
    )

    public_base = cfg.public_base_url or os.getenv("AWS_S3_PUBLIC_BASE_URL", "").strip()
    if public_base:
        return f"{public_base.rstrip('/')}/{key}"
    return _build_public_url(bucket, region, endpoint_url, key)


async def _stream_manual_pdf_to_tempfile(file: UploadFile) -> tuple[Path, int, str]:
    """
    Fallback: grava em disco (testes). Produção usa pipeline direto para o S3.
    """
    await file.seek(0)
    _validate_manual_pdf_metadata(file)
    safe_name = _safe_pdf_filename(file.filename)

    fd, tmp_name = tempfile.mkstemp(suffix=".pdf", prefix="manual-upload-")
    os.close(fd)
    tmp_path = Path(tmp_name)
    total = 0
    first_chunk: bytes | None = None

    try:
        with tmp_path.open("wb") as out:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                if first_chunk is None:
                    first_chunk = chunk
                total += len(chunk)
                if total > MAX_MANUAL_PDF_BYTES:
                    max_mb = MAX_MANUAL_PDF_BYTES // (1024 * 1024)
                    raise ValueError(f"PDF muito grande (máximo {max_mb} MB).")
                out.write(chunk)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise

    _validate_manual_pdf_size(total)
    header = first_chunk or b""
    if not (file.filename or "").lower().endswith(".pdf"):
        _validate_manual_pdf_header(header[:8])

    return tmp_path, total, safe_name


async def upload_manual_pdf(file: UploadFile, *, db: Session | None = None) -> str:
    """
    Envia o manual para S3 em pipeline:
    - corrotina async lê UploadFile em chunks (await file.read);
    - thread em background consome o mesmo stream via upload_fileobj (multipart).
    Não bloqueia o event loop durante o envio ao S3 e não carrega o PDF inteiro na RAM.
    """
    await file.seek(0)
    _validate_manual_pdf_metadata(file)
    safe_name = _safe_pdf_filename(file.filename)

    reader = _ChunkQueueReader()
    upload_task = asyncio.create_task(
        asyncio.to_thread(_upload_reader_to_s3, reader, safe_name, db=db)
    )

    total = 0
    first_chunk: bytes | None = None
    try:
        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break
            if first_chunk is None:
                first_chunk = chunk
            total += len(chunk)
            if total > MAX_MANUAL_PDF_BYTES:
                max_mb = MAX_MANUAL_PDF_BYTES // (1024 * 1024)
                raise ValueError(f"PDF muito grande (máximo {max_mb} MB).")
            reader.feed(chunk)

        _validate_manual_pdf_size(total)
        if not (file.filename or "").lower().endswith(".pdf"):
            _validate_manual_pdf_header((first_chunk or b"")[:8])

        reader.close_feed()
        return await upload_task
    except Exception:
        reader.close_feed()
        if not upload_task.done():
            upload_task.cancel()
        try:
            await upload_task
        except (asyncio.CancelledError, Exception):
            pass
        raise


def parse_s3_bucket_and_key_from_url(
    url: str,
    *,
    db: Session | None = None,
    purpose: S3BucketPurpose = "manuais",
) -> tuple[str, str]:
    """Extrai bucket e object key de uma URL pública S3 (virtual-hosted, path-style ou base customizada)."""
    raw = (url or "").strip()
    if not raw:
        raise ValueError("URL S3 vazia.")

    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("URL S3 inválida.")

    path_key = unquote(parsed.path.lstrip("/"))
    if not path_key:
        raise ValueError("URL S3 sem object key.")

    cfg = _resolve_s3_runtime_config(db)
    host = parsed.netloc.lower()

    if ".s3." in host or host.endswith(".s3.amazonaws.com"):
        bucket = host.split(".s3", 1)[0]
        return bucket, path_key

    endpoint_url = (cfg.endpoint_url or os.getenv("AWS_S3_ENDPOINT_URL", "")).strip()
    if endpoint_url:
        endpoint_host = urlparse(endpoint_url.rstrip("/")).netloc.lower()
        if endpoint_host and endpoint_host == host:
            bucket, _, key = path_key.partition("/")
            if bucket and key:
                return bucket, key

    public_base = (cfg.public_base_url or os.getenv("AWS_S3_PUBLIC_BASE_URL", "")).strip()
    if public_base and raw.startswith(public_base.rstrip("/")):
        bucket = s3_bucket_for(cfg, purpose)
        if bucket:
            key = unquote(raw[len(public_base.rstrip("/")) :].lstrip("/"))
            if key:
                return bucket, key

    bucket = s3_bucket_for(cfg, purpose)
    if bucket:
        return bucket, path_key

    raise ValueError("Não foi possível resolver bucket/key da URL S3.")


def generate_manual_presigned_url(
    s3_url: str,
    *,
    db: Session | None = None,
    expires_seconds: int = 900,
) -> str:
    """Gera URL temporária para download de manual PDF em bucket privado."""
    bucket, key = parse_s3_bucket_and_key_from_url(s3_url, db=db, purpose="manuais")
    cfg = _resolve_s3_runtime_config(db)
    if not cfg.access_key or not cfg.secret_key:
        raise RuntimeError("Credenciais AWS S3 não configuradas para gerar link de download.")

    client = _s3_client_from_config(cfg)
    return client.generate_presigned_url(
        ClientMethod="get_object",
        Params={
            "Bucket": bucket,
            "Key": key,
            "ResponseContentDisposition": f'attachment; filename="{Path(key).name}"',
        },
        ExpiresIn=max(60, min(expires_seconds, 3600)),
    )
