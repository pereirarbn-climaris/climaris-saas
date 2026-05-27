"""Validação do upload de manual PDF (sem chamada real ao S3)."""

from __future__ import annotations

import asyncio
import io
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.s3 import (
    CHUNK_SIZE,
    MAX_MANUAL_PDF_BYTES,
    _ChunkQueueReader,
    _stream_manual_pdf_to_tempfile,
    _validate_manual_pdf,
    generate_manual_presigned_url,
    parse_s3_bucket_and_key_from_url,
    upload_manual_pdf,
)


def test_validate_manual_pdf_accepts_pdf_extension():
    file = MagicMock()
    file.filename = "manual-tecnico.pdf"
    file.content_type = "application/octet-stream"
    _validate_manual_pdf(file, b"%PDF-1.4 test")


def test_validate_manual_pdf_rejects_non_pdf():
    file = MagicMock()
    file.filename = "notas.txt"
    file.content_type = "text/plain"
    with pytest.raises(ValueError, match="PDF"):
        _validate_manual_pdf(file, b"hello")


def test_validate_manual_pdf_rejects_oversized():
    file = MagicMock()
    file.filename = "big.pdf"
    file.content_type = "application/pdf"
    with pytest.raises(ValueError, match="grande"):
        _validate_manual_pdf(file, b"x" * (MAX_MANUAL_PDF_BYTES + 1))


def test_chunk_queue_reader_streams_in_order():
    reader = _ChunkQueueReader()
    reader.feed(b"%PDF-1.")
    reader.feed(b"4 rest")
    reader.close_feed()
    assert reader.read(5) == b"%PDF-"
    assert reader.read() == b"1.4 rest"
    assert reader.read() == b""


def test_stream_manual_pdf_reads_in_chunks_not_single_read():
    """Garante leitura em blocos (não carrega 40MB de uma vez na RAM)."""
    payload = b"%PDF-1.4\n" + b"0" * (CHUNK_SIZE + 500)
    file = MagicMock()
    file.filename = "manual-grande.pdf"
    file.content_type = "application/pdf"
    file.seek = AsyncMock()

    chunk_calls: list[int] = []

    async def read(size: int = -1) -> bytes:
        chunk_calls.append(size)
        if not hasattr(read, "_buf"):
            read._buf = io.BytesIO(payload)  # type: ignore[attr-defined]
        return read._buf.read(size)  # type: ignore[attr-defined]

    file.read = read

    tmp_path, total, safe_name = asyncio.run(_stream_manual_pdf_to_tempfile(file))
    try:
        assert total == len(payload)
        assert safe_name.endswith(".pdf")
        assert tmp_path.read_bytes() == payload
        assert CHUNK_SIZE in chunk_calls
        assert len(chunk_calls) >= 2
    finally:
        tmp_path.unlink(missing_ok=True)


def test_upload_manual_pdf_pipelines_chunks_to_s3_thread():
    file = MagicMock()
    file.filename = "x.pdf"
    file.content_type = "application/pdf"
    file.seek = AsyncMock()
    payload = b"%PDF-1.4" + b"x" * (CHUNK_SIZE * 2)
    buf = io.BytesIO(payload)

    async def read(size: int = CHUNK_SIZE) -> bytes:
        return buf.read(size)

    file.read = read

    captured_reader: list[_ChunkQueueReader] = []

    def fake_upload(reader: _ChunkQueueReader, safe_name: str, *, db) -> str:
        captured_reader.append(reader)
        data = reader.read()
        while True:
            chunk = reader.read()
            if not chunk:
                break
            data += chunk
        assert data == payload
        return "https://cdn.example/manuais/x.pdf"

    with patch("app.services.s3._upload_reader_to_s3", side_effect=fake_upload):
        url = asyncio.run(upload_manual_pdf(file, db=None))

    assert url.endswith("x.pdf")
    assert len(captured_reader) == 1


def test_parse_s3_bucket_and_key_virtual_hosted():
    url = (
        "https://erp-manuais-prod-climaris.s3.amazonaws.com/"
        "manuais/20240516220049-806427c68e-Manual%20MV60.pdf"
    )
    bucket, key = parse_s3_bucket_and_key_from_url(url, db=None)
    assert bucket == "erp-manuais-prod-climaris"
    assert key == "manuais/20240516220049-806427c68e-Manual MV60.pdf"


def test_generate_manual_presigned_url():
    url = "https://erp-manuais-prod-climaris.s3.amazonaws.com/manuais/manual.pdf"
    fake_client = MagicMock()
    fake_client.generate_presigned_url.return_value = "https://signed.example/manual.pdf?X-Amz-Signature=abc"

    with patch("app.services.s3._resolve_s3_runtime_config") as mock_cfg, patch(
        "app.services.s3._s3_client_from_config", return_value=fake_client
    ):
        mock_cfg.return_value = MagicMock(
            access_key="AKIA",
            secret_key="secret",
            endpoint_url="",
            public_base_url="",
            bucket_manuais="erp-manuais-prod-climaris",
            bucket="",
        )
        signed = generate_manual_presigned_url(url, db=MagicMock())

    assert signed.startswith("https://signed.example/")
    fake_client.generate_presigned_url.assert_called_once()
    call_kwargs = fake_client.generate_presigned_url.call_args.kwargs
    assert call_kwargs["Params"]["Bucket"] == "erp-manuais-prod-climaris"
    assert call_kwargs["Params"]["Key"] == "manuais/manual.pdf"
