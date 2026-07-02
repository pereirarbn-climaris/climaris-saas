"""PDF do termo de garantia de instalação — identidade visual alinhada ao laudo técnico."""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle
from sqlalchemy.orm import Session

from app.budget_pdf_common import (
    address_lines,
    draw_professional_horizontal_rule,
    mask_phone,
    mask_tax_document,
    parse_brand_color,
    register_pdf_fonts,
    safe,
    tenant_full_address,
    tint_with_white,
    try_read_logo,
)
from app.garantia_document import merge_garantia_document
from app.garantia_evidence import (
    GarantiaEvidencePhoto,
    format_metric_cell,
    has_startup_measurements,
    load_garantia_evidence_photos,
)
from app.service_order_laudo import parse_laudo_from_description
from app.service_order_laudo_pdf import (
    _decode_data_url_image,
    _draw_body_paragraph,
    _draw_parties_side_by_side,
    _draw_section_title,
    _technician_footer_label,
    _wrap_text,
)
from app.service_order_meta import parse_service_order_meta
from models import Client, ServiceOrder, Tenant

_PHOTOS_PER_ANNEX_PAGE = 4
_ANNEX_COLS = 2


def garantia_pdf_title(order_id: int) -> str:
    return f"Termo de Garantia OS n° {order_id:03d}"


def _client_address_lines_from_doc(doc: dict[str, Any]) -> list[str]:
    addr = safe(doc.get("cliente_endereco"), "")
    return address_lines(addr) if addr and addr != "—" else ["—"]


def _provider_lines_from_doc(doc: dict[str, Any], tenant: Tenant) -> list[str]:
    cnpj = doc.get("empresa_cnpj") or tenant.cnpj
    lines = [
        f"CNPJ/CPF: {mask_tax_document(cnpj)}",
        *address_lines(doc.get("empresa_endereco") or tenant_full_address(tenant), max_chars=46)[:2],
    ]
    phone = doc.get("empresa_telefone") or tenant.phone
    if phone:
        lines.append(f"Contato: {mask_phone(phone)}")
    email = doc.get("empresa_email") or tenant.email
    if email:
        lines.append(f"E-mail: {safe(email)[:46]}")
    return lines


def _has_photo_block(garantia: dict[str, Any], key: str) -> bool:
    block = garantia.get(key)
    return isinstance(block, dict) and bool(
        (block.get("storageKey") or block.get("storage_key") or block.get("publicUrl") or block.get("public_url"))
    )


def _draw_startup_table(
    c: canvas.Canvas,
    *,
    y: float,
    margin_x: float,
    content_width: float,
    height: float,
    doc: dict[str, Any],
    garantia: dict[str, Any],
    font: str,
    font_bold: str,
    brand_blue: colors.Color,
) -> float:
    if not has_startup_measurements(garantia, doc):
        return y

    rows = [
        ["Vácuo final", format_metric_cell(str(doc.get("vacuo_microns") or ""), _has_photo_block(garantia, "vacuoFoto"), "µ")],
        ["Pressão de trabalho", format_metric_cell(str(doc.get("pressao_psi") or ""), _has_photo_block(garantia, "pressaoFoto"), "PSI")],
        ["Tensão medida", format_metric_cell(str(doc.get("tensao_v") or ""), _has_photo_block(garantia, "tensaoFoto"), "V")],
        ["Corrente do compressor", format_metric_cell(str(doc.get("corrente_a") or ""), _has_photo_block(garantia, "correnteFoto"), "A")],
        ["Temp. insuflamento", format_metric_cell(str(doc.get("temp_insuflamento") or ""), _has_photo_block(garantia, "tempInsuflamentoFoto"), "°C")],
        ["Temp. retorno", format_metric_cell(str(doc.get("temp_retorno") or ""), _has_photo_block(garantia, "tempRetornoFoto"), "°C")],
    ]

    y = _draw_section_title(
        c,
        x=margin_x,
        y=y,
        title="STARTUP TÉCNICO — MEDIÇÕES NA ENTREGA",
        font_bold=font_bold,
        brand_blue=brand_blue,
    )
    grid_color = tint_with_white(brand_blue, 0.92)
    table = Table([["Parâmetro", "Valor registrado"], *rows], colWidths=[content_width * 0.58, content_width * 0.42])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), brand_blue),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                ("FONTNAME", (0, 0), (-1, 0), font_bold),
                ("FONTNAME", (0, 1), (-1, -1), font),
                ("FONTSIZE", (0, 0), (-1, -1), 7.4),
                ("GRID", (0, 0), (-1, -1), 0.3, grid_color),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    _, th = table.wrapOn(c, content_width, y)
    if y - th < 40 * mm:
        c.showPage()
        y = height - 18 * mm
    table.drawOn(c, margin_x, y - th)
    return y - th - 6 * mm


def _draw_garantia_photo_annex_pages(
    c: canvas.Canvas,
    *,
    photos: list[GarantiaEvidencePhoto],
    width: float,
    height: float,
    margin_x: float,
    content_width: float,
    font: str,
    font_bold: str,
    brand_blue: colors.Color,
) -> None:
    if not photos:
        return

    gap = 6 * mm
    cell_w = (content_width - gap) / _ANNEX_COLS
    img_h = 58 * mm
    caption_h = 10 * mm
    row_h = img_h + caption_h + 4 * mm

    for page_start in range(0, len(photos), _PHOTOS_PER_ANNEX_PAGE):
        c.showPage()
        y_top = height - 18 * mm
        c.setFillColor(colors.black)
        c.setFont(font_bold, 11)
        c.drawString(margin_x, y_top, "ANEXO — EVIDÊNCIAS DE STARTUP")
        c.setFont(font, 7.5)
        c.drawString(margin_x, y_top - 5 * mm, "Fotos das medições registradas na entrega do equipamento")
        draw_professional_horizontal_rule(
            c,
            margin_x=margin_x,
            content_width=content_width,
            y=y_top - 8 * mm,
            brand_blue=brand_blue,
        )
        grid_top = y_top - 12 * mm

        chunk = photos[page_start : page_start + _PHOTOS_PER_ANNEX_PAGE]
        for idx, photo in enumerate(chunk):
            row = idx // _ANNEX_COLS
            col = idx % _ANNEX_COLS
            px = margin_x + col * (cell_w + gap)
            py = grid_top - row * row_h - img_h
            try:
                img = ImageReader(BytesIO(photo.image_bytes))
                c.drawImage(img, px, py, width=cell_w, height=img_h, preserveAspectRatio=True, anchor="sw", mask="auto")
            except Exception:
                pass
            c.setFont(font, 7.2)
            c.setFillColor(colors.black)
            for line_i, line in enumerate(_wrap_text(photo.caption, max_chars=44)[:2]):
                c.drawString(px, py - 4 * mm - line_i * 3.2 * mm, line)


def _draw_garantia_signatures(
    c: canvas.Canvas,
    *,
    width: float,
    margin_x: float,
    tenant: Tenant,
    order: ServiceOrder,
    doc: dict[str, Any],
    font: str,
) -> None:
    sig_blob = _decode_data_url_image(
        doc.get("client_signature_base64") if isinstance(doc.get("client_signature_base64"), str) else None
    )
    sig_name = safe(doc.get("client_signature_name"), "Cliente")
    place = safe(doc.get("assinatura_local"), safe(getattr(tenant, "address_city", None), "Local"))
    issued = safe(doc.get("assinatura_data_br"), datetime.now().strftime("%d/%m/%Y"))
    c.setFont(font, 7.5)
    c.drawString(margin_x, 38 * mm, f"{place}, {issued}")

    sign_y = 28 * mm
    c.setStrokeColor(colors.HexColor("#666666"))
    left_x1 = margin_x + 4 * mm
    left_x2 = margin_x + 78 * mm
    right_x1 = width - margin_x - 78 * mm
    right_x2 = width - margin_x - 4 * mm
    c.line(left_x1, sign_y, left_x2, sign_y)
    c.line(right_x1, sign_y, right_x2, sign_y)

    if sig_blob:
        try:
            img = ImageReader(BytesIO(sig_blob))
            c.drawImage(img, right_x1, sign_y + 2 * mm, width=38 * mm, height=14 * mm, preserveAspectRatio=True, mask="auto")
        except Exception:
            pass

    technician_name = safe(doc.get("tecnico_nome") or order.assigned_technician_name or tenant.name)
    technician_label = _technician_footer_label(tenant=tenant, technician_name=technician_name)

    c.setFont(font, 7.8)
    c.drawCentredString((left_x1 + left_x2) / 2, sign_y - 4.5 * mm, technician_label[:95])
    c.drawCentredString((right_x1 + right_x2) / 2, sign_y - 4.5 * mm, sig_name[:42])
    c.drawCentredString((right_x1 + right_x2) / 2, sign_y - 7.5 * mm, "De acordo / Assinatura do cliente")


def build_service_order_garantia_pdf(
    *,
    order: ServiceOrder,
    client: Client | None,
    tenant: Tenant,
    garantia: dict[str, Any],
    settings: dict[str, Any],
    db: Session | None = None,
) -> bytes:
    laudo_meta = parse_laudo_from_description(order.description)
    doc = merge_garantia_document(
        garantia,
        settings,
        tenant=tenant,
        client=client,
        laudo_meta=laudo_meta,
    )

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    doc_title = garantia_pdf_title(order.id)
    c.setTitle(doc_title)
    width, height = A4
    font, font_bold = register_pdf_fonts()
    margin_x = 15 * mm
    content_width = width - 2 * margin_x
    brand_blue = parse_brand_color(getattr(tenant, "pdf_primary_color", None))

    logo = try_read_logo(getattr(tenant, "logo_url", None))
    top_y = height - 14 * mm
    logo_w = 0.0
    if logo:
        logo_h = 14 * mm
        logo_w = 22 * mm
        c.drawImage(logo, margin_x, top_y - logo_h + 2 * mm, width=logo_w, height=logo_h, preserveAspectRatio=True, mask="auto")

    trade = safe(doc.get("empresa_nome_fantasia") or tenant.name)[:48]
    name_x = margin_x + (logo_w + 4 * mm if logo_w else 0)
    c.setFillColor(colors.black)
    c.setFont(font_bold, 18)
    c.drawString(name_x, top_y - 7 * mm, trade)

    c.setFont(font_bold, 11)
    c.drawRightString(width - margin_x, top_y - 7 * mm, doc_title)
    c.setFont(font, 8)
    c.drawRightString(width - margin_x, top_y - 12.5 * mm, f"Emissão: {datetime.now().strftime('%d/%m/%Y')}")

    divider_y = top_y - 20 * mm
    draw_professional_horizontal_rule(
        c,
        margin_x=margin_x,
        content_width=content_width,
        y=divider_y,
        brand_blue=brand_blue,
    )

    client_lines = [
        f"CNPJ/CPF: {mask_tax_document(doc.get('cliente_documento') or (client.document if client else None))}",
        *_client_address_lines_from_doc(doc)[:2],
    ]
    if doc.get("cliente_telefone") or (client and client.phone):
        client_lines.append(f"Tel.: {mask_phone(doc.get('cliente_telefone') or (client.phone if client else None))}")

    provider_name = safe(doc.get("empresa_razao_social") or tenant.name)
    y = divider_y - 6 * mm
    y = _draw_parties_side_by_side(
        c,
        y_top=y,
        margin_x=margin_x,
        content_width=content_width,
        font=font,
        font_bold=font_bold,
        client_name=safe(doc.get("cliente_nome") or (client.name if client else None)),
        client_lines=client_lines,
        provider_name=provider_name,
        provider_lines=_provider_lines_from_doc(doc, tenant),
    )
    y -= 4 * mm

    equip_lines = [
        f"Tipo: {safe(doc.get('tipo_aparelho'))}",
        f"Marca / modelo: {safe(doc.get('marca_modelo'))}",
        f"Capacidade: {safe(doc.get('capacidade'))}",
    ]
    if doc.get("serie_evaporadora"):
        equip_lines.append(f"Série evaporadora: {safe(doc.get('serie_evaporadora'))}")
    if doc.get("serie_condensadora"):
        equip_lines.append(f"Série condensadora: {safe(doc.get('serie_condensadora'))}")
    if doc.get("equipment_tag"):
        equip_lines.append(f"Identificação: {safe(doc.get('equipment_tag'))}")
    if doc.get("local_instalacao"):
        equip_lines.append(f"Local: {safe(doc.get('local_instalacao'))}")
    if doc.get("qrcode_code_id"):
        equip_lines.append(f"QR Code: {safe(doc.get('qrcode_code_id'))}")

    if y < 55 * mm:
        c.showPage()
        y = height - 18 * mm
    y = _draw_section_title(c, x=margin_x, y=y, title="EQUIPAMENTO INSTALADO", font_bold=font_bold, brand_blue=brand_blue)
    c.setFont(font, 7.5)
    for line in equip_lines:
        if line.endswith(": —"):
            continue
        if y < 42 * mm:
            c.showPage()
            y = height - 18 * mm
        c.drawString(margin_x, y, line[:98])
        y -= 3.4 * mm
    y -= 3 * mm

    vigencia_text = (
        f"Data da instalação: {doc.get('data_instalacao_br')}. "
        f"Validade da garantia do serviço: {doc.get('validade_ate_br')} "
        f"({doc.get('meses_garantia')} meses). "
        f"Prazo: {safe(doc.get('prazo_garantia_servico'))}."
    )
    if y < 50 * mm:
        c.showPage()
        y = height - 18 * mm
    y = _draw_section_title(c, x=margin_x, y=y, title="VIGÊNCIA DA GARANTIA", font_bold=font_bold, brand_blue=brand_blue)
    y = _draw_body_paragraph(c, x=margin_x, y=y, text=vigencia_text, font=font, height=height)

    y = _draw_startup_table(
        c,
        y=y,
        margin_x=margin_x,
        content_width=content_width,
        height=height,
        doc=doc,
        garantia=garantia,
        font=font,
        font_bold=font_bold,
        brand_blue=brand_blue,
    )

    text_sections: list[tuple[str, str]] = [
        ("TERMOS DA GARANTIA", safe(str(doc.get("termos_garantia") or ""))),
        ("SERVIÇOS COBERTOS", safe(str(doc.get("servicos_cobertos") or ""))),
        ("CONDIÇÕES E EXCLUSÕES", safe(str(doc.get("condicoes_exclusoes") or ""))),
        ("GARANTIA DE FÁBRICA", safe(str(doc.get("nota_garantia_fabrica") or ""))),
    ]
    for title, body in text_sections:
        if not body or body == "—":
            continue
        if y < 50 * mm:
            c.showPage()
            y = height - 18 * mm
        y = _draw_section_title(c, x=margin_x, y=y, title=title, font_bold=font_bold, brand_blue=brand_blue)
        y = _draw_body_paragraph(c, x=margin_x, y=y, text=body, font=font, height=height, width_chars=98)

    obs = safe(str(doc.get("observacoes") or ""))
    if obs and obs != "—":
        if y < 50 * mm:
            c.showPage()
            y = height - 18 * mm
        y = _draw_section_title(c, x=margin_x, y=y, title="OBSERVAÇÕES DO TÉCNICO", font_bold=font_bold, brand_blue=brand_blue)
        y = _draw_body_paragraph(c, x=margin_x, y=y, text=obs, font=font, height=height)

    evidence_photos = load_garantia_evidence_photos(garantia, doc, db=db)
    if evidence_photos:
        _draw_garantia_photo_annex_pages(
            c,
            photos=evidence_photos,
            width=width,
            height=height,
            margin_x=margin_x,
            content_width=content_width,
            font=font,
            font_bold=font_bold,
            brand_blue=brand_blue,
        )
        c.showPage()

    _draw_garantia_signatures(
        c,
        width=width,
        margin_x=margin_x,
        tenant=tenant,
        order=order,
        doc=doc,
        font=font,
    )

    c.setFont(font, 7)
    c.setFillColor(colors.black)
    c.drawCentredString(width / 2, 10 * mm, "Documento gerado pelo Climaris — termo de garantia de instalação.")

    c.save()
    buffer.seek(0)
    return buffer.getvalue()


def parse_garantia_from_description(description: str | None) -> dict[str, Any]:
    meta = parse_service_order_meta(description) or {}
    raw = meta.get("garantia")
    return raw if isinstance(raw, dict) else {}
