from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.whatsapp import normalize_whatsapp_number
from models import (
    Campaign,
    CampaignInteraction,
    CampaignLog,
    Client,
    ServiceOrder,
)

CAMPAIGN_REFERENCE_TYPE = "campaign"
CONVERSION_WINDOW_DAYS = 30
INTERACTION_DELIVERED = "delivered"
INTERACTION_READ = "read"
INTERACTION_BUDGET_CREATED = "budget_created"
INTERACTION_OS_CLOSED = "os_closed"

VALID_INTERACTION_TYPES = frozenset(
    {
        INTERACTION_DELIVERED,
        INTERACTION_READ,
        INTERACTION_BUDGET_CREATED,
        INTERACTION_OS_CLOSED,
    }
)


def build_campaign_message_metadata(campaign_id: int, client_id: int) -> dict[str, Any]:
    return {"campaign_id": campaign_id, "client_id": client_id}


def _parse_ack_value(payload: dict[str, Any]) -> int | None:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    for block in (data, payload):
        if not isinstance(block, dict):
            continue
        raw = block.get("ack")
        if raw is None:
            raw = block.get("status")
        if isinstance(raw, int):
            return raw
        if isinstance(raw, str) and raw.isdigit():
            return int(raw)
    return None


def evolution_campaign_interaction_from_webhook(payload: dict[str, Any]) -> str | None:
    """Eventos Evolution: message.ack (ack=2 entregue) e message.read."""
    event_name = str(payload.get("event") or payload.get("type") or "").lower().replace("_", ".")
    if event_name == "message.read":
        return INTERACTION_READ
    if event_name in ("message.ack", "messages.ack"):
        ack = _parse_ack_value(payload)
        if ack == 2:
            return INTERACTION_DELIVERED
        if ack is not None and ack >= 4:
            return INTERACTION_READ
        if ack is not None and ack >= 3:
            return INTERACTION_DELIVERED
    return None


def metadata_from_evolution_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    for block in (payload, payload.get("data") if isinstance(payload.get("data"), dict) else {}):
        if not isinstance(block, dict):
            continue
        for key in ("metadata", "customData", "custom_data"):
            raw = block.get(key)
            if isinstance(raw, dict):
                return raw
    return None


def resolve_campaign_client_id(
    db: Session,
    *,
    campaign_id: int,
    recipient_whatsapp: str,
    metadata: dict[str, Any] | None = None,
) -> int | None:
    if metadata:
        raw = metadata.get("client_id")
        if raw is not None:
            try:
                return int(raw)
            except (TypeError, ValueError):
                pass
    norm = normalize_whatsapp_number(recipient_whatsapp)
    rows = db.execute(
        select(CampaignLog.client_id, Client.whatsapp, Client.phone)
        .join(Client, Client.id == CampaignLog.client_id)
        .where(
            CampaignLog.campaign_id == campaign_id,
            CampaignLog.client_id.isnot(None),
            CampaignLog.status == "sent",
        )
    ).all()
    for client_id, whatsapp, phone in rows:
        for raw in (whatsapp, phone):
            if raw and normalize_whatsapp_number(raw) == norm:
                return int(client_id)
    return None


def find_last_campaign_for_client(
    db: Session,
    *,
    client_id: int,
    tenant_id: int | None = None,
    within_days: int = CONVERSION_WINDOW_DAYS,
) -> int | None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=within_days)
    stmt = (
        select(CampaignLog.campaign_id)
        .join(Campaign, Campaign.id == CampaignLog.campaign_id)
        .where(
            CampaignLog.client_id == client_id,
            CampaignLog.status == "sent",
            CampaignLog.sent_at.isnot(None),
            CampaignLog.sent_at >= cutoff,
            Campaign.status != "draft",
        )
        .order_by(CampaignLog.sent_at.desc(), CampaignLog.id.desc())
        .limit(1)
    )
    if tenant_id is not None:
        stmt = stmt.where(Campaign.tenant_id == tenant_id)
    row = db.execute(stmt).scalar_one_or_none()
    return int(row) if row is not None else None


def record_campaign_interaction(
    db: Session,
    *,
    campaign_id: int,
    client_id: int | None,
    interaction_type: str,
    dedupe: bool = True,
) -> CampaignInteraction | None:
    if client_id is None or interaction_type not in VALID_INTERACTION_TYPES:
        return None
    if dedupe:
        existing = db.execute(
            select(CampaignInteraction.id).where(
                CampaignInteraction.campaign_id == campaign_id,
                CampaignInteraction.client_id == client_id,
                CampaignInteraction.interaction_type == interaction_type,
            )
        ).scalar_one_or_none()
        if existing is not None:
            return None
    row = CampaignInteraction(
        campaign_id=campaign_id,
        client_id=client_id,
        interaction_type=interaction_type,
    )
    db.add(row)
    return row


def link_conversion_to_campaign(
    db: Session,
    *,
    client_id: int,
    interaction_type: str,
    tenant_id: int | None = None,
) -> CampaignInteraction | None:
    """Associa orçamento/OS à última campanha enviada ao cliente (janela de 30 dias)."""
    if interaction_type not in (INTERACTION_BUDGET_CREATED, INTERACTION_OS_CLOSED):
        return None
    campaign_id = find_last_campaign_for_client(db, client_id=client_id, tenant_id=tenant_id)
    if campaign_id is None:
        return None
    return record_campaign_interaction(
        db,
        campaign_id=campaign_id,
        client_id=client_id,
        interaction_type=interaction_type,
    )


def record_campaign_interaction_from_job(
    db: Session,
    *,
    job_reference_type: str | None,
    job_reference_id: int | None,
    recipient_whatsapp: str,
    interaction_type: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    if job_reference_type != CAMPAIGN_REFERENCE_TYPE or not job_reference_id:
        return
    client_id = resolve_campaign_client_id(
        db,
        campaign_id=int(job_reference_id),
        recipient_whatsapp=recipient_whatsapp,
        metadata=metadata,
    )
    if client_id is None:
        log = db.execute(
            select(CampaignLog.client_id)
            .where(
                CampaignLog.campaign_id == int(job_reference_id),
                CampaignLog.recipient_whatsapp == normalize_whatsapp_number(recipient_whatsapp),
            )
            .order_by(CampaignLog.id.desc())
            .limit(1)
        ).scalar_one_or_none()
        client_id = int(log) if log is not None else None
    record_campaign_interaction(
        db,
        campaign_id=int(job_reference_id),
        client_id=client_id,
        interaction_type=interaction_type,
    )


def process_evolution_campaign_webhook(
    db: Session,
    *,
    tenant_id: int,
    payload: dict[str, Any],
    job_reference_type: str | None,
    job_reference_id: int | None,
    recipient_whatsapp: str,
) -> str | None:
    interaction = evolution_campaign_interaction_from_webhook(payload)
    if interaction is None:
        return None
    record_campaign_interaction_from_job(
        db,
        job_reference_type=job_reference_type,
        job_reference_id=job_reference_id,
        recipient_whatsapp=recipient_whatsapp,
        interaction_type=interaction,
        metadata=metadata_from_evolution_payload(payload),
    )
    return interaction


def _distinct_interaction_count(db: Session, *, campaign_id: int, interaction_type: str) -> int:
    subq = (
        select(CampaignInteraction.client_id)
        .where(
            CampaignInteraction.campaign_id == campaign_id,
            CampaignInteraction.interaction_type == interaction_type,
            CampaignInteraction.client_id.isnot(None),
        )
        .distinct()
    )
    return int(db.execute(select(func.count()).select_from(subq.subquery())).scalar_one() or 0)


def _converted_clients_list(db: Session, *, campaign_id: int) -> list[dict[str, Any]]:
    rows = db.execute(
        select(CampaignInteraction, Client.name)
        .join(Client, Client.id == CampaignInteraction.client_id)
        .where(
            CampaignInteraction.campaign_id == campaign_id,
            CampaignInteraction.interaction_type.in_(
                (INTERACTION_OS_CLOSED, INTERACTION_BUDGET_CREATED)
            ),
            CampaignInteraction.client_id.isnot(None),
        )
        .order_by(CampaignInteraction.timestamp.desc())
    ).all()
    seen: set[int] = set()
    out: list[dict[str, Any]] = []
    for interaction, client_name in rows:
        cid = int(interaction.client_id)
        if cid in seen:
            continue
        seen.add(cid)
        order = db.execute(
            select(ServiceOrder)
            .where(ServiceOrder.client_id == cid)
            .order_by(ServiceOrder.opened_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        out.append(
            {
                "client_id": cid,
                "client_name": client_name,
                "interaction_type": interaction.interaction_type,
                "interaction_at": interaction.timestamp,
                "service_order_id": order.id if order else None,
                "service_order_title": order.title if order else None,
            }
        )
    return out


def get_campaign_analytics(db: Session, *, tenant_id: int, campaign_id: int) -> dict[str, Any]:
    campaign = db.execute(
        select(Campaign)
        .where(Campaign.tenant_id == tenant_id, Campaign.id == campaign_id)
        .options(selectinload(Campaign.logs))
    ).scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campanha não encontrada.")

    total_enviados = int(
        db.execute(
            select(func.count())
            .select_from(CampaignLog)
            .where(CampaignLog.campaign_id == campaign_id, CampaignLog.status == "sent")
        ).scalar_one()
        or 0
    )
    total_lidos = _distinct_interaction_count(db, campaign_id=campaign_id, interaction_type=INTERACTION_READ)
    total_orcamentos = _distinct_interaction_count(
        db, campaign_id=campaign_id, interaction_type=INTERACTION_BUDGET_CREATED
    )
    total_os_fechadas = _distinct_interaction_count(
        db, campaign_id=campaign_id, interaction_type=INTERACTION_OS_CLOSED
    )
    total_delivered = _distinct_interaction_count(
        db, campaign_id=campaign_id, interaction_type=INTERACTION_DELIVERED
    )
    clientes_convertidos = _converted_clients_list(db, campaign_id=campaign_id)
    conversion_rate = round((total_os_fechadas / total_enviados) * 100, 2) if total_enviados > 0 else 0.0

    return {
        "campaign_id": campaign.id,
        "campaign_name": campaign.name,
        "campaign_created_at": campaign.created_at,
        "total_enviados": total_enviados,
        "total_lidos": total_lidos,
        "total_orcamentos": total_orcamentos,
        "total_os_fechadas": total_os_fechadas,
        "conversion_rate": conversion_rate,
        "conversion_window_days": CONVERSION_WINDOW_DAYS,
        "clientes_convertidos": clientes_convertidos,
        # aliases legados (front-end anterior)
        "total_sent": total_enviados,
        "total_read": total_lidos,
        "total_budgets": total_orcamentos,
        "total_conversion": total_os_fechadas,
        "total_delivered": total_delivered,
        "converted_clients": [
            {
                "client_id": c["client_id"],
                "client_name": c["client_name"],
                "service_order_id": c["service_order_id"] or 0,
                "service_order_title": c["service_order_title"] or "",
                "closed_at": c["interaction_at"],
            }
            for c in clientes_convertidos
        ],
        "funnel": {
            "sent": total_enviados,
            "delivered": total_delivered,
            "read": total_lidos,
            "os_closed": total_os_fechadas,
        },
    }


def compare_campaigns_analytics(
    db: Session,
    *,
    tenant_id: int,
    campaign_ids: list[int] | None = None,
    limit: int = 12,
) -> list[dict[str, Any]]:
    stmt = (
        select(Campaign.id, Campaign.name)
        .where(Campaign.tenant_id == tenant_id, Campaign.status != "draft")
        .order_by(Campaign.created_at.desc(), Campaign.id.desc())
    )
    if campaign_ids:
        stmt = stmt.where(Campaign.id.in_(campaign_ids))
    rows = list(db.execute(stmt.limit(max(1, min(limit, 24)))).all())
    rows.reverse()
    out: list[dict[str, Any]] = []
    for cid, cname in rows:
        stats = get_campaign_analytics(db, tenant_id=tenant_id, campaign_id=int(cid))
        out.append(
            {
                "campaign_id": stats["campaign_id"],
                "campaign_name": cname or stats["campaign_name"],
                "conversion_rate": stats["conversion_rate"],
                "total_sent": stats["total_enviados"],
                "total_conversion": stats["total_os_fechadas"],
            }
        )
    return out
