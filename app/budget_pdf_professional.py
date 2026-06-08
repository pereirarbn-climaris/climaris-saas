from __future__ import annotations

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.budget_pdf_common import (
    address_lines,
    budget_code,
    collect_professional_budget_rows,
    date_fmt,
    draw_professional_detail_table,
    draw_professional_horizontal_rule,
    make_service_desc_style,
    mask_phone,
    mask_tax_document,
    money,
    parse_brand_color,
    register_pdf_fonts,
    safe,
    scope_bullet_lines,
    tenant_full_address,
)
from app.budget_pdf_config import TemplateConfig
from models import Budget, Tenant


def _client_address_single_line(budget: Budget) -> str:
    parts = [
        getattr(budget.client, "address_street", None),
        getattr(budget.client, "address_number", None),
        getattr(budget.client, "address_district", None),
        getattr(budget.client, "address_city", None),
        getattr(budget.client, "address_state", None),
    ]
    filtered = [str(p).strip() for p in parts if p and str(p).strip()]
    return ", ".join(filtered) if filtered else "-"


def _tenant_tagline(tenant: Tenant) -> str:
    site = safe(getattr(tenant, "website", None), "")
    if site and site != "-":
        return site.replace("https://", "").replace("http://", "").split("/")[0].upper()
    return ""


def _draw_party_column(
    c: canvas.Canvas,
    *,
    x: float,
    y_top: float,
    col_chars: int,
    font: str,
    font_bold: str,
    label: str,
    name: str,
    extra_lines: list[str],
) -> float:
    """Uma coluna (cliente à esquerda ou prestador à direita)."""
    c.setFillColor(colors.black)
    y = y_top
    c.setFont(font_bold, 8.2)
    c.drawString(x, y, label)
    y -= 3.8 * mm
    c.setFont(font_bold, 8.8)
    c.drawString(x, y, name[:col_chars])
    y -= 3.4 * mm
    c.setFont(font, 7.5)
    for line in extra_lines:
        if line.strip():
            c.drawString(x, y, line[:col_chars])
            y -= 3.2 * mm
    return y - 1.5 * mm


def _draw_parties_side_by_side(
    c: canvas.Canvas,
    *,
    y_top: float,
    margin_x: float,
    content_width: float,
    font: str,
    font_bold: str,
    client_name: str,
    client_lines: list[str],
    provider_name: str,
    provider_lines: list[str],
) -> float:
    """Cliente à esquerda, prestador à direita, mesma linha de títulos."""
    gap = 8 * mm
    col_width = (content_width - gap) / 2
    col_chars = max(28, int(col_width / (2.1 * mm)))
    left_x = margin_x
    right_x = margin_x + col_width + gap

    y_client = _draw_party_column(
        c,
        x=left_x,
        y_top=y_top,
        col_chars=col_chars,
        font=font,
        font_bold=font_bold,
        label="CLIENTE / CONTRATANTE",
        name=client_name,
        extra_lines=client_lines,
    )
    y_provider = _draw_party_column(
        c,
        x=right_x,
        y_top=y_top,
        col_chars=col_chars,
        font=font,
        font_bold=font_bold,
        label="PRESTADOR DOS SERVIÇOS",
        name=provider_name,
        extra_lines=provider_lines,
    )
    return min(y_client, y_provider)


def _draw_scope_section(
    c: canvas.Canvas,
    *,
    y: float,
    margin_x: float,
    content_width: float,
    font: str,
    font_bold: str,
    bullets: list[str],
) -> float:
    c.setFont(font_bold, 9.2)
    c.drawString(margin_x, y, "1. ESCOPO TÉCNICO DE MÃO DE OBRA E EXECUÇÃO")
    y -= 4.5 * mm
    if not bullets:
        c.setFont(font, 7.4)
        c.drawString(margin_x + 2 * mm, y, "—")
        return y - 5 * mm
    c.setFont(font, 7.3)
    for bullet in bullets:
        for line in _wrap_scope_line(bullet, max_chars=98):
            c.drawString(margin_x + 2 * mm, y, f"• {line}")
            y -= 3.1 * mm
        y -= 0.8 * mm
    return y - 2 * mm


def _wrap_scope_line(text: str, max_chars: int) -> list[str]:
    words = text.split()
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
    return lines or [text[:max_chars]]


def _draw_conditions_section(
    c: canvas.Canvas,
    *,
    y: float,
    margin_x: float,
    font: str,
    font_bold: str,
    brand_blue: colors.Color,
    config: TemplateConfig,
    budget: Budget,
) -> float:
    c.setFont(font_bold, 9.2)
    c.drawString(margin_x, y, "4. CONDIÇÕES E GARANTIAS COMERCIAIS")
    y -= 4.5 * mm
    c.setFont(font, 7.5)
    validity = int(budget.validity_days or 0)
    if validity > 0:
        c.drawString(
            margin_x,
            y,
            f"Validade da Proposta: {validity} dias a partir da data de emissão deste documento.",
        )
        y -= 3.4 * mm
    if config.warranty_text:
        c.drawString(margin_x, y, f"Garantia Técnica: {config.warranty_text[:200]}")
        y -= 3.4 * mm
    payment = config.payment_terms_text or ""
    if budget.payment_method:
        payment = f"{payment} ({budget.payment_method})" if payment else str(budget.payment_method)
    if payment:
        c.drawString(margin_x, y, f"Forma de Pagamento: {payment[:200]}")
        y -= 3.4 * mm
    return y - 2 * mm


def _draw_professional_signatures_page(
    c: canvas.Canvas,
    *,
    width: float,
    height: float,
    margin_x: float,
    tenant: Tenant,
    budget: Budget,
    font: str,
    font_bold: str,
    page_num: int,
    total_pages: int,
) -> None:
    c.setFillColor(colors.black)
    c.setFont(font_bold, 10)
    c.drawString(margin_x, height - 14 * mm, safe(tenant.name)[:50])
    sign_y = 55 * mm
    c.setStrokeColor(colors.HexColor("#666666"))
    left_x1 = margin_x + 8 * mm
    left_x2 = margin_x + 82 * mm
    right_x1 = width - margin_x - 82 * mm
    right_x2 = width - margin_x - 8 * mm
    c.line(left_x1, sign_y, left_x2, sign_y)
    c.line(right_x1, sign_y, right_x2, sign_y)
    c.setFont(font, 8)
    c.drawCentredString((left_x1 + left_x2) / 2, sign_y - 5 * mm, f"{safe(tenant.name)[:42]} — Técnico Responsável")
    c.drawCentredString((right_x1 + right_x2) / 2, sign_y - 5 * mm, f"{safe(budget.client.name)[:42]}")
    c.drawCentredString((right_x1 + right_x2) / 2, sign_y - 8.5 * mm, "De Acordo / Assinatura do Cliente")
    c.setFont(font, 7.2)
    c.drawRightString(width - margin_x, 8 * mm, f"Página {page_num} de {total_pages}")


def build_professional_budget_pdf(
    budget: Budget,
    tenant: Tenant,
    config: TemplateConfig,
    logo_url: str | None = None,  # noqa: ARG001 — modelo 2 sem logo no cabeçalho
) -> bytes:
    """Modelo 2 — cabeçalho sem logo; cliente/prestador em duas colunas."""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    font, font_bold = register_pdf_fonts()
    desc_style = make_service_desc_style(font)

    margin_x = 15 * mm
    content_width = width - (2 * margin_x)
    brand_blue = parse_brand_color(config.brand_color)

    top_y = height - 14 * mm

    c.setFillColor(colors.black)
    c.setFont(font_bold, 21)
    c.drawString(margin_x, top_y - 8 * mm, safe(tenant.name)[:48])
    tagline = _tenant_tagline(tenant)
    header_bottom = top_y - 14 * mm
    if tagline:
        c.setFont(font, 7.4)
        c.drawString(margin_x, top_y - 14.5 * mm, tagline[:60])
        header_bottom = top_y - 18 * mm

    c.setFont(font_bold, 11)
    c.drawRightString(width - margin_x, top_y - 8 * mm, f"ORÇAMENTO nº {budget_code(budget)}")
    c.setFont(font, 8)
    c.drawRightString(width - margin_x, top_y - 13.5 * mm, f"Data de Emissão: {date_fmt(budget.created_at)}")

    divider_y = header_bottom - 3 * mm
    draw_professional_horizontal_rule(
        c, margin_x=margin_x, content_width=content_width, y=divider_y, brand_blue=brand_blue
    )
    y = divider_y - 6 * mm

    client = budget.client
    client_lines: list[str] = []
    contact = getattr(client, "contact_person_name", None)
    if contact and str(contact).strip():
        client_lines.append(f"A/C: {str(contact).strip()}")
    client_lines.extend(
        [
            f"CNPJ: {mask_tax_document(client.document)}",
            _client_address_single_line(budget),
            f"Email: {safe(client.email)}",
            f"Tel: {mask_phone(client.whatsapp or client.phone)}",
        ]
    )
    provider_lines = [
        f"CNPJ: {mask_tax_document(tenant.cnpj)}",
        *address_lines(tenant_full_address(tenant), max_chars=48)[:2],
        f"Email: {safe(getattr(tenant, 'email', None))}",
        f"Tel: {mask_phone(getattr(tenant, 'phone', None))}",
    ]
    y = _draw_parties_side_by_side(
        c,
        y_top=y,
        margin_x=margin_x,
        content_width=content_width,
        font=font,
        font_bold=font_bold,
        client_name=safe(client.name),
        client_lines=client_lines,
        provider_name=safe(tenant.name),
        provider_lines=provider_lines,
    )

    scope_source = config.technical_notes_text or (budget.description or "")
    bullets = scope_bullet_lines(scope_source)
    y = _draw_scope_section(
        c, y=y, margin_x=margin_x, content_width=content_width, font=font, font_bold=font_bold, bullets=bullets
    )

    product_rows, service_rows, product_sub, service_sub, grand_total = collect_professional_budget_rows(
        budget, desc_style
    )

    if product_rows:
        y = draw_professional_detail_table(
            c,
            section_title="2. DETALHAMENTO DE PRODUTOS E MATERIAIS APLICADOS",
            header_label="DESCRIÇÃO DO PRODUTO / INSUMO TÉCNICO",
            rows=product_rows,
            y_top=y,
            margin_x=margin_x,
            content_width=content_width,
            height=height,
            brand_blue=brand_blue,
            font=font,
            font_bold=font_bold,
        )

    if service_rows:
        y = draw_professional_detail_table(
            c,
            section_title="3. DETALHAMENTO DOS SERVIÇOS TÉCNICOS (MÃO DE OBRA)",
            header_label="DESCRIÇÃO DO SERVIÇO TÉCNICO EXECUTADO",
            rows=service_rows,
            y_top=y,
            margin_x=margin_x,
            content_width=content_width,
            height=height,
            brand_blue=brand_blue,
            font=font,
            font_bold=font_bold,
        )

    c.setFont(font, 8)
    if product_rows:
        c.drawRightString(width - margin_x, y, f"Subtotal Geral de Produtos/Materiais: {money(product_sub)}")
        y -= 4 * mm
    if service_rows:
        c.drawRightString(width - margin_x, y, f"Subtotal Geral de Serviços (Mão de Obra): {money(service_sub)}")
        y -= 4.5 * mm

    c.setFillColor(brand_blue)
    c.setFont(font_bold, 9.5)
    c.drawRightString(width - margin_x, y, f"VALOR TOTAL DO INVESTIMENTO: {money(grand_total)}")
    y -= 7 * mm

    y = _draw_conditions_section(
        c,
        y=y,
        margin_x=margin_x,
        font=font,
        font_bold=font_bold,
        brand_blue=brand_blue,
        config=config,
        budget=budget,
    )

    needs_signature_page = y < 42 * mm
    total_pages = 2 if needs_signature_page else 1
    c.setFont(font, 7.2)
    c.drawRightString(width - margin_x, 8 * mm, f"Página 1 de {total_pages}")

    if needs_signature_page:
        c.showPage()
        _draw_professional_signatures_page(
            c,
            width=width,
            height=height,
            margin_x=margin_x,
            tenant=tenant,
            budget=budget,
            font=font,
            font_bold=font_bold,
            page_num=2,
            total_pages=total_pages,
        )
    else:
        sign_y = max(28 * mm, y - 12 * mm)
        c.setStrokeColor(colors.HexColor("#666666"))
        left_x1 = margin_x + 8 * mm
        left_x2 = margin_x + 82 * mm
        right_x1 = width - margin_x - 82 * mm
        right_x2 = width - margin_x - 8 * mm
        c.line(left_x1, sign_y, left_x2, sign_y)
        c.line(right_x1, sign_y, right_x2, sign_y)
        c.setFont(font, 8)
        c.drawCentredString((left_x1 + left_x2) / 2, sign_y - 5 * mm, f"{safe(tenant.name)[:42]} — Técnico Responsável")
        c.drawCentredString((right_x1 + right_x2) / 2, sign_y - 5 * mm, f"{safe(budget.client.name)[:42]}")
        c.drawCentredString((right_x1 + right_x2) / 2, sign_y - 8.5 * mm, "De Acordo / Assinatura do Cliente")

    c.save()
    return buffer.getvalue()
