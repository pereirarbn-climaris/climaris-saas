"""Validação de upload PDF PMOC (análises de ar)."""

from __future__ import annotations

import pytest

from app.pmoc_storage import validate_pmoc_pdf_upload


def test_validate_pmoc_pdf_upload_accepts_valid_pdf():
    validate_pmoc_pdf_upload("laudo.pdf", "application/pdf", b"%PDF-1.4\n")


def test_validate_pmoc_pdf_upload_rejects_non_pdf():
    with pytest.raises(ValueError, match="PDF"):
        validate_pmoc_pdf_upload("laudo.txt", "text/plain", b"hello")


def test_validate_pmoc_pdf_upload_rejects_corrupt_pdf():
    with pytest.raises(ValueError, match="inválido"):
        validate_pmoc_pdf_upload("laudo.pdf", "application/pdf", b"NOTPDF")
