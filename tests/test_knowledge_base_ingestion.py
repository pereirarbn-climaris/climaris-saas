"""Testes da ingestão da Knowledge Base."""

from app.services.knowledge_base.metadata import ManualChunkContext, _extract_version
from app.services.knowledge_base.pdf_extract import ExtractedPage, chunk_pages
from models import EquipmentManual


def test_chunk_pages_tracks_page_origin():
    pages = [
        ExtractedPage(page_num=1, text="A" * 900),
        ExtractedPage(page_num=2, text="B" * 900),
    ]
    chunks = chunk_pages(pages)
    assert len(chunks) >= 2
    assert all(chunk.pagina_origem in (1, 2) for chunk in chunks)
    assert chunks[0].pagina_origem == 1


def test_extract_version_from_title():
    manual = EquipmentManual(tenant_id=1, title="Manual LG v2.1", s3_url="s3://x.pdf")
    assert _extract_version(manual=manual, catalog=None) == "2.1"


def test_manual_chunk_context_dataclass():
    ctx = ManualChunkContext(
        fabricante="LG",
        modelo="SPLIT 12K",
        tipo_documento="manual_principal",
        versao="1.0",
    )
    assert ctx.fabricante == "LG"
    assert ctx.tipo_documento == "manual_principal"
