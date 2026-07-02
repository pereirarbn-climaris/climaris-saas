"""PDF de laudo técnico — identidade visual alinhada ao Orcamento_Profissional.pdf."""

from __future__ import annotations

import base64
import re
from datetime import datetime
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

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
from app.service_order_laudo import parse_laudo_from_description
from app.service_order_meta import parse_checklist_items
from models import Client, ServiceOrder, Tenant

_PHOTOS_PER_ANNEX_PAGE = 4
_ANNEX_COLS = 2


def _decode_data_url_image(data_url: str | None) -> bytes | None:
    if not data_url or not isinstance(data_url, str):
        return None
    match = re.match(r"^data:image/[\w+.-]+;base64,(.+)$", data_url.strip(), re.I | re.S)
    if not match:
        return None
    try:
        return base64.b64decode(match.group(1))
    except Exception:
        return None


def _wrap_text(text: str, max_chars: int) -> list[str]:
    words = (text or "").split()
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
    return lines or [""]


def _format_number(value: Any, suffix: str = "") -> str:
    if value is None or value == "":
        return "—"
    try:
        num = float(value)
        label = f"{num:g}"
        return f"{label}{suffix}" if suffix else label
    except (TypeError, ValueError):
        return "—"


def _checklist_status_label(status: str) -> str:
    s = (status or "").lower()
    if s in ("sim", "ok", "done"):
        return "OK"
    if s in ("nao", "not_ok", "fail"):
        return "Reprovado"
    return "N/A"


def _equipment_summary(order: ServiceOrder) -> str:
    labels: list[str] = []
    seen: set[str] = set()
    for item in order.service_items or []:
        equipment = getattr(item, "equipment", None)
        if equipment is None:
            continue
        parts = [
            safe(getattr(equipment, "identificacao", None), ""),
            safe(getattr(equipment, "modelo", None), ""),
            safe(getattr(equipment, "fabricante", None), ""),
        ]
        label = " · ".join(p for p in parts if p and p != "-")
        if not label:
            label = f"Equipamento #{getattr(item, 'equipment_id', '?')}"
        if label in seen:
            continue
        seen.add(label)
        labels.append(label)
    return "; ".join(labels) if labels else "—"


def _client_address_lines(client: Client | None) -> list[str]:
    if not client:
        return ["—"]
    single = ", ".join(
        p
        for p in [
            safe(getattr(client, "address_street", None), ""),
            safe(getattr(client, "address_number", None), ""),
            safe(getattr(client, "address_district", None), ""),
            safe(getattr(client, "address_city", None), ""),
            safe(getattr(client, "address_state", None), ""),
        ]
        if p and p != "-"
    )
    return address_lines(single) if single else ["—"]


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


def _draw_section_title(
    c: canvas.Canvas,
    *,
    x: float,
    y: float,
    title: str,
    font_bold: str,
    brand_blue: colors.Color,
) -> float:
    c.setFont(font_bold, 9.2)
    c.setFillColor(colors.black)
    c.drawString(x, y, title)
    c.setStrokeColor(tint_with_white(brand_blue, 0.82))
    c.setLineWidth(0.5)
    c.line(x, y - 1.5 * mm, x + 175 * mm, y - 1.5 * mm)
    return y - 5.5 * mm


def _draw_body_paragraph(
    c: canvas.Canvas,
    *,
    x: float,
    y: float,
    text: str,
    font: str,
    height: float,
    width_chars: int = 98,
) -> float:
    c.setFont(font, 7.5)
    c.setFillColor(colors.black)
    for line in _wrap_text(text, width_chars):
        if y < 42 * mm:
            c.showPage()
            y = height - 18 * mm
        c.drawString(x, y, line)
        y -= 3.4 * mm
    return y - 2.5 * mm


def _draw_tech_table(
    c: canvas.Canvas,
    *,
    y: float,
    margin_x: float,
    content_width: float,
    height: float,
    laudo: dict[str, Any],
    font: str,
    font_bold: str,
    brand_blue: colors.Color,
) -> float:
    rows = [
        ["Pressão de sucção", _format_number(laudo.get("pressaoSuccao"), " PSI")],
        ["Pressão de descarga", _format_number(laudo.get("pressaoDescarga"), " PSI")],
        ["Tensão", _format_number(laudo.get("tensaoV"), " V")],
        ["Corrente", _format_number(laudo.get("correnteA"), " A")],
    ]
    if not any(r[1] != "—" for r in rows):
        return y

    y = _draw_section_title(
        c,
        x=margin_x,
        y=y,
        title="DADOS TÉCNICOS (PRESSÃO / ELÉTRICA)",
        font_bold=font_bold,
        brand_blue=brand_blue,
    )
    grid_color = tint_with_white(brand_blue, 0.92)
    table = Table([["Parâmetro medido", "Valor registrado"], *rows], colWidths=[content_width * 0.58, content_width * 0.42])
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


def _technician_footer_label(*, tenant: Tenant, technician_name: str) -> str:
    name = safe(technician_name, "Técnico responsável")
    cft = safe(getattr(tenant, "cft_number", None), "")
    if cft and cft != "—":
        return f"Técnico Responsável: {name[:42]} - CFT/CREA: {cft[:40]}"
    return f"Técnico Responsável: {name[:42]}"


def _draw_signatures_footer(
    c: canvas.Canvas,
    *,
    width: float,
    margin_x: float,
    tenant: Tenant,
    order: ServiceOrder,
    client: Client | None,
    laudo: dict[str, Any],
    font: str,
    font_bold: str,
) -> None:
    sig_blob = _decode_data_url_image(
        laudo.get("clientSignatureBase64") if isinstance(laudo.get("clientSignatureBase64"), str) else None
    )
    sig_name = safe(str(laudo.get("clientSignatureName") or (client.name if client else "")), "Cliente")
    place = safe(getattr(tenant, "address_city", None), "Local")
    issued = datetime.now().strftime("%d/%m/%Y")
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

    technician_name = safe(order.assigned_technician_name or tenant.name)
    technician_label = _technician_footer_label(tenant=tenant, technician_name=technician_name)

    c.setFont(font, 7.8)
    c.drawCentredString((left_x1 + left_x2) / 2, sign_y - 4.5 * mm, technician_label[:95])
    c.drawCentredString((right_x1 + right_x2) / 2, sign_y - 4.5 * mm, sig_name[:42])
    c.drawCentredString((right_x1 + right_x2) / 2, sign_y - 7.5 * mm, "De acordo / Assinatura do cliente")


def _draw_photo_annex_pages(
    c: canvas.Canvas,
    *,
    photos: list[dict[str, Any]],
    width: float,
    height: float,
    margin_x: float,
    content_width: float,
    font: str,
    font_bold: str,
    brand_blue: colors.Color,
) -> None:
    valid: list[tuple[bytes, str]] = []
    for photo in photos:
        if not isinstance(photo, dict):
            continue
        blob = _decode_data_url_image(str(photo.get("dataUrl") or photo.get("data_url") or ""))
        if not blob:
            continue
        caption = safe(str(photo.get("caption") or ""), "Evidência fotográfica")
        valid.append((blob, caption if caption != "-" else "Evidência fotográfica"))

    if not valid:
        return

    gap = 6 * mm
    cell_w = (content_width - gap) / _ANNEX_COLS
    img_h = 58 * mm
    caption_h = 8 * mm
    row_h = img_h + caption_h + 4 * mm

    for page_start in range(0, len(valid), _PHOTOS_PER_ANNEX_PAGE):
        c.showPage()
        y_top = height - 18 * mm
        c.setFillColor(colors.black)
        c.setFont(font_bold, 11)
        c.drawString(margin_x, y_top, "ANEXO — EVIDÊNCIAS FOTOGRÁFICAS")
        c.setFont(font, 7.5)
        c.setFillColor(colors.black)
        c.drawString(margin_x, y_top - 5 * mm, "Registros visuais vinculados à ordem de serviço")
        draw_professional_horizontal_rule(
            c,
            margin_x=margin_x,
            content_width=content_width,
            y=y_top - 8 * mm,
            brand_blue=brand_blue,
        )
        grid_top = y_top - 12 * mm

        chunk = valid[page_start : page_start + _PHOTOS_PER_ANNEX_PAGE]
        for idx, (blob, caption) in enumerate(chunk):
            row = idx // _ANNEX_COLS
            col = idx % _ANNEX_COLS
            px = margin_x + col * (cell_w + gap)
            py = grid_top - row * row_h - img_h
            try:
                img = ImageReader(BytesIO(blob))
                c.drawImage(img, px, py, width=cell_w, height=img_h, preserveAspectRatio=True, anchor="sw", mask="auto")
            except Exception:
                pass
            c.setFont(font, 7.2)
            c.setFillColor(colors.black)
            for line_i, line in enumerate(_wrap_text(caption, max_chars=42)[:2]):
                c.drawString(px, py - 4 * mm - line_i * 3.2 * mm, line)


def build_service_order_laudo_pdf(*, order: ServiceOrder, client: Client | None, tenant: Tenant) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    font, font_bold = register_pdf_fonts()
    margin_x = 15 * mm
    content_width = width - 2 * margin_x
    brand_blue = parse_brand_color(getattr(tenant, "pdf_primary_color", None))

    laudo = parse_laudo_from_description(order.description)
    logo = try_read_logo(getattr(tenant, "logo_url", None))

    top_y = height - 14 * mm
    logo_w = 0.0
    if logo:
        logo_h = 14 * mm
        logo_w = 22 * mm
        c.drawImage(logo, margin_x, top_y - logo_h + 2 * mm, width=logo_w, height=logo_h, preserveAspectRatio=True, mask="auto")

    name_x = margin_x + (logo_w + 4 * mm if logo_w else 0)
    c.setFillColor(colors.black)
    c.setFont(font_bold, 18)
    c.drawString(name_x, top_y - 7 * mm, safe(tenant.name)[:48])

    c.setFont(font_bold, 12)
    c.drawRightString(width - margin_x, top_y - 6 * mm, "LAUDO TÉCNICO")
    c.setFont(font, 8)
    c.drawRightString(width - margin_x, top_y - 11.5 * mm, f"OS nº {order.id:03d}")
    c.drawRightString(width - margin_x, top_y - 15.5 * mm, f"Emissão: {datetime.now().strftime('%d/%m/%Y')}")

    divider_y = top_y - 20 * mm
    draw_professional_horizontal_rule(
        c,
        margin_x=margin_x,
        content_width=content_width,
        y=divider_y,
        brand_blue=brand_blue,
    )

    provider_lines = [
        f"CNPJ/CPF: {mask_tax_document(tenant.cnpj)}",
        *address_lines(tenant_full_address(tenant), max_chars=46)[:2],
        f"Contato: {mask_phone(tenant.phone)}",
    ]
    if tenant.email:
        provider_lines.append(f"E-mail: {safe(tenant.email)[:46]}")

    client_lines = [
        f"CNPJ/CPF: {mask_tax_document(client.document if client else None)}",
        *(_client_address_lines(client)[:2]),
    ]
    if client and client.phone:
        client_lines.append(f"Tel.: {mask_phone(client.phone)}")

    y = divider_y - 6 * mm
    y = _draw_parties_side_by_side(
        c,
        y_top=y,
        margin_x=margin_x,
        content_width=content_width,
        font=font,
        font_bold=font_bold,
        client_name=safe(client.name if client else None),
        client_lines=client_lines,
        provider_name=safe(tenant.name),
        provider_lines=provider_lines,
    )
    y -= 4 * mm

    objeto = safe(str(laudo.get("objetoLaudo") or order.title))
    equipamentos = _equipment_summary(order)
    c.setFont(font_bold, 8.2)
    c.drawString(margin_x, y, "EQUIPAMENTO(S) / OBJETO")
    y -= 4 * mm
    c.setFont(font, 7.5)
    c.drawString(margin_x, y, f"Objeto: {objeto[:95]}")
    y -= 3.4 * mm
    c.drawString(margin_x, y, f"Equipamentos: {equipamentos[:95]}")
    y -= 6 * mm

    text_sections: list[tuple[str, str]] = [
        ("METODOLOGIA", safe(str(laudo.get("metodologia") or ""))),
        ("DESCRIÇÃO / SOLICITAÇÃO", safe(str(laudo.get("descricaoProblema") or ""))),
        ("DIAGNÓSTICO", safe(str(laudo.get("diagnosticoTecnico") or ""))),
        ("CONCLUSÃO", safe(str(laudo.get("conclusao") or ""))),
        ("RECOMENDAÇÕES / PLANO DE AÇÃO", safe(str(laudo.get("planoAcao") or ""))),
    ]
    for title, body in text_sections:
        if body == "—":
            continue
        if y < 50 * mm:
            c.showPage()
            y = height - 18 * mm
        y = _draw_section_title(c, x=margin_x, y=y, title=title, font_bold=font_bold, brand_blue=brand_blue)
        y = _draw_body_paragraph(c, x=margin_x, y=y, text=body, font=font, height=height)

    y = _draw_tech_table(
        c,
        y=y,
        margin_x=margin_x,
        content_width=content_width,
        height=height,
        laudo=laudo,
        font=font,
        font_bold=font_bold,
        brand_blue=brand_blue,
    )

    checklist = parse_checklist_items(order.description)
    if checklist:
        if y < 55 * mm:
            c.showPage()
            y = height - 18 * mm
        y = _draw_section_title(
            c,
            x=margin_x,
            y=y,
            title="CHECKLIST DE VERIFICAÇÃO",
            font_bold=font_bold,
            brand_blue=brand_blue,
        )
        meta_checklist = laudo.get("checklist") if isinstance(laudo.get("checklist"), list) else []
        rows = [["Item verificado", "Status", "Observação"]]
        for item in checklist:
            obs = ""
            for raw in meta_checklist:
                if isinstance(raw, dict) and str(raw.get("id") or "") == str(item.get("id") or ""):
                    obs = safe(str(raw.get("observacao") or ""), "")
                    break
            rows.append(
                [
                    safe(item.get("descricao")),
                    _checklist_status_label(str(item.get("status") or "")),
                    obs or "—",
                ]
            )
        grid_color = tint_with_white(brand_blue, 0.92)
        table = Table(rows, colWidths=[content_width * 0.52, content_width * 0.14, content_width * 0.34], repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), brand_blue),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                    ("FONTNAME", (0, 0), (-1, 0), font_bold),
                    ("FONTNAME", (0, 1), (-1, -1), font),
                    ("FONTSIZE", (0, 0), (-1, -1), 7.2),
                    ("GRID", (0, 0), (-1, -1), 0.3, grid_color),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        _, th = table.wrapOn(c, content_width, y)
        if y - th < 45 * mm:
            c.showPage()
            y = height - 18 * mm
        table.drawOn(c, margin_x, y - th)
        y -= th + 6 * mm

    _draw_signatures_footer(
        c,
        width=width,
        margin_x=margin_x,
        tenant=tenant,
        order=order,
        client=client,
        laudo=laudo,
        font=font,
        font_bold=font_bold,
    )

    photos = laudo.get("laudoFotos") if isinstance(laudo.get("laudoFotos"), list) else []
    if photos:
        _draw_photo_annex_pages(
            c,
            photos=photos,
            width=width,
            height=height,
            margin_x=margin_x,
            content_width=content_width,
            font=font,
            font_bold=font_bold,
            brand_blue=brand_blue,
        )

    c.setFont(font, 7)
    c.setFillColor(colors.black)
    c.drawCentredString(width / 2, 10 * mm, "Documento gerado pelo Climaris — laudo técnico de ordem de serviço.")

    c.save()
    buffer.seek(0)
    return buffer.getvalue()
