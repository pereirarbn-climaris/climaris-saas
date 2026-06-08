from __future__ import annotations

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.budget_pdf_common import (
    address_lines,
    budget_code,
    client_full_address,
    collect_budget_rows,
    date_fmt,
    money,
    draw_icon_label,
    draw_items_section,
    draw_legal_footer,
    draw_signatures,
    make_service_desc_style,
    mask_phone,
    mask_tax_document,
    parse_brand_color,
    register_pdf_fonts,
    safe,
    tenant_full_address,
    tint_with_white,
    try_read_logo,
)
from app.budget_pdf_config import TemplateConfig
from models import Budget, Tenant


def build_classic_budget_pdf(
    budget: Budget,
    tenant: Tenant,
    config: TemplateConfig,
    logo_url: str | None = None,
) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    font, font_bold = register_pdf_fonts()
    desc_style = make_service_desc_style(font)

    margin_x = 15 * mm
    content_width = width - (2 * margin_x)
    brand_blue = parse_brand_color(config.brand_color)
    light_blue = tint_with_white(brand_blue, 0.2)
    table_col_widths = [98 * mm, 16 * mm, 27 * mm, 13 * mm, 26 * mm]

    top_y = height - 14 * mm
    card_h = 30 * mm
    c.setFillColor(colors.white)
    c.roundRect(margin_x, top_y - card_h, content_width, card_h, 2.5 * mm, stroke=0, fill=1)

    logo_x = margin_x + 3.5 * mm
    logo_y = top_y - 14.5 * mm
    logo_reader = try_read_logo(logo_url or getattr(tenant, "logo_url", None))
    if logo_reader is not None:
        c.drawImage(logo_reader, logo_x, logo_y - 11.5 * mm, 23 * mm, 23 * mm, preserveAspectRatio=True, mask="auto")
    else:
        c.setFillColor(brand_blue)
        c.circle(logo_x + 11.5 * mm, logo_y, 11.5 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont(font_bold, 9.2)
        initials = "".join(part[:1].upper() for part in tenant.name.split()[:2]) or "CL"
        c.drawCentredString(logo_x + 11.5 * mm, logo_y - 3, initials)

    col2_x = margin_x + 31.5 * mm
    tenant_name = safe(tenant.name)
    c.setFillColor(colors.black)
    c.setFont(font_bold, 10.2)
    c.drawString(col2_x, top_y - 8.2 * mm, tenant_name[:52])
    c.setFont(font, 7.2)
    c.drawString(col2_x, top_y - 16.8 * mm, f"CNPJ: {mask_tax_document(tenant.cnpj)}")
    addr_lines = address_lines(tenant_full_address(tenant))
    c.drawString(col2_x, top_y - 21 * mm, addr_lines[0][:56])
    if len(addr_lines) > 1:
        c.drawString(col2_x, top_y - 24.6 * mm, addr_lines[1][:56])

    col3_x = margin_x + 110 * mm
    draw_icon_label(c, col3_x, top_y - 10.5 * mm, "☎", "Telefone", mask_phone(getattr(tenant, "phone", None)), font, font_bold)
    draw_icon_label(c, col3_x, top_y - 14.9 * mm, "✉", "E-mail", safe(getattr(tenant, "email", None)), font, font_bold)
    draw_icon_label(c, col3_x, top_y - 19.3 * mm, "⌂", "Site", safe(getattr(tenant, "website", None)), font, font_bold)

    c.setFillColor(colors.black)
    c.setFont(font_bold, 7.4)
    c.drawRightString(width - margin_x - 2 * mm, top_y - 8.2 * mm, "Data do orçamento")
    c.setFont(font, 8)
    c.drawRightString(width - margin_x - 2 * mm, top_y - 12.8 * mm, date_fmt(budget.created_at))

    title_y = top_y - card_h - 8 * mm
    c.setFillColor(brand_blue)
    c.rect(margin_x, title_y, content_width, 6 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont(font_bold, 11.6)
    c.drawString(margin_x + 3 * mm, title_y + 1.15 * mm, f"Orçamento {budget_code(budget)}")

    y = title_y - 7 * mm
    c.setFillColor(colors.black)
    c.setFont(font_bold, 9.2)
    c.drawString(margin_x, y, "Cliente")
    c.setFont(font, 8)
    y -= 4.2 * mm
    c.drawString(margin_x, y, safe(budget.client.name))
    y -= 3.9 * mm
    c.drawString(margin_x, y, mask_tax_document(budget.client.document))
    draw_icon_label(
        c,
        margin_x + 98 * mm,
        y - 0.4 * mm,
        "☎",
        "Telefone",
        mask_phone(budget.client.whatsapp or budget.client.phone),
        font,
        font_bold,
    )
    y -= 3.9 * mm
    client_address_lines = address_lines(client_full_address(budget), max_chars=54)
    c.drawString(margin_x, y, client_address_lines[0][:58])
    draw_icon_label(c, margin_x + 98 * mm, y - 0.4 * mm, "✉", "E-mail", safe(budget.client.email), font, font_bold)
    y -= 3.9 * mm
    if len(client_address_lines) > 1:
        c.drawString(margin_x, y, client_address_lines[1][:58])
    y -= 6 * mm

    service_rows, product_rows, total = collect_budget_rows(budget, desc_style)
    section_y = y
    if service_rows:
        section_y = draw_items_section(
            c,
            title="Serviços",
            rows=service_rows,
            y_top=section_y,
            margin_x=margin_x,
            content_width=content_width,
            height=height,
            brand_blue=brand_blue,
            light_blue=light_blue,
            font=font,
            font_bold=font_bold,
            table_col_widths=table_col_widths,
        )
    if product_rows:
        section_y = draw_items_section(
            c,
            title="Produtos",
            rows=product_rows,
            y_top=section_y,
            margin_x=margin_x,
            content_width=content_width,
            height=height,
            brand_blue=brand_blue,
            light_blue=light_blue,
            font=font,
            font_bold=font_bold,
            table_col_widths=table_col_widths,
        )

    if service_rows or product_rows:
        total_y = section_y
        c.setFillColor(brand_blue)
        total_w = 62 * mm
        total_x = margin_x + content_width - total_w
        c.rect(total_x, total_y, total_w, 5.8 * mm, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont(font_bold, 8.6)
        c.drawString(total_x + 2.4 * mm, total_y + 1.7 * mm, "Total")
        c.drawRightString(total_x + total_w - 2.2 * mm, total_y + 1.7 * mm, money(total))
        section_y = total_y - 8 * mm

    legal_y = draw_legal_footer(
        c,
        y_start=section_y,
        margin_x=margin_x,
        content_width=content_width,
        font=font,
        font_bold=font_bold,
        brand_blue=brand_blue,
        warranty=config.warranty_text,
        payment=config.payment_terms_text,
        technical=config.technical_notes_text,
        validity_days=int(budget.validity_days or 0),
        payment_method=budget.payment_method,
    )
    sign_y = max(22 * mm, legal_y - 6 * mm)
    draw_signatures(c, width=width, margin_x=margin_x, sign_y=sign_y, tenant=tenant, budget=budget, font=font)
    c.drawRightString(width - margin_x, 8 * mm, "Página 1/1")

    c.showPage()
    c.save()
    return buffer.getvalue()
