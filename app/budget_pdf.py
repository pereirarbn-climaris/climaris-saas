from __future__ import annotations

from io import BytesIO
from datetime import datetime
import re
from urllib.request import urlopen

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle

from models import Budget, Tenant


def _money(value: float | int) -> str:
    return f"R$ {float(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _date(value: datetime | None) -> str:
    if not value:
        return "-"
    return value.strftime("%d/%m/%Y")


def _safe(value: str | None, fallback: str = "-") -> str:
    text = (value or "").strip()
    return text or fallback


def _budget_code(budget: Budget) -> str:
    year = (budget.created_at or datetime.utcnow()).year
    return f"{budget.id:03d}-{year}"


def _tenant_brand_color(tenant: Tenant) -> colors.Color:
    raw = getattr(tenant, "pdf_primary_color", None) or "#0B7FAF"
    color = str(raw).strip().upper()
    if not re.fullmatch(r"#[0-9A-F]{6}", color):
        color = "#0B7FAF"
    return colors.HexColor(color)


def _tint_with_white(color: colors.Color, factor: float = 0.5) -> colors.Color:
    f = max(0.0, min(1.0, factor))
    return colors.Color(
        red=color.red * f + (1 - f),
        green=color.green * f + (1 - f),
        blue=color.blue * f + (1 - f),
    )


def _try_read_logo(logo_url: str | None) -> ImageReader | None:
    if not logo_url:
        return None
    try:
        with urlopen(logo_url, timeout=4) as response:
            blob = response.read()
        if not blob:
            return None
        return ImageReader(BytesIO(blob))
    except Exception:
        return None


def _draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, max_width: float, line_height: float) -> float:
    lines = c.beginText()
    lines.setTextOrigin(x, y)
    for block in text.splitlines() or [""]:
        current = ""
        for word in block.split(" "):
            candidate = word if not current else f"{current} {word}"
            if c.stringWidth(candidate) <= max_width:
                current = candidate
            else:
                if current:
                    lines.textLine(current)
                current = word
        lines.textLine(current)
    c.drawText(lines)
    return y - (len(text.splitlines()) + 1) * line_height


def _tenant_full_address(tenant: Tenant) -> str:
    parts = [
        getattr(tenant, "address_street", None),
        getattr(tenant, "address_number", None),
        getattr(tenant, "address_complement", None),
        getattr(tenant, "address_district", None),
        getattr(tenant, "address_city", None),
        getattr(tenant, "address_state", None),
        _mask_cep(getattr(tenant, "address_postal_code", None)),
    ]
    filtered = [str(p).strip() for p in parts if p and str(p).strip()]
    return " - ".join(filtered) if filtered else "-"


def _address_lines(address: str, max_chars: int = 52) -> list[str]:
    if not address or address == "-":
        return ["-"]
    words = address.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines[:2]


def _mask_tax_document(raw: str | None) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return _safe(raw)


def _mask_phone(raw: str | None) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    if len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    return _safe(raw)


def _mask_cep(raw: str | None) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if len(digits) == 8:
        return f"{digits[:5]}-{digits[5:]}"
    return _safe(raw)


def _client_full_address(budget: Budget) -> str:
    client = budget.client
    parts = [
        getattr(client, "address_street", None),
        getattr(client, "address_number", None),
        getattr(client, "address_complement", None),
        getattr(client, "address_district", None),
        getattr(client, "address_city", None),
        getattr(client, "address_state", None),
        _mask_cep(getattr(client, "address_postal_code", None)),
    ]
    filtered = [str(p).strip() for p in parts if p and str(p).strip()]
    return " - ".join(filtered) if filtered else "-"


def _draw_icon_label(c: canvas.Canvas, x: float, y: float, icon: str, label: str, value: str, font: str, font_bold: str) -> None:
    c.setFillColor(colors.black)
    c.setFont(font_bold, 9.2)
    c.drawString(x, y, icon)
    c.setFillColor(colors.black)
    c.setFont(font, 7.8)
    c.drawString(x + 4.2 * mm, y, f"{label}: {value}")


def build_budget_pdf(budget: Budget, tenant: Tenant, logo_url: str | None = None) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    try:
        pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
        pdfmetrics.registerFont(TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
        font = "DejaVu"
        font_bold = "DejaVu-Bold"
    except Exception:
        font = "Helvetica"
        font_bold = "Helvetica-Bold"

    service_desc_style = ParagraphStyle(
        name="service_desc",
        fontName=font,
        fontSize=7.3,
        leading=9,
    )

    def _escape_html(text: str) -> str:
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def service_desc_cell(text: str) -> Paragraph:
        # Wrap long descriptions and keep item name in bold.
        parts = text.split("\n")
        title = _escape_html(parts[0]) if parts else "-"
        details = "<br/>".join(_escape_html(p) for p in parts[1:]) if len(parts) > 1 else ""
        safe_text = f"<b>{title}</b>" + (f"<br/>{details}" if details else "")
        return Paragraph(safe_text, service_desc_style)

    margin_x = 15 * mm
    content_width = width - (2 * margin_x)
    brand_blue = _tenant_brand_color(tenant)
    light_blue = _tint_with_white(brand_blue, 0.2)
    border_col = colors.HexColor("#CADBE7")

    # Top company card (without outer border)
    top_y = height - 14 * mm
    card_h = 30 * mm
    c.setFillColor(colors.white)
    c.roundRect(margin_x, top_y - card_h, content_width, card_h, 2.5 * mm, stroke=0, fill=1)

    logo_x = margin_x + 3.5 * mm
    logo_y = top_y - 14.5 * mm
    logo_reader = _try_read_logo(logo_url or getattr(tenant, "logo_url", None))
    if logo_reader is not None:
        c.drawImage(logo_reader, logo_x, logo_y - 11.5 * mm, 23 * mm, 23 * mm, preserveAspectRatio=True, mask="auto")
    else:
        c.setFillColor(brand_blue)
        c.circle(logo_x + 11.5 * mm, logo_y, 11.5 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont(font_bold, 9.2)
        initials = "".join(part[:1].upper() for part in tenant.name.split()[:2]) or "CL"
        c.drawCentredString(logo_x + 11.5 * mm, logo_y - 3, initials)

    # 2nd division: company data (without labels)
    col2_x = margin_x + 31.5 * mm
    tenant_name = _safe(tenant.name)
    c.setFillColor(colors.black)
    c.setFont(font_bold, 10.2)
    c.drawString(col2_x, top_y - 8.2 * mm, tenant_name[:52])
    c.setFont(font, 8.1)
    c.drawString(col2_x, top_y - 12.5 * mm, tenant_name[:52])
    c.setFont(font, 7.2)
    c.drawString(col2_x, top_y - 16.8 * mm, f"CNPJ: {_mask_tax_document(tenant.cnpj)}")
    addr_lines = _address_lines(_tenant_full_address(tenant))
    c.drawString(col2_x, top_y - 21 * mm, addr_lines[0][:56])
    if len(addr_lines) > 1:
        c.drawString(col2_x, top_y - 24.6 * mm, addr_lines[1][:56])

    # 3rd division: contact
    col3_x = margin_x + 110 * mm
    _draw_icon_label(c, col3_x, top_y - 10.5 * mm, "☎", "Telefone", _mask_phone(getattr(tenant, "phone", None)), font, font_bold)
    _draw_icon_label(c, col3_x, top_y - 14.9 * mm, "✉", "E-mail", _safe(getattr(tenant, "email", None)), font, font_bold)
    _draw_icon_label(c, col3_x, top_y - 19.3 * mm, "⌂", "Site", _safe(getattr(tenant, "website", None)), font, font_bold)

    # 4th division: budget date
    c.setFillColor(colors.black)
    c.setFont(font_bold, 7.4)
    c.drawRightString(width - margin_x - 2 * mm, top_y - 8.2 * mm, "Data do orçamento")
    c.setFont(font, 8)
    c.drawRightString(width - margin_x - 2 * mm, top_y - 12.8 * mm, _date(budget.created_at))

    # Budget title bar
    title_y = top_y - card_h - 8 * mm
    c.setFillColor(brand_blue)
    c.rect(margin_x, title_y, content_width, 6 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont(font_bold, 11.6)
    c.drawString(margin_x + 3 * mm, title_y + 1.15 * mm, f"Orçamento {_budget_code(budget)}")

    # Client block
    y = title_y - 7 * mm
    c.setFillColor(colors.black)
    c.setFont(font_bold, 9.2)
    c.drawString(margin_x, y, "Cliente")
    c.setFont(font, 8)
    y -= 4.2 * mm
    c.drawString(margin_x, y, _safe(budget.client.name))
    y -= 3.9 * mm
    c.drawString(margin_x, y, _mask_tax_document(budget.client.document))
    _draw_icon_label(c, margin_x + 98 * mm, y - 0.4 * mm, "☎", "Telefone", _mask_phone(budget.client.whatsapp or budget.client.phone), font, font_bold)
    y -= 3.9 * mm
    client_address_lines = _address_lines(_client_full_address(budget), max_chars=54)
    c.drawString(margin_x, y, client_address_lines[0][:58])
    _draw_icon_label(c, margin_x + 98 * mm, y - 0.4 * mm, "✉", "E-mail", _safe(budget.client.email), font, font_bold)
    y -= 3.9 * mm
    if len(client_address_lines) > 1:
        c.drawString(margin_x, y, client_address_lines[1][:58])
    y -= 6 * mm

    total = 0.0
    table_col_widths = [98 * mm, 16 * mm, 27 * mm, 13 * mm, 26 * mm]

    def draw_items_section(title: str, rows: list[list[object]], y_top: float) -> float:
        # Highlight only the standalone section title with background color.
        chip_y = y_top - 2.7 * mm
        c.setFillColor(light_blue)
        c.rect(margin_x, chip_y, content_width, 5.2 * mm, fill=1, stroke=0)
        c.setFillColor(brand_blue)
        c.setFont(font_bold, 9.2)
        c.drawString(margin_x + 1.8 * mm, chip_y + 1.35 * mm, title)

        header = [["Descrição", "Unidade", "Preço unitário", "Qtd", "Preço"]]
        table = Table(header + rows, colWidths=table_col_widths, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.white),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#6B7280")),
                    ("FONTNAME", (0, 0), (-1, 0), font_bold),
                    ("FONTNAME", (0, 1), (-1, -1), font),
                    ("FONTSIZE", (0, 0), (-1, 0), 7.7),
                    ("FONTSIZE", (0, 1), (-1, -1), 7.3),
                    ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                    ("ALIGN", (0, 0), (0, -1), "LEFT"),
                    ("LINEBELOW", (0, 0), (-1, 0), 0, colors.white),
                    ("LINEABOVE", (0, 1), (-1, -1), 0.2, colors.HexColor("#E1ECF4")),
                    ("LINEBELOW", (0, 1), (-1, -1), 0.2, colors.HexColor("#E1ECF4")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 2.8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 2.8),
                    ("TOPPADDING", (0, 1), (-1, -1), 2.2),
                    ("BOTTOMPADDING", (0, 1), (-1, -1), 2.6),
                ]
            )
        )
        _, table_height = table.wrapOn(c, content_width, height)
        table_y = max(52 * mm, y_top - (table_height + 4.4 * mm))
        table.drawOn(c, margin_x, table_y)
        return table_y - 5 * mm

    service_rows: list[list[object]] = []
    for item in budget.service_items:
        row_total = float(item.unit_price) * max(item.quantity, 1)
        total += row_total
        base_name = getattr(item.service, "name", f"Serviço #{item.service_id}")
        desc = getattr(item.service, "description", None)
        full_desc = base_name if not desc else f"{base_name}\n- {str(desc).replace(chr(10), '\n- ')[:220]}"
        service_rows.append([service_desc_cell(full_desc), "UN", _money(float(item.unit_price)), str(item.quantity), _money(row_total)])

    product_rows: list[list[object]] = []
    for item in budget.product_items:
        row_total = float(item.unit_price) * max(item.quantity, 1)
        total += row_total
        product_rows.append(
            [service_desc_cell(getattr(item.product, "name", f"Produto #{item.product_id}")), "UN", _money(float(item.unit_price)), str(item.quantity), _money(row_total)]
        )

    section_y = y
    if service_rows:
        section_y = draw_items_section("Serviços", service_rows, section_y)
    if product_rows:
        section_y = draw_items_section("Produtos", product_rows, section_y)

    if service_rows or product_rows:
        # Total stripe aligned to section width
        total_y = section_y
        c.setFillColor(brand_blue)
        total_w = 62 * mm
        total_x = margin_x + content_width - total_w
        c.rect(total_x, total_y, total_w, 5.8 * mm, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont(font_bold, 8.6)
        c.drawString(total_x + 2.4 * mm, total_y + 1.7 * mm, "Total")
        c.drawRightString(total_x + total_w - 2.2 * mm, total_y + 1.7 * mm, _money(total))

    # Signatures / footer
    sign_y = 25 * mm
    c.setStrokeColor(colors.HexColor("#AABFCC"))
    c.line(margin_x + 10 * mm, sign_y, margin_x + 75 * mm, sign_y)
    c.line(width - margin_x - 75 * mm, sign_y, width - margin_x - 10 * mm, sign_y)
    c.setFillColor(colors.HexColor("#2F4656"))
    c.setFont(font, 7.3)
    c.drawCentredString(margin_x + 42.5 * mm, sign_y - 4 * mm, tenant.name[:40])
    c.drawCentredString(margin_x + 42.5 * mm, sign_y - 7.7 * mm, "Técnico Responsável")
    c.drawCentredString(width - margin_x - 42.5 * mm, sign_y - 4 * mm, budget.client.name[:40])
    c.drawCentredString(width - margin_x - 42.5 * mm, sign_y - 7.7 * mm, f"CNPJ/CPF: {_mask_tax_document(budget.client.document)}")
    c.drawRightString(width - margin_x, 8 * mm, "Página 1/1")

    c.showPage()
    c.save()
    return buffer.getvalue()
