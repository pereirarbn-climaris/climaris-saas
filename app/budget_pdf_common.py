from __future__ import annotations

from datetime import datetime
import re
from io import BytesIO
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


def register_pdf_fonts() -> tuple[str, str]:
    try:
        pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
        pdfmetrics.registerFont(TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
        return "DejaVu", "DejaVu-Bold"
    except Exception:
        return "Helvetica", "Helvetica-Bold"


def money(value: float | int) -> str:
    return f"R$ {float(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def date_fmt(value: datetime | None) -> str:
    if not value:
        return "-"
    return value.strftime("%d/%m/%Y")


def safe(value: str | None, fallback: str = "-") -> str:
    text = (value or "").strip()
    return text or fallback


def tenant_display_name(tenant: Tenant) -> str:
    """Nome fantasia quando cadastrado; senão razão social."""
    trade = safe(getattr(tenant, "trade_name", None), "")
    if trade and trade != "-":
        return trade
    return safe(tenant.name)


def budget_code(budget: Budget) -> str:
    year = (budget.created_at or datetime.utcnow()).year
    return f"{budget.id:03d}-{year}"


def parse_brand_color(raw: str | None, fallback: str = "#0B7FAF") -> colors.Color:
    return colors.HexColor(_normalize_pdf_hex(raw, fallback))


def parse_font_color(raw: str | None, fallback: str = "#000000") -> colors.Color:
    return colors.HexColor(_normalize_pdf_hex(raw, fallback))


def _normalize_pdf_hex(raw: str | None, fallback: str) -> str:
    color = str(raw or fallback).strip().upper()
    if not re.fullmatch(r"#[0-9A-F]{6}", color):
        color = fallback
    return color


def tint_with_white(color: colors.Color, factor: float = 0.5) -> colors.Color:
    f = max(0.0, min(1.0, factor))
    return colors.Color(
        red=color.red * f + (1 - f),
        green=color.green * f + (1 - f),
        blue=color.blue * f + (1 - f),
    )


def try_read_logo(logo_url: str | None) -> ImageReader | None:
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


def tenant_full_address(tenant: Tenant) -> str:
    parts = [
        getattr(tenant, "address_street", None),
        getattr(tenant, "address_number", None),
        getattr(tenant, "address_complement", None),
        getattr(tenant, "address_district", None),
        getattr(tenant, "address_city", None),
        getattr(tenant, "address_state", None),
        mask_cep(getattr(tenant, "address_postal_code", None)),
    ]
    filtered = [str(p).strip() for p in parts if p and str(p).strip()]
    return " - ".join(filtered) if filtered else "-"


def address_lines(address: str, max_chars: int = 52) -> list[str]:
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
    return lines[:3]


def mask_tax_document(raw: str | None) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return safe(raw)


def mask_phone(raw: str | None) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    if len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    return safe(raw)


def mask_cep(raw: str | None) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if len(digits) == 8:
        return f"{digits[:5]}-{digits[5:]}"
    return safe(raw)


def client_full_address(budget: Budget) -> str:
    client = budget.client
    parts = [
        getattr(client, "address_street", None),
        getattr(client, "address_number", None),
        getattr(client, "address_complement", None),
        getattr(client, "address_district", None),
        getattr(client, "address_city", None),
        getattr(client, "address_state", None),
        mask_cep(getattr(client, "address_postal_code", None)),
    ]
    filtered = [str(p).strip() for p in parts if p and str(p).strip()]
    return " - ".join(filtered) if filtered else "-"


def draw_icon_label(
    c: canvas.Canvas,
    x: float,
    y: float,
    icon: str,
    label: str,
    value: str,
    font: str,
    font_bold: str,
    *,
    text_color: colors.Color,
) -> None:
    c.setFillColor(text_color)
    c.setFont(font_bold, 9.2)
    c.drawString(x, y, icon)
    c.setFont(font, 7.8)
    c.drawString(x + 4.2 * mm, y, f"{label}: {value}")


def make_service_desc_style(font: str, *, text_color: colors.Color | None = None) -> ParagraphStyle:
    return ParagraphStyle(
        name="service_desc",
        fontName=font,
        fontSize=7.3,
        leading=9,
        textColor=text_color or colors.black,
    )


def escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def service_desc_cell(text: str, style: ParagraphStyle) -> Paragraph:
    parts = text.split("\n")
    title = escape_html(parts[0]) if parts else "-"
    details = "<br/>".join(escape_html(p) for p in parts[1:]) if len(parts) > 1 else ""
    safe_text = f"<b>{title}</b>" + (f"<br/>{details}" if details else "")
    return Paragraph(safe_text, style)


def draw_items_section(
    c: canvas.Canvas,
    *,
    title: str,
    rows: list[list[object]],
    y_top: float,
    margin_x: float,
    content_width: float,
    height: float,
    brand_blue: colors.Color,
    light_blue: colors.Color,
    font: str,
    font_bold: str,
    table_col_widths: list[float],
    text_color: colors.Color,
) -> float:
    chip_y = y_top - 2.7 * mm
    c.setFillColor(light_blue)
    c.rect(margin_x, chip_y, content_width, 5.2 * mm, fill=1, stroke=0)
    c.setFillColor(text_color)
    c.setFont(font_bold, 9.2)
    c.drawString(margin_x + 1.8 * mm, chip_y + 1.35 * mm, title)

    header = [["Descrição", "Unidade", "Preço unitário", "Qtd", "Preço"]]
    table = Table(header + rows, colWidths=table_col_widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), brand_blue),
                ("TEXTCOLOR", (0, 0), (-1, 0), text_color),
                ("TEXTCOLOR", (0, 1), (-1, -1), text_color),
                ("FONTNAME", (0, 0), (-1, 0), font_bold),
                ("FONTNAME", (0, 1), (-1, -1), font),
                ("FONTSIZE", (0, 0), (-1, 0), 7.7),
                ("FONTSIZE", (0, 1), (-1, -1), 7.3),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("GRID", (0, 0), (-1, -1), 0.25, brand_blue),
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


def draw_legal_footer(
    c: canvas.Canvas,
    *,
    y_start: float,
    margin_x: float,
    content_width: float,
    font: str,
    font_bold: str,
    brand_blue: colors.Color,
    text_color: colors.Color,
    warranty: str | None,
    payment: str | None,
    technical: str | None,
    validity_days: int,
    payment_method: str | None,
) -> float:
    blocks: list[tuple[str, str]] = []
    if warranty and warranty.strip():
        blocks.append(("Garantia", warranty.strip()))
    if payment and payment.strip():
        blocks.append(("Termos de pagamento", payment.strip()))
    if payment_method and payment_method.strip():
        blocks.append(("Forma de pagamento", payment_method.strip()))
    if technical and technical.strip():
        blocks.append(("Observações técnicas", technical.strip()))
    if validity_days > 0:
        blocks.append(("Validade", f"{validity_days} dia(s) a partir da data do orçamento."))
    if not blocks:
        return y_start

    y = y_start
    c.setFillColor(text_color)
    c.setFont(font_bold, 8.5)
    c.drawString(margin_x, y, "Condições comerciais")
    y -= 4 * mm
    c.setFillColor(text_color)
    c.setFont(font, 7.4)
    for label, body in blocks:
        c.setFont(font_bold, 7.4)
        c.drawString(margin_x, y, f"{label}:")
        y -= 3.2 * mm
        c.setFont(font, 7.2)
        for line in _wrap_text_lines(body, max_chars=95):
            c.drawString(margin_x + 2 * mm, y, line[:100])
            y -= 3.1 * mm
        y -= 1.5 * mm
    return y - 2 * mm


def _wrap_text_lines(text: str, max_chars: int = 90) -> list[str]:
    lines: list[str] = []
    for paragraph in text.splitlines():
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        words = paragraph.split()
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
    return lines or ["-"]


def draw_provider_signature_image(
    c: canvas.Canvas,
    *,
    left_x1: float,
    left_x2: float,
    sign_y: float,
    signature_url: str | None,
    max_height: float = 18 * mm,
) -> None:
    """Imagem da assinatura do prestador, centralizada sobre o nome do prestador."""
    reader = try_read_logo(signature_url)
    if reader is None:
        return
    line_w = left_x2 - left_x1
    center_x = (left_x1 + left_x2) / 2
    max_width = line_w * 0.92
    try:
        img_w_px, img_h_px = reader.getSize()
    except Exception:
        img_w_px, img_h_px = 420, 160
    if img_w_px <= 0 or img_h_px <= 0:
        return
    aspect = img_w_px / img_h_px
    draw_h = max_height
    draw_w = draw_h * aspect
    if draw_w > max_width:
        draw_w = max_width
        draw_h = draw_w / aspect
    img_x = center_x - draw_w / 2
    img_y = sign_y + 0.4 * mm
    try:
        c.drawImage(
            reader,
            img_x,
            img_y,
            width=draw_w,
            height=draw_h,
            preserveAspectRatio=True,
            mask="auto",
        )
    except Exception:
        return


def draw_signatures(
    c: canvas.Canvas,
    *,
    width: float,
    margin_x: float,
    sign_y: float,
    tenant: Tenant,
    budget: Budget,
    font: str,
    text_color: colors.Color,
    professional: bool = False,
    signature_url: str | None = None,
) -> None:
    c.setStrokeColor(colors.HexColor("#AABFCC"))
    left_x1 = margin_x + (8 * mm if professional else 10 * mm)
    left_x2 = margin_x + (72 * mm if professional else 75 * mm)
    right_x1 = width - margin_x - (72 * mm if professional else 75 * mm)
    right_x2 = width - margin_x - (8 * mm if professional else 10 * mm)
    draw_provider_signature_image(
        c,
        left_x1=left_x1,
        left_x2=left_x2,
        sign_y=sign_y,
        signature_url=signature_url,
    )
    c.line(left_x1, sign_y, left_x2, sign_y)
    c.line(right_x1, sign_y, right_x2, sign_y)
    c.setFillColor(text_color)
    c.setFont(font, 7.3)
    left_center = (left_x1 + left_x2) / 2
    right_center = (right_x1 + right_x2) / 2
    c.drawCentredString(left_center, sign_y - 4 * mm, tenant.name[:40])
    c.drawCentredString(left_center, sign_y - 7.7 * mm, "Prestador de serviços")
    c.drawCentredString(right_center, sign_y - 4 * mm, budget.client.name[:40])
    c.drawCentredString(right_center, sign_y - 7.7 * mm, f"Cliente — CNPJ/CPF: {mask_tax_document(budget.client.document)}")


def scope_bullets_from_budget_services(budget) -> list[str]:
    """Escopo técnico gerado a partir dos serviços do orçamento."""
    bullets: list[str] = []
    for item in getattr(budget, "service_items", []) or []:
        service = getattr(item, "service", None)
        if service is None:
            continue
        name = str(getattr(service, "name", "") or "").strip()
        if not name:
            continue
        desc = str(getattr(service, "description", "") or "").strip()
        if desc and desc.lower() not in name.lower():
            bullets.append(f"{name}: {desc}"[:320])
        else:
            bullets.append(name[:320])
    return bullets


def scope_bullet_lines(text: str | None, *, max_items: int = 14) -> list[str]:
    """Linhas de escopo a partir de texto livre (legado)."""
    if not text or not str(text).strip():
        return []
    out: list[str] = []
    for block in str(text).replace(";", "\n").splitlines():
        line = block.strip().lstrip("•").lstrip("-").lstrip("*").strip()
        if line:
            out.append(line[:320])
        if len(out) >= max_items:
            break
    return out


def collect_professional_budget_rows(
    budget: Budget,
    desc_style: ParagraphStyle,
) -> tuple[list[list[object]], list[list[object]], float, float, float]:
    """Linhas para tabelas do modelo profissional (Qtd | Un | Preço unit. | Subtotal)."""
    product_rows: list[list[object]] = []
    product_total = 0.0
    for item in budget.product_items:
        qty = max(int(item.quantity), 1)
        unit = float(item.unit_price)
        sub = unit * qty
        product_total += sub
        name = getattr(item.product, "name", f"Produto #{item.product_id}")
        product_rows.append(
            [
                service_desc_cell(name, desc_style),
                str(qty),
                "un.",
                money(unit),
                money(sub),
            ]
        )

    service_rows: list[list[object]] = []
    service_total = 0.0
    for item in budget.service_items:
        qty = max(int(item.quantity), 1)
        unit = float(item.unit_price)
        sub = unit * qty
        service_total += sub
        base_name = getattr(item.service, "name", f"Serviço #{item.service_id}")
        # Modelo 2: apenas o nome do serviço (sem descrição cadastrada).
        service_rows.append(
            [
                safe(base_name),
                str(qty),
                "un.",
                money(unit),
                money(sub),
            ]
        )

    return product_rows, service_rows, product_total, service_total, product_total + service_total


def professional_table_col_widths(content_width: float) -> list[float]:
    """Larguras proporcionais à área útil (mesma largura dos demais blocos)."""
    ratios = (0.50, 0.07, 0.08, 0.175, 0.175)
    return [content_width * r for r in ratios]


def draw_professional_detail_table(
    c: canvas.Canvas,
    *,
    section_title: str,
    header_label: str,
    rows: list[list[object]],
    y_top: float,
    margin_x: float,
    content_width: float,
    height: float,
    brand_blue: colors.Color,
    font: str,
    font_bold: str,
    text_color: colors.Color,
) -> float:
    """Tabela 5 colunas — largura total, cabeçalho branco, grades suaves."""
    grid_color = colors.HexColor("#e8eef5")
    header_rule = tint_with_white(brand_blue, 0.9)

    c.setFillColor(text_color)
    c.setFont(font_bold, 9.2)
    c.drawString(margin_x, y_top, section_title)
    gap_after_title = 1.6 * mm
    y_table_top = y_top - gap_after_title

    col_widths = professional_table_col_widths(content_width)
    header = [[header_label, "Qtd.", "Unidade", "Preço unitário", "Subtotal"]]
    table = Table(header + rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), brand_blue),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("TEXTCOLOR", (0, 1), (-1, -1), text_color),
                ("FONTNAME", (0, 0), (-1, 0), font_bold),
                ("FONTNAME", (0, 1), (-1, -1), font),
                ("FONTSIZE", (0, 0), (-1, 0), 7.4),
                ("FONTSIZE", (0, 1), (-1, -1), 7.0),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("GRID", (0, 0), (-1, -1), 0.25, grid_color),
                ("INNERGRID", (0, 0), (-1, 0), 0.25, grid_color),
                ("LINEBELOW", (0, 0), (-1, 0), 0.35, header_rule),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2.5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2.5),
                ("TOPPADDING", (0, 1), (-1, -1), 2.0),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 2.4),
            ]
        )
    )
    _, table_height = table.wrapOn(c, content_width, height)
    table_y = y_table_top - table_height
    if table_y < 40 * mm:
        table_y = max(40 * mm, y_table_top - table_height)
    table.drawOn(c, margin_x, table_y)
    return table_y


PROFESSIONAL_TOTALS_LIGHT = colors.Color(0.922, 0.973, 1.0)
PROFESSIONAL_TOTALS_LINE = colors.Color(0.796, 0.835, 0.882)


def _draw_professional_totals_rule(
    c: canvas.Canvas,
    *,
    margin_x: float,
    content_width: float,
    y: float,
) -> None:
    """Linha divisória suave abaixo de cada subtotal (referência Orcamento_Profissional.pdf)."""
    split_x = margin_x + content_width * 0.825
    c.setStrokeColor(PROFESSIONAL_TOTALS_LINE)
    c.setLineWidth(0.6)
    c.line(margin_x, y, split_x, y)
    c.line(split_x, y, margin_x + content_width, y)


def draw_professional_totals_block(
    c: canvas.Canvas,
    *,
    y_top: float,
    margin_x: float,
    content_width: float,
    font: str,
    font_bold: str,
    text_color: colors.Color,
    product_sub: float | None,
    service_sub: float | None,
    grand_total: float,
) -> float:
    """Totais no padrão Orcamento_Profissional.pdf — rótulo à esquerda, valor à direita, faixa no total."""
    value_pad_x = 3 * mm
    value_x = margin_x + content_width - value_pad_x
    subtotal_row_h = 7.4 * mm
    grand_row_h = 10.2 * mm
    y = y_top

    if product_sub is not None:
        y -= subtotal_row_h
        c.setFillColor(text_color)
        c.setFont(font, 10)
        c.drawString(margin_x, y + 2.4 * mm, "Subtotal Geral de Produtos/Materiais:")
        c.drawRightString(value_x, y + 2.4 * mm, money(product_sub))
        _draw_professional_totals_rule(c, margin_x=margin_x, content_width=content_width, y=y)

    if service_sub is not None:
        y -= subtotal_row_h
        c.setFillColor(text_color)
        c.setFont(font, 10)
        c.drawString(margin_x, y + 2.4 * mm, "Subtotal Geral de Serviços (Mão de Obra):")
        c.drawRightString(value_x, y + 2.4 * mm, money(service_sub))
        _draw_professional_totals_rule(c, margin_x=margin_x, content_width=content_width, y=y)

    y -= grand_row_h
    c.setFillColor(PROFESSIONAL_TOTALS_LIGHT)
    c.rect(margin_x, y, content_width, grand_row_h, stroke=0, fill=1)
    c.setStrokeColor(PROFESSIONAL_TOTALS_LINE)
    c.setLineWidth(0.6)
    c.line(margin_x, y + grand_row_h, margin_x + content_width, y + grand_row_h)

    c.setFillColor(text_color)
    c.setFont(font_bold, 12)
    text_y = y + 3.5 * mm
    c.drawString(margin_x, text_y, "VALOR TOTAL DO INVESTIMENTO:")
    c.drawRightString(value_x, text_y, money(grand_total))

    return y


def draw_professional_horizontal_rule(
    c: canvas.Canvas,
    *,
    margin_x: float,
    content_width: float,
    y: float,
    brand_blue: colors.Color,
) -> None:
    """Divisória abaixo do site/tagline (referência Orcamento_Profissional.pdf)."""
    c.setStrokeColor(tint_with_white(brand_blue, 0.72))
    c.setLineWidth(1.1)
    c.line(margin_x, y, margin_x + content_width, y)


def collect_budget_rows(
    budget: Budget,
    desc_style: ParagraphStyle,
) -> tuple[list[list[object]], list[list[object]], float]:
    total = 0.0
    service_rows: list[list[object]] = []
    for item in budget.service_items:
        row_total = float(item.unit_price) * max(item.quantity, 1)
        total += row_total
        base_name = getattr(item.service, "name", f"Serviço #{item.service_id}")
        desc = getattr(item.service, "description", None)
        full_desc = base_name if not desc else f"{base_name}\n- {str(desc).replace(chr(10), '\n- ')[:220]}"
        service_rows.append(
            [service_desc_cell(full_desc, desc_style), "UN", money(float(item.unit_price)), str(item.quantity), money(row_total)]
        )

    product_rows: list[list[object]] = []
    for item in budget.product_items:
        row_total = float(item.unit_price) * max(item.quantity, 1)
        total += row_total
        product_rows.append(
            [
                service_desc_cell(getattr(item.product, "name", f"Produto #{item.product_id}"), desc_style),
                "UN",
                money(float(item.unit_price)),
                str(item.quantity),
                money(row_total),
            ]
        )
    return service_rows, product_rows, total
