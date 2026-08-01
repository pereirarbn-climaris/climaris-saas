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
    draw_professional_totals_block,
    draw_provider_signature_image,
    make_service_desc_style,
    mask_phone,
    mask_tax_document,
    parse_brand_color,
    parse_font_color,
    register_pdf_fonts,
    safe,
    scope_bullet_lines,
    scope_bullets_from_budget_services,
    tenant_display_name,
    tenant_full_address,
)
from app.budget_pdf_config import TemplateConfig
from models import Budget, Tenant

PROFESSIONAL_SECTION_GAP = 6 * mm
PROFESSIONAL_BODY_INDENT = 2 * mm


def _client_address_single_line(budget: Budget) -> str:
    site = getattr(budget, "client_site", None)
    if site is not None:
        parts = [
            getattr(site, "street", None),
            getattr(site, "number", None),
            getattr(site, "neighborhood", None),
            getattr(site, "city", None),
            getattr(site, "state", None),
        ]
        filtered = [str(p).strip() for p in parts if p and str(p).strip()]
        if filtered:
            return ", ".join(filtered)

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
    text_color: colors.Color,
) -> float:
    """Uma coluna (cliente à esquerda ou prestador à direita)."""
    c.setFillColor(text_color)
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
    text_color: colors.Color,
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
        text_color=text_color,
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
        text_color=text_color,
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
    text_color: colors.Color,
    section_number: int,
) -> float:
    """Só é chamada quando há ao menos um item de escopo (ver build_professional_budget_pdf)."""
    y = _draw_professional_section_title(
        c,
        y=y,
        margin_x=margin_x,
        font_bold=font_bold,
        title=f"{section_number}. ESCOPO TÉCNICO DE MÃO DE OBRA E EXECUÇÃO",
        text_color=text_color,
    )
    body_x = margin_x + PROFESSIONAL_BODY_INDENT
    c.setFont(font, 7.3)
    for bullet in bullets:
        for line in _wrap_scope_line(bullet, max_chars=98):
            c.drawString(body_x, y, f"• {line}")
            y -= 3.1 * mm
        y -= 0.8 * mm
    return y


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


def _draw_professional_section_title(
    c: canvas.Canvas,
    *,
    y: float,
    margin_x: float,
    font_bold: str,
    title: str,
    text_color: colors.Color,
) -> float:
    """Título numerado alinhado às seções 1–3 e às tabelas (mesmo margin_x)."""
    c.setFillColor(text_color)
    c.setFont(font_bold, 9.2)
    c.drawString(margin_x, y, title)
    return y - 4.5 * mm


def _conditions_has_content(config: TemplateConfig, budget: Budget) -> bool:
    if int(budget.validity_days or 0) > 0:
        return True
    if config.warranty_text:
        return True
    if (config.payment_method_text or budget.payment_method or "").strip():
        return True
    if (config.payment_terms_text or "").strip():
        return True
    if (config.observations_text or "").strip():
        return True
    return False


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
    text_color: colors.Color,
    section_number: int,
) -> float:
    """Só é chamada quando há ao menos uma condição comercial (ver _conditions_has_content)."""
    y = _draw_professional_section_title(
        c,
        y=y,
        margin_x=margin_x,
        font_bold=font_bold,
        title=f"{section_number}. CONDIÇÕES E GARANTIAS COMERCIAIS",
        text_color=text_color,
    )
    body_x = margin_x + PROFESSIONAL_BODY_INDENT
    c.setFillColor(text_color)
    c.setFont(font, 7.5)
    validity = int(budget.validity_days or 0)
    if validity > 0:
        c.drawString(
            body_x,
            y,
            f"Validade da Proposta: {validity} dias a partir da data de emissão deste documento.",
        )
        y -= 3.4 * mm
    if config.warranty_text:
        c.drawString(body_x, y, f"Garantia Técnica: {config.warranty_text[:200]}")
        y -= 3.4 * mm
    payment_method = (config.payment_method_text or budget.payment_method or "").strip()
    if payment_method:
        c.drawString(body_x, y, f"Forma de Pagamento: {payment_method[:200]}")
        y -= 3.4 * mm
    payment_terms = (config.payment_terms_text or "").strip()
    if payment_terms:
        c.drawString(body_x, y, f"Condições de Pagamento: {payment_terms[:200]}")
        y -= 3.4 * mm
    observations = (config.observations_text or "").strip()
    if observations:
        c.drawString(body_x, y, f"Observações: {observations[:200]}")
        y -= 3.4 * mm
    return y


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
    text_color: colors.Color,
    signature_url: str | None = None,
) -> None:
    c.setFillColor(text_color)
    c.setFont(font_bold, 10)
    c.drawString(margin_x, height - 14 * mm, tenant_display_name(tenant)[:50])
    sign_y = 55 * mm
    c.setStrokeColor(colors.HexColor("#666666"))
    left_x1 = margin_x + 8 * mm
    left_x2 = margin_x + 82 * mm
    right_x1 = width - margin_x - 82 * mm
    right_x2 = width - margin_x - 8 * mm
    draw_provider_signature_image(
        c,
        left_x1=left_x1,
        left_x2=left_x2,
        sign_y=sign_y,
        signature_url=signature_url,
    )
    c.line(left_x1, sign_y, left_x2, sign_y)
    c.line(right_x1, sign_y, right_x2, sign_y)
    c.setFont(font, 8)
    c.drawCentredString((left_x1 + left_x2) / 2, sign_y - 5 * mm, f"{tenant_display_name(tenant)[:42]} — Técnico Responsável")
    c.drawCentredString((right_x1 + right_x2) / 2, sign_y - 5 * mm, f"{safe(budget.client.name)[:42]}")
    c.drawCentredString((right_x1 + right_x2) / 2, sign_y - 8.5 * mm, "De Acordo / Assinatura do Cliente")
    c.setFont(font, 7.2)
    c.drawRightString(width - margin_x, 8 * mm, f"Página {page_num} de {total_pages}")


def build_professional_budget_pdf(
    budget: Budget,
    tenant: Tenant,
    config: TemplateConfig,
    logo_url: str | None = None,  # noqa: ARG001 — modelo 2 sem logo no cabeçalho
    signature_url: str | None = None,
) -> bytes:
    """Modelo 2 — cabeçalho sem logo; cliente/prestador em duas colunas."""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    font, font_bold = register_pdf_fonts()
    margin_x = 15 * mm
    content_width = width - (2 * margin_x)
    brand_blue = parse_brand_color(config.brand_color)
    text_color = parse_font_color(config.font_color)
    desc_style = make_service_desc_style(font, text_color=text_color)

    top_y = height - 14 * mm
    company_name = tenant_display_name(tenant)

    c.setFillColor(text_color)
    c.setFont(font_bold, 21)
    c.drawString(margin_x, top_y - 8 * mm, company_name[:48])
    tagline = _tenant_tagline(tenant)
    if tagline:
        c.setFont(font, 7.4)
        c.drawString(margin_x, top_y - 14.5 * mm, tagline[:60])
        divider_y = top_y - 17.8 * mm
    else:
        divider_y = top_y - 16.5 * mm

    c.setFont(font_bold, 11)
    c.drawRightString(width - margin_x, top_y - 8 * mm, f"ORÇAMENTO nº {budget_code(budget)}")
    c.setFont(font, 8)
    c.drawRightString(width - margin_x, top_y - 13.5 * mm, f"Data de Emissão: {date_fmt(budget.created_at)}")

    draw_professional_horizontal_rule(
        c, margin_x=margin_x, content_width=content_width, y=divider_y, brand_blue=brand_blue
    )
    y = divider_y - PROFESSIONAL_SECTION_GAP

    client = budget.client
    client_lines: list[str] = []
    contact = getattr(client, "contact_person_name", None)
    if contact and str(contact).strip():
        client_lines.append(f"A/C: {str(contact).strip()}")
    site = getattr(budget, "client_site", None)
    if site is not None and str(getattr(site, "name", "") or "").strip():
        client_lines.append(f"Filial: {str(site.name).strip()}")
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
        provider_name=company_name,
        provider_lines=provider_lines,
        text_color=text_color,
    )

    # Seções numeradas (1, 2, 3, 4...) dinamicamente — seções sem conteúdo não aparecem no orçamento.
    section_number = 1
    manual_scope = scope_bullet_lines(config.scope_text)
    bullets = manual_scope if manual_scope else scope_bullets_from_budget_services(budget)
    if bullets:
        y -= PROFESSIONAL_SECTION_GAP
        y = _draw_scope_section(
            c,
            y=y,
            margin_x=margin_x,
            content_width=content_width,
            font=font,
            font_bold=font_bold,
            bullets=bullets,
            text_color=text_color,
            section_number=section_number,
        )
        section_number += 1

    product_rows, service_rows, product_sub, service_sub, grand_total = collect_professional_budget_rows(
        budget, desc_style
    )

    if product_rows:
        y -= PROFESSIONAL_SECTION_GAP
        y = draw_professional_detail_table(
            c,
            section_title=f"{section_number}. DETALHAMENTO DE PRODUTOS E MATERIAIS APLICADOS",
            header_label="DESCRIÇÃO DO PRODUTO / INSUMO TÉCNICO",
            rows=product_rows,
            y_top=y,
            margin_x=margin_x,
            content_width=content_width,
            height=height,
            brand_blue=brand_blue,
            font=font,
            font_bold=font_bold,
            text_color=text_color,
        )
        section_number += 1

    if service_rows:
        y -= PROFESSIONAL_SECTION_GAP
        y = draw_professional_detail_table(
            c,
            section_title=f"{section_number}. DETALHAMENTO DOS SERVIÇOS TÉCNICOS (MÃO DE OBRA)",
            header_label="DESCRIÇÃO DO SERVIÇO TÉCNICO EXECUTADO",
            rows=service_rows,
            y_top=y,
            margin_x=margin_x,
            content_width=content_width,
            height=height,
            brand_blue=brand_blue,
            font=font,
            font_bold=font_bold,
            text_color=text_color,
        )
        section_number += 1

    y -= 3 * mm
    y = draw_professional_totals_block(
        c,
        y_top=y,
        margin_x=margin_x,
        content_width=content_width,
        font=font,
        font_bold=font_bold,
        text_color=text_color,
        product_sub=product_sub if product_rows else None,
        service_sub=service_sub if service_rows else None,
        grand_total=grand_total,
    )

    if _conditions_has_content(config, budget):
        y -= PROFESSIONAL_SECTION_GAP
        y = _draw_conditions_section(
            c,
            y=y,
            margin_x=margin_x,
            font=font,
            font_bold=font_bold,
            brand_blue=brand_blue,
            config=config,
            budget=budget,
            text_color=text_color,
            section_number=section_number,
        )
        section_number += 1

    needs_signature_page = y < 42 * mm
    total_pages = 2 if needs_signature_page else 1
    c.setFillColor(text_color)
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
            text_color=text_color,
            signature_url=signature_url,
        )
    else:
        # Assinatura sempre fixa na parte de baixo da folha, independente do tamanho do conteúdo acima.
        sign_y = 28 * mm
        c.setStrokeColor(colors.HexColor("#666666"))
        left_x1 = margin_x + 8 * mm
        left_x2 = margin_x + 82 * mm
        right_x1 = width - margin_x - 82 * mm
        right_x2 = width - margin_x - 8 * mm
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
        c.setFont(font, 8)
        c.drawCentredString((left_x1 + left_x2) / 2, sign_y - 5 * mm, f"{company_name[:42]} — Técnico Responsável")
        c.drawCentredString((right_x1 + right_x2) / 2, sign_y - 5 * mm, f"{safe(budget.client.name)[:42]}")
        c.drawCentredString((right_x1 + right_x2) / 2, sign_y - 8.5 * mm, "De Acordo / Assinatura do Cliente")

    c.save()
    return buffer.getvalue()
