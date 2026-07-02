"""Relatório executivo do portfólio PMOC (consolidado)."""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from urllib.request import urlopen

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

from app.pmoc_analytics import PmocPortfolioSummaryResult


def _status_label(status: str) -> str:
    labels = {
        "draft": "Rascunho",
        "active": "Ativa",
        "inactive": "Inativa",
        "archived": "Arquivada",
    }
    return labels.get((status or "").strip().lower(), status or "—")


def _try_read_remote_image(url: str | None) -> ImageReader | None:
    if not url:
        return None
    try:
        with urlopen(url, timeout=4) as response:
            blob = response.read()
        if not blob:
            return None
        return ImageReader(BytesIO(blob))
    except Exception:
        return None


def build_pmoc_portfolio_report_pdf(
    summary: PmocPortfolioSummaryResult,
    *,
    generated_by_name: str | None = None,
    logo_url: str | None = None,
    signature_url: str | None = None,
    legal_validation_note: str | None = None,
) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin_x = 14 * mm
    content_w = width - (2 * margin_x)
    y = height - 18 * mm

    def ensure_space(h: float) -> None:
        nonlocal y
        if y - h < 16 * mm:
            c.showPage()
            y = height - 18 * mm

    logo = _try_read_remote_image(logo_url)
    if logo is not None:
        logo_h = 15 * mm
        c.drawImage(logo, margin_x, y - logo_h + 2 * mm, 30 * mm, logo_h, preserveAspectRatio=True, mask="auto")
        text_x = margin_x + 33 * mm
    else:
        text_x = margin_x

    c.setFillColor(colors.HexColor("#0F172A"))
    c.setFont("Helvetica-Bold", 14)
    c.drawString(text_x, y, "Relatório Executivo — Portfólio PMOC")
    y -= 6 * mm
    c.setFillColor(colors.HexColor("#475569"))
    c.setFont("Helvetica", 8.2)
    emitted_at = summary.generated_at.astimezone().strftime("%d/%m/%Y %H:%M")
    emitter = (generated_by_name or "").strip() or "Usuário autenticado"
    c.drawString(text_x, y, f"Emitido em: {emitted_at} · Responsável: {emitter}")
    y -= 8 * mm

    kpi_rows = [
        ["PMOCs no escopo", str(summary.total_plans)],
        ["PMOCs ativos", str(summary.active_plans)],
        ["Score médio de conformidade", f"{summary.avg_conformity_score}%"],
        ["PMOCs críticos", str(summary.critical_plans_count)],
        ["Ocorrências em aberto", str(summary.total_open_occurrences)],
    ]
    kpi_table = Table(kpi_rows, colWidths=[74 * mm, content_w - 74 * mm])
    kpi_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.2),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F8FAFC")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    _tw, th = kpi_table.wrap(content_w, height)
    ensure_space(th + 6 * mm)
    kpi_table.drawOn(c, margin_x, y - th)
    y -= th + 8 * mm

    c.setFillColor(colors.HexColor("#0F172A"))
    c.setFont("Helvetica-Bold", 10)
    c.drawString(margin_x, y, "Ranking por cliente (prioridade)")
    y -= 5 * mm
    client_rows = [["Cliente", "Planos", "Score médio", "Ocorrências"]]
    if summary.client_ranking:
        for row in summary.client_ranking:
            client_rows.append(
                [row.client_name, str(row.plans_count), f"{row.avg_conformity_score}%", str(row.open_occurrences)]
            )
    else:
        client_rows.append(["Sem dados", "—", "—", "—"])
    client_table = Table(client_rows, colWidths=[74 * mm, 24 * mm, 30 * mm, content_w - 128 * mm], repeatRows=1)
    client_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.8),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    _tw, th = client_table.wrap(content_w, height)
    ensure_space(th + 8 * mm)
    client_table.drawOn(c, margin_x, y - th)
    y -= th + 9 * mm

    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor("#0F172A"))
    c.drawString(margin_x, y, "Unidades PMOC prioritárias para ação")
    y -= 5 * mm
    plan_rows = [["PMOC", "Cliente", "Status", "Score", "Medições", "Rastreio", "Ocorrências"]]
    if summary.plan_ranking:
        for row in summary.plan_ranking:
            plan_rows.append(
                [
                    row.establishment_name[:34],
                    row.client_name[:24],
                    _status_label(row.status),
                    f"{row.conformity_score}%",
                    f"{row.measurement_coverage_pct}%",
                    f"{row.consumable_traceability_pct}%",
                    str(row.open_occurrences),
                ]
            )
    else:
        plan_rows.append(["Sem dados", "—", "—", "—", "—", "—", "—"])
    plan_table = Table(
        plan_rows,
        colWidths=[40 * mm, 32 * mm, 18 * mm, 16 * mm, 16 * mm, 16 * mm, content_w - 138 * mm],
        repeatRows=1,
    )
    plan_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.2),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
                ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ]
        )
    )
    _tw, th = plan_table.wrap(content_w, height)
    ensure_space(th + 6 * mm)
    plan_table.drawOn(c, margin_x, y - th)

    signature = _try_read_remote_image(signature_url)
    signature_box_h = 20 * mm
    ensure_space(signature_box_h + 6 * mm)
    sig_y_top = y - 3 * mm
    c.setFillColor(colors.HexColor("#F8FAFC"))
    c.setStrokeColor(colors.HexColor("#CBD5E1"))
    c.roundRect(margin_x, sig_y_top - signature_box_h, content_w, signature_box_h, 2 * mm, stroke=1, fill=1)
    c.setFillColor(colors.HexColor("#0F172A"))
    c.setFont("Helvetica-Bold", 8.4)
    c.drawString(margin_x + 3 * mm, sig_y_top - 5 * mm, "Assinatura eletrônica de emissão")
    c.setFillColor(colors.HexColor("#475569"))
    c.setFont("Helvetica", 7.3)
    c.drawString(
        margin_x + 3 * mm,
        sig_y_top - 9.2 * mm,
        f"Emitido por {emitter} em {emitted_at}. Documento consolidado para envio executivo.",
    )
    if signature is not None:
        c.drawImage(
            signature,
            margin_x + content_w - 42 * mm,
            sig_y_top - signature_box_h + 2.5 * mm,
            38 * mm,
            signature_box_h - 6 * mm,
            preserveAspectRatio=True,
            mask="auto",
        )
    else:
        c.setFillColor(colors.HexColor("#64748B"))
        c.drawRightString(margin_x + content_w - 4 * mm, sig_y_top - 9.2 * mm, "Assinatura visual indisponível")
    legal_note = (
        (legal_validation_note or "").strip()
        or "ICP-Brasil / plataforma homologada de assinatura eletrônica (conforme configuração do tenant)."
    )
    c.setFillColor(colors.HexColor("#334155"))
    c.setFont("Helvetica", 7.2)
    c.drawString(margin_x + 3 * mm, sig_y_top - 13.7 * mm, f"Validação jurídica: {legal_note[:150]}")

    c.setFillColor(colors.HexColor("#64748B"))
    c.setFont("Helvetica", 7.1)
    c.drawRightString(width - margin_x, 8 * mm, f"Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    c.save()
    return buffer.getvalue()
