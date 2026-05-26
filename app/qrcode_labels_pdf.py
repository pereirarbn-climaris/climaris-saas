"""PDF de cartelas QR para impressão (A4)."""

from __future__ import annotations

from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.pmoc_public_validation import generate_pmoc_validation_qr_png
from app.services.qrcode_labels import build_qrcode_public_url


def build_qrcode_labels_pdf(
    *,
    code_ids: list[str],
    title: str = "Etiquetas QR — Climaris",
    label_format: str = "a4_grid",
) -> bytes:
    if not code_ids:
        raise ValueError("Nenhum código para imprimir.")

    if label_format == "thermal_58":
        return _build_thermal_58_pdf(code_ids, title=title)

    buf = BytesIO()
    page_w, page_h = A4
    c = canvas.Canvas(buf, pagesize=A4)
    margin = 10 * mm
    cols = 3
    rows = 8
    header_h = 14 * mm
    grid_top = page_h - margin - header_h
    grid_bottom = margin
    grid_h = grid_top - grid_bottom
    cell_w = (page_w - 2 * margin) / cols
    cell_h = grid_h / rows
    pad = 3 * mm
    qr_size = min(cell_w - 2 * pad, cell_h - 12 * mm, 28 * mm)

    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, page_h - margin, title)
    c.setFont("Helvetica", 8)
    c.drawString(margin, page_h - margin - 5 * mm, f"Total: {len(code_ids)} etiqueta(s)")

    idx = 0
    while idx < len(code_ids):
        if idx > 0 and idx % (cols * rows) == 0:
            c.showPage()
            c.setFont("Helvetica-Bold", 11)
            c.drawString(margin, page_h - margin, title)

        pos = idx % (cols * rows)
        col = pos % cols
        row = pos // cols
        code_id = code_ids[idx]
        url = build_qrcode_public_url(code_id)
        png = generate_pmoc_validation_qr_png(url)
        x = margin + col * cell_w + (cell_w - qr_size) / 2
        y = grid_top - (row + 1) * cell_h + (cell_h - qr_size) / 2
        c.drawImage(ImageReader(BytesIO(png)), x, y, width=qr_size, height=qr_size, mask="auto")
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(x + qr_size / 2, y - 4 * mm, code_id)
        idx += 1

    c.save()
    return buf.getvalue()


def _build_thermal_58_pdf(code_ids: list[str], *, title: str) -> bytes:
    buf = BytesIO()
    width = 58 * mm
    height = 40 * mm
    margin = 2 * mm
    qr_size = 28 * mm
    c = canvas.Canvas(buf, pagesize=(width, height))
    for idx, code_id in enumerate(code_ids):
        if idx > 0:
            c.showPage()
        url = build_qrcode_public_url(code_id)
        png = generate_pmoc_validation_qr_png(url)
        qr_x = (width - qr_size) / 2
        qr_y = height - margin - qr_size - 6 * mm
        c.drawImage(ImageReader(BytesIO(png)), qr_x, qr_y, width=qr_size, height=qr_size, mask="auto")
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(width / 2, qr_y - 4 * mm, code_id)
    c.save()
    return buf.getvalue()
