"""Extração de PDF com PyMuPDF, OCR (Tesseract) para manuais escaneados e chunking com rastreio de página."""

from __future__ import annotations

import io
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

import fitz
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import (
    KB_CHUNK_OVERLAP,
    KB_CHUNK_SIZE,
    PDF_OCR_DPI_SCALE,
    PDF_OCR_ENABLED,
    PDF_OCR_LANG,
    PDF_OCR_MAX_PAGES,
    PDF_OCR_MAX_WORKERS,
    PDF_OCR_MIN_CHARS,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ExtractedPage:
    page_num: int
    text: str


@dataclass(frozen=True)
class TextChunk:
    content: str
    pagina_origem: int
    chunk_index: int


def _native_text_pages(doc: fitz.Document) -> list[ExtractedPage]:
    pages: list[ExtractedPage] = []
    for index in range(doc.page_count):
        text = (doc.load_page(index).get_text() or "").strip()
        if text:
            pages.append(ExtractedPage(page_num=index + 1, text=text))
    return pages


def _ocr_available() -> bool:
    try:
        import pytesseract  # noqa: F401
        from PIL import Image  # noqa: F401

        # Confirma binário do Tesseract (não só o pacote Python).
        pytesseract.get_tesseract_version()
        return True
    except Exception as exc:
        logger.warning("pdf_ocr_unavailable error=%r", exc)
        return False


def _ocr_single_page(
    pdf_bytes: bytes,
    page_index: int,
    *,
    dpi_scale: float,
    lang: str,
    min_chars: int,
) -> ExtractedPage | None:
    """Renderiza uma página e roda Tesseract. Abre o PDF por thread (fitz não é thread-safe)."""
    import pytesseract
    from PIL import Image

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = doc.load_page(page_index)
        pix = page.get_pixmap(matrix=fitz.Matrix(dpi_scale, dpi_scale), alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        text = (pytesseract.image_to_string(img, lang=lang) or "").strip()
        if len(text) < min_chars:
            return None
        return ExtractedPage(page_num=page_index + 1, text=text)
    finally:
        doc.close()


def _ocr_pdf_pages(pdf_bytes: bytes, page_count: int) -> list[ExtractedPage]:
    if not PDF_OCR_ENABLED:
        return []
    if not _ocr_available():
        return []

    limit = min(page_count, PDF_OCR_MAX_PAGES)
    workers = max(1, min(PDF_OCR_MAX_WORKERS, limit))
    logger.info(
        "pdf_ocr_start pages=%s limit=%s workers=%s dpi_scale=%s lang=%s",
        page_count,
        limit,
        workers,
        PDF_OCR_DPI_SCALE,
        PDF_OCR_LANG,
    )

    pages_by_num: dict[int, ExtractedPage] = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(
                _ocr_single_page,
                pdf_bytes,
                index,
                dpi_scale=PDF_OCR_DPI_SCALE,
                lang=PDF_OCR_LANG,
                min_chars=PDF_OCR_MIN_CHARS,
            ): index
            for index in range(limit)
        }
        for fut in as_completed(futures):
            index = futures[fut]
            try:
                result = fut.result()
            except Exception as exc:
                logger.warning("pdf_ocr_page_failed page=%s error=%r", index + 1, exc)
                continue
            if result is not None:
                pages_by_num[result.page_num] = result

    pages = [pages_by_num[n] for n in sorted(pages_by_num)]
    logger.info("pdf_ocr_done pages_with_text=%s/%s", len(pages), limit)
    return pages


def extract_pdf_pages(pdf_bytes: bytes) -> list[ExtractedPage]:
    """Extrai texto nativo; se o PDF for só imagem (escaneado), usa OCR via Tesseract.

    Retorna páginas com texto. Quando o OCR é usado, a primeira página pode incluir um
    marcador interno `[ocr]` no log — o texto em si permanece limpo para a IA.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page_count = doc.page_count
        pages = _native_text_pages(doc)
    finally:
        doc.close()

    if pages:
        return pages

    # Manual escaneado / só imagens — OCR.
    ocr_pages = _ocr_pdf_pages(pdf_bytes, page_count)
    if ocr_pages:
        # Prefixo leve na 1ª página ajuda a IA a saber que veio de OCR (pode ter erros tipográficos).
        first = ocr_pages[0]
        ocr_pages[0] = ExtractedPage(
            page_num=first.page_num,
            text=(
                "[Nota: texto obtido por OCR de PDF escaneado — pode conter erros de leitura.]\n\n"
                + first.text
            ),
        )
        return ocr_pages

    if not PDF_OCR_ENABLED:
        raise ValueError(
            "Não foi possível extrair texto do PDF (arquivo vazio ou apenas imagens). "
            "OCR está desabilitado (PDF_OCR_ENABLED=false)."
        )
    if not _ocr_available():
        raise ValueError(
            "Este PDF parece ser escaneado (apenas imagens) e o OCR não está disponível no servidor. "
            "Instale tesseract-ocr e tesseract-ocr-por, ou envie um PDF com texto selecionável."
        )
    raise ValueError(
        "Não foi possível extrair texto do PDF mesmo com OCR "
        "(arquivo vazio, ilegível ou sem conteúdo útil)."
    )


def _page_for_offset(page_starts: list[tuple[int, int]], offset: int) -> int:
    page_num = page_starts[0][1]
    for start, num in page_starts:
        if start <= offset:
            page_num = num
        else:
            break
    return page_num


def chunk_pages(pages: list[ExtractedPage]) -> list[TextChunk]:
    page_starts: list[tuple[int, int]] = []
    parts: list[str] = []
    offset = 0
    for page in pages:
        page_starts.append((offset, page.page_num))
        parts.append(page.text)
        offset += len(page.text) + 2

    full_text = "\n\n".join(parts)
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=KB_CHUNK_SIZE,
        chunk_overlap=KB_CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    raw_chunks = splitter.split_text(full_text)
    if not raw_chunks:
        raise ValueError("Nenhum trecho gerado a partir do manual.")

    result: list[TextChunk] = []
    search_from = 0
    for idx, content in enumerate(raw_chunks):
        pos = full_text.find(content, search_from)
        if pos < 0:
            pos = search_from
        result.append(
            TextChunk(
                content=content,
                pagina_origem=_page_for_offset(page_starts, pos),
                chunk_index=idx,
            )
        )
        search_from = max(search_from, pos + max(1, len(content) - KB_CHUNK_OVERLAP))
    return result
