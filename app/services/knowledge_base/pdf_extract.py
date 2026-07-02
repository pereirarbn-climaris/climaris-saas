"""Extração de PDF com PyMuPDF e chunking com rastreio de página."""

from __future__ import annotations

from dataclasses import dataclass

import fitz
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import KB_CHUNK_OVERLAP, KB_CHUNK_SIZE


@dataclass(frozen=True)
class ExtractedPage:
    page_num: int
    text: str


@dataclass(frozen=True)
class TextChunk:
    content: str
    pagina_origem: int
    chunk_index: int


def extract_pdf_pages(pdf_bytes: bytes) -> list[ExtractedPage]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages: list[ExtractedPage] = []
    try:
        for index in range(doc.page_count):
            text = (doc.load_page(index).get_text() or "").strip()
            if text:
                pages.append(ExtractedPage(page_num=index + 1, text=text))
    finally:
        doc.close()
    if not pages:
        raise ValueError("Não foi possível extrair texto do PDF (arquivo vazio ou apenas imagens).")
    return pages


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
