"""Geração do Relatório PMOC 2.0 (PDF) — Lei 13.589/2018 e ABNT NBR 17.037:2023."""

from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO
from typing import Any
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

from models import (
    Client,
    Equipment,
    PmocActivityFrequency,
    PmocExecution,
    PmocPlan,
    PmocPlanEquipment,
    PmocScheduledActivity,
    Tenant,
)

from app.pmoc_service import LAW_THRESHOLD_BTU
from app.pmoc_public_validation import build_public_pmoc_validation_url, generate_pmoc_validation_qr_png

PMOC_LEGAL_COMPLIANCE = (
    "Laudo em conformidade com a Lei Federal 13.589/2018 e ABNT NBR 17.037:2023 "
    "(Qualidade do Ar Interior em Sistemas de Climatização)."
)

PMOC_NORM_REFERENCE = (
    "ABNT NBR 17.037:2023 (Qualidade do Ar Interior em Sistemas de Climatização)."
)

RT_PENDING_LABEL = "Pendente de emissão/assinatura do RT"

_FREQUENCY_LABELS: dict[str, str] = {
    "monthly": "Mensal",
    "quarterly": "Trimestral",
    "semiannual": "Semestral",
    "annual": "Anual",
    "custom": "Personalizado",
}

_STATUS_LABELS = {"ok": "OK", "not_ok": "Não OK", "na": "N/A"}


@dataclass
class PhotoEvidence:
    image_bytes: bytes
    caption: str


def _safe(value: str | None, fallback: str = "—") -> str:
    text = (value or "").strip()
    return text or fallback


def _rt_value(value: str | None) -> str:
    text = (value or "").strip()
    return text if text else RT_PENDING_LABEL


def format_rt_signature_lines(plan: PmocPlan) -> list[str]:
    """Linhas oficiais da Seção 5 — RT e ART (com fallback apenas se vazio)."""
    rt_name = (plan.responsible_name or "").strip()
    rt_council = (plan.responsible_council or "").strip()
    rt_registration = (plan.responsible_registration or "").strip()
    art_number = (plan.art_number or "").strip()

    lines: list[str] = []
    lines.append(f"Responsável Técnico: {rt_name}" if rt_name else f"Responsável Técnico: {RT_PENDING_LABEL}")

    if rt_council and rt_registration:
        lines.append(f"Conselho Profissional: {rt_council} · Registro nº {rt_registration}")
    elif rt_council:
        lines.append(f"Conselho Profissional: {rt_council}")
    elif rt_registration:
        lines.append(f"Registro Profissional nº {rt_registration}")
    else:
        lines.append(f"Conselho / Registro: {RT_PENDING_LABEL}")

    if art_number:
        lines.append(f"ART nº {art_number} · Emissão: {_date(plan.art_issued_at)}")
    else:
        lines.append(f"ART nº: {RT_PENDING_LABEL}")

    if getattr(plan, "art_file_url", None):
        if str(plan.art_file_url).strip():
            lines.append("Documento ART (PDF) arquivado digitalmente neste plano PMOC.")

    return lines


def _format_btu(value: int) -> str:
    return f"{max(int(value or 0), 0):,} BTUs".replace(",", ".")


def sum_equipment_btu_from_links(equipments: list[tuple[PmocPlanEquipment, Equipment | None]]) -> int:
    """Soma dinâmica das capacidades dos equipamentos vinculados ao plano."""
    total = 0
    for _link, eq in equipments:
        if eq is not None and eq.capacidade_btu:
            total += int(eq.capacidade_btu)
    return total


def air_analysis_required_for_btu(total_btu: int) -> bool:
    return total_btu >= LAW_THRESHOLD_BTU


def frequency_label_pt(frequency: PmocActivityFrequency | str | None) -> str:
    if frequency is None:
        return "—"
    raw = frequency.value if isinstance(frequency, PmocActivityFrequency) else str(frequency)
    return _FREQUENCY_LABELS.get(raw.strip().lower(), raw)


def _pick_address_field(snap: dict[str, Any], client: Client, key: str) -> str:
    val = snap.get(key)
    if val is not None and str(val).strip():
        return str(val).strip()
    return (getattr(client, key, None) or "").strip()


def _format_postal_code(raw: str | None) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 8:
        return f"{digits[:5]}-{digits[5:]}"
    return digits


def format_establishment_address(snap: dict[str, Any], client: Client) -> str:
    """Endereço completo: Rua, Nº - Bairro - Cidade/UF - CEP: XXXXX-XXX."""
    street = _pick_address_field(snap, client, "address_street")
    number = _pick_address_field(snap, client, "address_number")
    district = _pick_address_field(snap, client, "address_district")
    city = _pick_address_field(snap, client, "address_city")
    state = _pick_address_field(snap, client, "address_state")
    cep = _format_postal_code(_pick_address_field(snap, client, "address_postal_code"))

    if not any([street, number, district, city, state, cep]):
        return _safe(client.address_street)

    line1 = f"{street}, {number}" if street and number else street or number
    segments: list[str] = []
    if line1:
        segments.append(line1)
    if district:
        segments.append(district)
    city_state = f"{city}/{state}" if city and state else city or state
    if city_state:
        segments.append(city_state)
    if cep:
        segments.append(f"CEP: {cep}")
    if not segments:
        return "—"
    if len(segments) == 1:
        return segments[0]
    return f"{segments[0]} - {' - '.join(segments[1:])}"


def _draw_dotted_line(c: canvas.Canvas, x1: float, y1: float, x2: float, y2: float) -> None:
    c.saveState()
    c.setDash(1, 3)
    c.setStrokeColor(colors.HexColor("#CBD5E1"))
    c.line(x1, y1, x2, y2)
    c.restoreState()


def _date(value: date | datetime | None) -> str:
    if not value:
        return "—"
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    return value.strftime("%d/%m/%Y")


def _normalize_legal_text(text: str | None) -> str:
    raw = (text or "").strip()
    if not raw:
        return PMOC_NORM_REFERENCE
    replacements = (
        (r"RE\s*0?9\s*(da\s*)?ANVISA", "ABNT NBR 17.037:2023"),
        (r"Resolução\s*RE\s*0?9", "ABNT NBR 17.037:2023"),
        (r"normas correlatas da ANVISA", "ABNT NBR 17.037:2023"),
        (r"ANVISA/RE-?0?9", "ABNT NBR 17.037:2023"),
    )
    out = raw
    for pattern, repl in replacements:
        out = re.sub(pattern, repl, out, flags=re.IGNORECASE)
    if "17.037" not in out and "ANVISA" in out.upper():
        out = f"{out.rstrip('.')}. Referência normativa: {PMOC_NORM_REFERENCE}"
    return out


def _decode_data_url_image(data_url: str | None) -> bytes | None:
    if not data_url or not isinstance(data_url, str):
        return None
    raw = data_url.strip()
    if not raw:
        return None
    if raw.startswith("data:"):
        parts = raw.split(",", 1)
        if len(parts) != 2:
            return None
        raw = parts[1]
    try:
        blob = base64.b64decode(raw, validate=False)
    except Exception:
        return None
    return blob if blob else None


def _parse_field_inspection(notes: str | None) -> dict[str, Any] | None:
    if not notes or not notes.strip():
        return None
    try:
        data = json.loads(notes)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    if data.get("type") != "field_inspection":
        return None
    return data


def _status_label(status: str | None) -> str:
    if not status:
        return "—"
    return _STATUS_LABELS.get(status.strip().lower(), status)


def _collect_photo_evidence(executions: list[PmocExecution]) -> list[PhotoEvidence]:
    photos: list[PhotoEvidence] = []
    for execution in executions:
        payload = _parse_field_inspection(execution.notes)
        if not payload:
            continue
        checklist = payload.get("checklist")
        if not isinstance(checklist, list):
            continue
        for item in checklist:
            if not isinstance(item, dict):
                continue
            photo_ref = item.get("photoReference")
            if not photo_ref:
                continue
            blob = _decode_data_url_image(str(photo_ref))
            if not blob:
                continue
            title = _safe(str(item.get("title") or "Item do checklist"))
            status = _status_label(str(item.get("status") or ""))
            photos.append(PhotoEvidence(image_bytes=blob, caption=f"{title} — Status: {status}"))
    return photos


def _collect_latest_signature(executions: list[PmocExecution]) -> bytes | None:
    for execution in executions:
        payload = _parse_field_inspection(execution.notes)
        if not payload:
            continue
        blob = _decode_data_url_image(payload.get("signatureBase64"))
        if blob:
            return blob
    return None


def _snapshot_dict(plan: PmocPlan) -> dict[str, Any]:
    if not plan.establishment_snapshot_json:
        return {}
    try:
        data = json.loads(plan.establishment_snapshot_json)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


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


def _tenant_brand_color(tenant: Tenant) -> colors.Color:
    raw = getattr(tenant, "pdf_primary_color", None) or "#006FEE"
    color = str(raw).strip().upper()
    if not re.fullmatch(r"#[0-9A-F]{6}", color):
        color = "#006FEE"
    return colors.HexColor(color)


def build_pmoc_report_pdf(
    plan: PmocPlan,
    tenant: Tenant,
    client: Client,
    equipments: list[tuple[PmocPlanEquipment, Equipment | None]],
    activities: list[PmocScheduledActivity],
    executions: list[PmocExecution],
    *,
    logo_url: str | None = None,
) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin_x = 15 * mm
    bottom_margin = 18 * mm
    content_width = width - (2 * margin_x)
    brand = _tenant_brand_color(tenant)

    try:
        pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
        pdfmetrics.registerFont(TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
        font = "DejaVu"
        font_bold = "DejaVu-Bold"
    except Exception:
        font = "Helvetica"
        font_bold = "Helvetica-Bold"

    body_style = ParagraphStyle(name="pmoc_body", fontName=font, fontSize=8.2, leading=10.5)
    small_style = ParagraphStyle(name="pmoc_small", fontName=font, fontSize=7.4, leading=9.2)
    page_num = 1

    pmoc_id = int(getattr(plan, "id", 0) or 0)
    qr_reader: ImageReader | None = None
    if pmoc_id > 0:
        try:
            validation_url = build_public_pmoc_validation_url(pmoc_id)
            qr_reader = ImageReader(BytesIO(generate_pmoc_validation_qr_png(validation_url)))
        except Exception:
            qr_reader = None

    def draw_footer() -> None:
        c.setFillColor(colors.HexColor("#64748B"))
        c.setFont(font, 7.2)
        c.drawRightString(width - margin_x, 8 * mm, f"Página {page_num}")

    def draw_page_chrome() -> None:
        draw_footer()
        if qr_reader is not None:
            qr_size = 14 * mm
            qr_x = width - margin_x - qr_size
            qr_y = height - 14 * mm - qr_size
            c.drawImage(qr_reader, qr_x, qr_y, qr_size, qr_size, preserveAspectRatio=True, mask="auto")
            c.setFillColor(colors.HexColor("#64748B"))
            c.setFont(font, 6)
            c.drawRightString(width - margin_x, qr_y - 2.5 * mm, "Validar PMOC")

    def new_page() -> float:
        nonlocal page_num, y
        draw_page_chrome()
        c.showPage()
        page_num += 1
        y = height - 16 * mm
        return y

    def ensure_space(needed: float) -> None:
        nonlocal y
        if y - needed < bottom_margin:
            y = new_page()

    def draw_wrapped_paragraph(text: str, style: ParagraphStyle, y_start: float, *, max_width: float | None = None) -> float:
        wrap_w = max_width if max_width is not None else content_width
        para = Paragraph(text.replace("\n", "<br/>"), style)
        _w, h = para.wrap(wrap_w, height)
        ensure_space(h + 4 * mm)
        para.drawOn(c, margin_x, y_start - h)
        return y_start - h - 4 * mm

    def draw_table_block(table: Table, min_keep: float = 24 * mm) -> None:
        nonlocal y
        _, table_h = table.wrapOn(c, content_width, height)
        if table_h + min_keep > y - bottom_margin:
            y = new_page()
        _, table_h = table.wrapOn(c, content_width, height)
        ensure_space(table_h + 6 * mm)
        table.drawOn(c, margin_x, y - table_h)
        y -= table_h + 8 * mm

    y = height - 16 * mm
    snap = _snapshot_dict(plan)
    total_btu = sum_equipment_btu_from_links(equipments)
    if total_btu <= 0 and plan.total_btu_sum > 0:
        total_btu = int(plan.total_btu_sum)
    air_required = air_analysis_required_for_btu(total_btu)

    # ── Cabeçalho ────────────────────────────────────────────────────────────
    logo_reader = _try_read_logo(logo_url or getattr(tenant, "logo_url", None))
    if logo_reader is not None:
        c.drawImage(logo_reader, margin_x, y - 14 * mm, 18 * mm, 18 * mm, preserveAspectRatio=True, mask="auto")
        text_x = margin_x + 22 * mm
    else:
        text_x = margin_x

    c.setFillColor(brand)
    c.setFont(font_bold, 13)
    c.drawString(text_x, y - 4 * mm, "RELATÓRIO PMOC 2.0")
    c.setFillColor(colors.black)
    c.setFont(font_bold, 9.5)
    c.drawString(text_x, y - 10 * mm, _safe(tenant.name))
    c.setFont(font, 8)
    c.drawString(text_x, y - 15 * mm, f"Plano: {_safe(plan.title)} · Versão {_safe(plan.version_label)}")
    y -= 24 * mm

    compliance_style = ParagraphStyle(
        name="pmoc_compliance",
        fontName=font_bold,
        fontSize=7.8,
        leading=9.5,
        textColor=colors.HexColor("#1E3A8A"),
    )
    note_style = ParagraphStyle(
        name="pmoc_compliance_note",
        fontName=font,
        fontSize=7.2,
        leading=9,
        textColor=colors.HexColor("#1E40AF"),
    )
    inner_w = content_width - 6 * mm
    p_compliance = Paragraph(PMOC_LEGAL_COMPLIANCE, compliance_style)
    p_note = Paragraph(_normalize_legal_text(plan.law_reference_note), note_style)
    _, h_compliance = p_compliance.wrap(inner_w, height)
    _, h_note = p_note.wrap(inner_w, height)
    banner_h = h_compliance + h_note + 8 * mm
    ensure_space(banner_h + 2 * mm)
    c.setFillColor(colors.HexColor("#EFF6FF"))
    c.roundRect(margin_x, y - banner_h, content_width, banner_h, 2 * mm, stroke=0, fill=1)
    p_compliance.drawOn(c, margin_x + 3 * mm, y - 4 * mm - h_compliance)
    p_note.drawOn(c, margin_x + 3 * mm, y - 6 * mm - h_compliance - h_note)
    y -= banner_h + 4 * mm

    # ── Identificação ────────────────────────────────────────────────────────
    ensure_space(28 * mm)
    c.setFillColor(colors.black)
    c.setFont(font_bold, 9.5)
    c.drawString(margin_x, y, "1. Identificação do Estabelecimento")
    y -= 5 * mm
    id_rows = [
        ["Cliente", _safe(client.name)],
        ["Documento", _safe(client.document)],
        ["Endereço", format_establishment_address(snap, client)],
        ["Capacidade total", _format_btu(total_btu)],
        ["Análise de ar exigida", "Sim" if air_required else "Não"],
    ]
    id_table = Table(id_rows, colWidths=[42 * mm, content_width - 42 * mm])
    id_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), font_bold),
                ("FONTNAME", (1, 0), (1, -1), font),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("WORDWRAP", (1, 0), (1, -1), True),
            ]
        )
    )
    draw_table_block(id_table, min_keep=30 * mm)

    # ── Equipamentos ─────────────────────────────────────────────────────────
    ensure_space(16 * mm)
    c.setFont(font_bold, 9.5)
    c.drawString(margin_x, y, "2. Equipamentos Vinculados")
    y -= 5 * mm
    eq_header = [["Identificação", "Modelo", "BTU", "Local", "Referência"]]
    eq_rows: list[list[str]] = []
    for link, eq in equipments:
        eq_rows.append(
            [
                _safe(eq.identificacao if eq else None, f"Equipamento #{link.equipment_id}"),
                _safe(eq.modelo if eq else None),
                f"{eq.capacidade_btu:,}".replace(",", ".") if eq and eq.capacidade_btu else "—",
                _safe(eq.local_instalacao if eq else None),
                _safe(eq.installation_reference if eq else None),
            ]
        )
    if not eq_rows:
        eq_rows = [["—", "—", "—", "—", "Nenhum equipamento vinculado"]]
    eq_table = Table(eq_header + eq_rows, colWidths=[38 * mm, 32 * mm, 18 * mm, 28 * mm, content_width - 116 * mm], repeatRows=1)
    eq_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), brand),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), font_bold),
                ("FONTNAME", (0, 1), (-1, -1), font),
                ("FONTSIZE", (0, 0), (-1, -1), 7.6),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("WORDWRAP", (0, 1), (-1, -1), True),
            ]
        )
    )
    draw_table_block(eq_table, min_keep=36 * mm)

    # ── Cronograma resumido ────────────────────────────────────────────────────
    ensure_space(16 * mm)
    c.setFont(font_bold, 9.5)
    c.drawString(margin_x, y, "3. Plano de Manutenção (resumo)")
    y -= 5 * mm
    act_header = [["Atividade", "Periodicidade"]]
    act_rows = [[_safe(a.title), frequency_label_pt(a.frequency)] for a in activities[:18]]
    if not act_rows:
        act_rows = [["—", "Nenhuma atividade cadastrada"]]
    act_table = Table(act_header + act_rows, colWidths=[content_width - 40 * mm, 40 * mm], repeatRows=1)
    act_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
                ("FONTNAME", (0, 0), (-1, 0), font_bold),
                ("FONTNAME", (0, 1), (-1, -1), font),
                ("FONTSIZE", (0, 0), (-1, -1), 7.6),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("WORDWRAP", (0, 1), (0, -1), True),
            ]
        )
    )
    draw_table_block(act_table, min_keep=32 * mm)

    # ── Considerações legais ─────────────────────────────────────────────────
    ensure_space(20 * mm)
    c.setFont(font_bold, 9.5)
    c.drawString(margin_x, y, "4. Considerações Legais e Normativas")
    y -= 5 * mm
    legal_text = (
        f"{PMOC_LEGAL_COMPLIANCE}<br/><br/>"
        f"Este documento substitui referências à revogada RE 09 da ANVISA pela norma vigente "
        f"{PMOC_NORM_REFERENCE} O plano atende aos requisitos de registro, execução e evidências "
        f"de campo previstos para sistemas de climatização."
    )
    y = draw_wrapped_paragraph(legal_text, body_style, y)

    # ── Responsável técnico + assinaturas ─────────────────────────────────────
    signature_bytes = _collect_latest_signature(executions)
    rt_name = (plan.responsible_name or "").strip()
    rt_council = (plan.responsible_council or "").strip()
    rt_registration = (plan.responsible_registration or "").strip()
    art_number = (plan.art_number or "").strip()

    signatures_block_h = 58 * mm if signature_bytes else 44 * mm
    if y - signatures_block_h < bottom_margin + 10 * mm:
        y = new_page()

    c.setFont(font_bold, 9.5)
    c.drawString(margin_x, y, "5. Encerramento e Assinaturas")
    y -= 5 * mm

    rt_lines = format_rt_signature_lines(plan)
    for line in rt_lines:
        y = draw_wrapped_paragraph(line, body_style, y, max_width=content_width)
    y -= 2 * mm

    col_w = (content_width - 6 * mm) / 2
    left_x = margin_x
    right_x = margin_x + col_w + 6 * mm
    box_top = y
    box_h = 34 * mm

    c.setStrokeColor(colors.HexColor("#CBD5E1"))
    c.setFillColor(colors.HexColor("#F8FAFC"))
    c.roundRect(left_x, box_top - box_h, col_w, box_h, 2 * mm, stroke=1, fill=1)
    c.roundRect(right_x, box_top - box_h, col_w, box_h, 2 * mm, stroke=1, fill=1)

    c.setFillColor(colors.black)
    c.setFont(font_bold, 8)
    c.drawString(left_x + 3 * mm, box_top - 6 * mm, "Técnico / Empresa")
    c.setFont(font, 7.6)
    c.drawString(left_x + 3 * mm, box_top - 11 * mm, _safe(tenant.name))
    if rt_name:
        c.setFillColor(colors.black)
        c.drawString(left_x + 3 * mm, box_top - 15.5 * mm, f"RT: {rt_name}")
    else:
        c.setFillColor(colors.HexColor("#64748B"))
        c.setFont(font, 7.2)
        c.drawString(left_x + 3 * mm, box_top - 15.5 * mm, RT_PENDING_LABEL)
        _draw_dotted_line(c, left_x + 3 * mm, box_top - 17.5 * mm, left_x + col_w - 3 * mm, box_top - 17.5 * mm)
        c.setFillColor(colors.black)
        c.setFont(font, 7.6)

    council_reg = " · ".join(part for part in [rt_council, rt_registration] if part)
    if council_reg:
        c.drawString(left_x + 3 * mm, box_top - 20 * mm, council_reg)
    else:
        c.setFillColor(colors.HexColor("#64748B"))
        c.drawString(left_x + 3 * mm, box_top - 20 * mm, "Registro profissional pendente")
        _draw_dotted_line(c, left_x + 3 * mm, box_top - 22 * mm, left_x + col_w - 3 * mm, box_top - 22 * mm)
        c.setFillColor(colors.black)

    if art_number:
        c.setFont(font, 7.2)
        c.drawString(left_x + 3 * mm, box_top - 24.5 * mm, f"ART nº {art_number}")

    c.setFont(font_bold, 8)
    c.drawString(right_x + 3 * mm, box_top - 6 * mm, "Assinatura do Cliente")
    c.setFont(font, 7.6)
    c.drawString(right_x + 3 * mm, box_top - 11 * mm, _safe(client.name))

    if signature_bytes:
        try:
            sig_reader = ImageReader(BytesIO(signature_bytes))
            c.drawImage(
                sig_reader,
                right_x + 8 * mm,
                box_top - 31 * mm,
                col_w - 16 * mm,
                16 * mm,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            c.setFillColor(colors.HexColor("#64748B"))
            c.drawString(right_x + 3 * mm, box_top - 24 * mm, "Assinatura indisponível para renderização.")
    else:
        c.setFillColor(colors.HexColor("#64748B"))
        c.drawString(right_x + 3 * mm, box_top - 24 * mm, "Assinatura não registrada digitalmente.")

    y = box_top - box_h - 8 * mm

    # ── Anexo I — Evidências fotográficas ──────────────────────────────────────
    photos = _collect_photo_evidence(executions)
    y = new_page()
    c.setFillColor(brand)
    c.setFont(font_bold, 11)
    c.drawString(margin_x, y, "Anexo I — Evidências Fotográficas de Campo")
    y -= 6 * mm
    c.setFillColor(colors.black)
    c.setFont(font, 8)
    c.drawString(margin_x, y, "Registros coletados via checklist de vistoria em campo (PMOC 2.0).")
    y -= 8 * mm

    if not photos:
        y = draw_wrapped_paragraph(
            "Nenhuma evidência fotográfica de campo registrada neste período.",
            small_style,
            y,
        )
    else:
        photo_w = (content_width - 6 * mm) / 2
        photo_h = 38 * mm
        caption_h = 10 * mm
        row_h = photo_h + caption_h + 4 * mm
        col = 0
        row_y = y

        for photo in photos:
            if col == 0:
                ensure_space(row_h + 4 * mm)
                row_y = y

            x = margin_x + col * (photo_w + 6 * mm)
            c.setStrokeColor(colors.HexColor("#CBD5E1"))
            c.setFillColor(colors.white)
            c.roundRect(x, row_y - photo_h, photo_w, photo_h, 2 * mm, stroke=1, fill=1)
            try:
                img = ImageReader(BytesIO(photo.image_bytes))
                c.drawImage(img, x + 2 * mm, row_y - photo_h + 2 * mm, photo_w - 4 * mm, photo_h - 4 * mm, preserveAspectRatio=True, mask="auto")
            except Exception:
                c.setFillColor(colors.HexColor("#64748B"))
                c.setFont(font, 7.2)
                c.drawCentredString(x + photo_w / 2, row_y - photo_h / 2, "Imagem indisponível")

            cap = Paragraph(photo.caption.replace("&", "&amp;"), small_style)
            _cw, cap_h = cap.wrap(photo_w - 2 * mm, caption_h + 6 * mm)
            cap.drawOn(c, x + 1 * mm, row_y - photo_h - cap_h - 1.5 * mm)

            col += 1
            if col >= 2:
                col = 0
                y = row_y - row_h
            else:
                y = row_y

        if col == 1:
            y = row_y - row_h

    draw_page_chrome()
    c.save()
    return buffer.getvalue()
