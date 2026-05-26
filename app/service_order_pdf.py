"""PDF de laudo / ordem de serviço com checklist e assinatura digital."""

from __future__ import annotations

import base64
import json
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

from app.service_order_meta import parse_checklist_items, parse_service_order_meta
from models import Client, ServiceOrder, Tenant


def _safe(value: str | None, fallback: str = "—") -> str:
    text = (value or "").strip()
    return text or fallback


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


def _checklist_status_label(status: str) -> str:
    s = (status or "").lower()
    if s in ("sim", "ok", "done"):
        return "OK"
    if s in ("nao", "not_ok", "fail"):
        return "Reprovado"
    return "N/A"


def build_service_order_pdf(*, order: ServiceOrder, client: Client | None, tenant: Tenant) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin_x = 18 * mm
    y = height - 22 * mm

    c.setFont("Helvetica-Bold", 14)
    c.drawString(margin_x, y, f"Ordem de Serviço #{order.id}")
    y -= 8 * mm
    c.setFont("Helvetica", 10)
    c.drawString(margin_x, y, _safe(tenant.name, "Climaris"))
    y -= 5 * mm
    c.drawString(margin_x, y, f"Cliente: {_safe(client.name if client else None)}")
    y -= 5 * mm
    c.drawString(margin_x, y, f"Título: {_safe(order.title)}")
    y -= 5 * mm
    c.drawString(margin_x, y, f"Status: {order.status.value if hasattr(order.status, 'value') else order.status}")
    y -= 8 * mm

    meta = parse_service_order_meta(order.description) or {}
    diag = _safe(str(meta.get("diagnosticoTecnico") or ""))
    if diag != "—":
        c.setFont("Helvetica-Bold", 10)
        c.drawString(margin_x, y, "Diagnóstico técnico")
        y -= 5 * mm
        c.setFont("Helvetica", 9)
        for line in _wrap_text(diag, 95):
            c.drawString(margin_x, y, line)
            y -= 4.5 * mm
        y -= 3 * mm

    checklist = parse_checklist_items(order.description)
    if checklist:
        c.setFont("Helvetica-Bold", 10)
        c.drawString(margin_x, y, "Checklist de verificação")
        y -= 6 * mm
        rows = [["Item", "Status", "Observação"]]
        for item in checklist:
            obs = ""
            if isinstance(meta.get("checklist"), list):
                for raw in meta["checklist"]:
                    if isinstance(raw, dict) and str(raw.get("id") or "") == str(item.get("id") or ""):
                        obs = _safe(str(raw.get("observacao") or ""), "")
                        break
            rows.append([
                _safe(item.get("descricao")),
                _checklist_status_label(str(item.get("status") or "")),
                obs or "—",
            ])
        table = Table(rows, colWidths=[95 * mm, 25 * mm, 55 * mm], repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("WORDWRAP", (0, 1), (0, -1), True),
                ]
            )
        )
        tw, th = table.wrapOn(c, width - 2 * margin_x, y)
        if y - th < 35 * mm:
            c.showPage()
            y = height - 22 * mm
        table.drawOn(c, margin_x, y - th)
        y -= th + 8 * mm

    sig_blob = _decode_data_url_image(meta.get("clientSignatureBase64") if isinstance(meta.get("clientSignatureBase64"), str) else None)
    sig_name = _safe(str(meta.get("clientSignatureName") or (client.name if client else "")), "Cliente")
    sig_at = _safe(str(meta.get("clientSignatureAt") or ""))
    sig_geo = meta.get("clientSignatureGeo") if isinstance(meta.get("clientSignatureGeo"), dict) else {}
    lat = sig_geo.get("lat")
    lng = sig_geo.get("lng")
    geo_label = "—"
    if lat is not None and lng is not None:
        try:
            geo_label = f"{float(lat):.5f}, {float(lng):.5f}"
        except (TypeError, ValueError):
            geo_label = "—"

    footer_y = 28 * mm
    if sig_blob:
        try:
            img = ImageReader(BytesIO(sig_blob))
            c.drawImage(img, margin_x, footer_y + 8 * mm, width=45 * mm, height=18 * mm, preserveAspectRatio=True, mask="auto")
        except Exception:
            pass

    c.setFont("Helvetica", 8)
    signed_line = f"Assinado digitalmente por {sig_name}"
    if sig_at and sig_at != "—":
        try:
            dt = datetime.fromisoformat(sig_at.replace("Z", "+00:00"))
            signed_line += f" em {dt.strftime('%d/%m/%Y %H:%M')}"
        except ValueError:
            signed_line += f" em {sig_at}"
    signed_line += f" — {geo_label}"
    c.drawString(margin_x, footer_y, signed_line)

    c.setFont("Helvetica-Oblique", 7)
    c.drawString(margin_x, footer_y - 4 * mm, "Documento gerado pelo Climaris — laudo técnico e checklist de execução.")

    c.save()
    buffer.seek(0)
    return buffer.getvalue()


def _wrap_text(text: str, max_chars: int) -> list[str]:
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
    return lines or [""]
