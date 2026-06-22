from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.campaign_analytics import build_campaign_message_metadata
from app.campaign_send_speed import pick_delay_seconds
from app.preventive_maintenance import client_whatsapp_destination
from app.tenant_logo import delete_tenant_logo_if_exists, process_and_upload_tenant_logo
from app.whatsapp import (
    _resolve_tenant_instance,
    append_event,
    create_message_job,
    dispatch_plain_whatsapp,
    evolution_send_media_message,
    normalize_whatsapp_number,
)
from models import (
    Campaign,
    CampaignAsset,
    CampaignExternalLead,
    CampaignLog,
    Client,
    OrderStatus,
    ServiceOrder,
    Tenant,
    User,
    WhatsappMessageStatus,
)

SEGMENT_INACTIVE_SINCE = "inactive_since"
REFERENCE_TYPE = "campaign"


@dataclass
class CampaignRecipient:
    source: Literal["client", "external"]
    name: str
    phone: str
    client: Client | None = None
    external_lead: CampaignExternalLead | None = None


def _json_loads(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return default


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _render_message(template: str, *, tenant: Tenant, client: Client) -> str:
    return _render_message_for_name(template, tenant=tenant, name=client.name or "cliente")


def _render_message_for_name(template: str, *, tenant: Tenant, name: str) -> str:
    display = (name or "cliente").strip() or "cliente"
    return (
        (template or "")
        .replace("{nome_cliente}", display)
        .replace("{cliente}", display)
        .replace("{empresa}", tenant.name or "")
        .strip()
    )


def _load_external_leads(
    db: Session,
    *,
    tenant_id: int,
    external_lead_ids: list[int] | None,
    import_batch_id: str | None,
) -> list[CampaignExternalLead]:
    ids = sorted({int(x) for x in (external_lead_ids or []) if int(x) > 0})
    stmt = select(CampaignExternalLead).where(CampaignExternalLead.tenant_id == tenant_id)
    if ids:
        stmt = stmt.where(CampaignExternalLead.id.in_(ids))
    elif import_batch_id:
        stmt = stmt.where(CampaignExternalLead.import_batch_id == import_batch_id.strip())
    else:
        return []
    return list(db.execute(stmt.order_by(CampaignExternalLead.id.asc())).scalars().all())


def build_campaign_recipients(
    db: Session,
    *,
    tenant_id: int,
    selection_mode: str,
    client_ids: list[int] | None,
    inactive_days: int | None,
    segment_params: dict[str, Any] | None,
    external_lead_ids: list[int] | None = None,
    import_batch_id: str | None = None,
) -> list[CampaignRecipient]:
    """Combina clientes oficiais + leads externos sem duplicar por telefone (prioriza cliente)."""
    by_phone: dict[str, CampaignRecipient] = {}

    if selection_mode == "manual":
        ids = [int(x) for x in (client_ids or []) if int(x) > 0]
        if ids:
            rows = db.execute(manual_clients_query(db, tenant_id=tenant_id, client_ids=ids)).all()
            for client, _last in rows:
                ok, dest = client_whatsapp_destination(client)
                if not ok or not dest:
                    continue
                phone = normalize_whatsapp_number(dest)
                by_phone[phone] = CampaignRecipient(
                    source="client", name=client.name or "cliente", phone=phone, client=client
                )
    else:
        params = segment_params or {}
        if inactive_days is not None:
            params = {**params, "inactive_days": inactive_days}
        rows = db.execute(
            segmented_clients_query(
                db, tenant_id=tenant_id, segment_kind=SEGMENT_INACTIVE_SINCE, segment_params=params
            )
        ).all()
        for client, _last in rows:
            ok, dest = client_whatsapp_destination(client)
            if not ok or not dest:
                continue
            phone = normalize_whatsapp_number(dest)
            by_phone[phone] = CampaignRecipient(
                source="client", name=client.name or "cliente", phone=phone, client=client
            )

    for lead in _load_external_leads(
        db,
        tenant_id=tenant_id,
        external_lead_ids=external_lead_ids,
        import_batch_id=import_batch_id,
    ):
        if lead.phone in by_phone:
            continue
        by_phone[lead.phone] = CampaignRecipient(
            source="external",
            name=lead.name,
            phone=lead.phone,
            external_lead=lead,
        )

    return list(by_phone.values())


def segmented_clients_query(
    db: Session,
    *,
    tenant_id: int,
    segment_kind: str,
    segment_params: dict[str, Any],
):
    respect_opt_out = bool(segment_params.get("respect_preventive_opt_out", True))
    base = [
        Client.tenant_id == tenant_id,
        Client.is_active.is_(True),
        or_(Client.whatsapp.isnot(None), Client.phone.isnot(None)),
    ]
    if respect_opt_out:
        base.append(Client.preventive_campaign_opt_out.is_(False))

    if segment_kind != SEGMENT_INACTIVE_SINCE:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="segment_kind inválido.")

    days = max(1, min(int(segment_params.get("inactive_days") or 180), 3650))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    last_os_sq = (
        select(
            ServiceOrder.client_id.label("client_id"),
            func.max(ServiceOrder.closed_at).label("last_service_at"),
        )
        .where(
            ServiceOrder.tenant_id == tenant_id,
            ServiceOrder.status == OrderStatus.DONE,
            ServiceOrder.closed_at.isnot(None),
        )
        .group_by(ServiceOrder.client_id)
        .subquery()
    )
    return (
        select(Client, last_os_sq.c.last_service_at)
        .outerjoin(last_os_sq, last_os_sq.c.client_id == Client.id)
        .where(*base)
        .where(or_(last_os_sq.c.last_service_at.is_(None), last_os_sq.c.last_service_at < cutoff))
        .order_by(last_os_sq.c.last_service_at.asc().nullsfirst(), Client.name.asc())
    )


def manual_clients_query(db: Session, *, tenant_id: int, client_ids: list[int]):
    ids = sorted({int(x) for x in client_ids if int(x) > 0})
    if not ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Selecione ao menos um cliente.")
    return (
        select(Client, func.cast(None, ServiceOrder.closed_at.type).label("last_service_at"))
        .where(
            Client.tenant_id == tenant_id,
            Client.id.in_(ids),
            Client.is_active.is_(True),
            or_(Client.whatsapp.isnot(None), Client.phone.isnot(None)),
        )
        .order_by(Client.name.asc())
    )


def list_segmented_clients(
    db: Session,
    *,
    tenant_id: int,
    segment_kind: str = SEGMENT_INACTIVE_SINCE,
    segment_params: dict[str, Any] | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    params = segment_params or {}
    stmt = segmented_clients_query(db, tenant_id=tenant_id, segment_kind=segment_kind, segment_params=params)
    count_sq = stmt.with_only_columns(Client.id).order_by(None).subquery()
    total = int(db.execute(select(func.count()).select_from(count_sq)).scalar_one() or 0)
    rows = db.execute(stmt.limit(max(1, min(limit, 500)))).all()
    clients = []
    for client, last_service_at in rows:
        ok, dest = client_whatsapp_destination(client)
        last_service_date = last_service_at.date() if isinstance(last_service_at, datetime) else last_service_at
        clients.append(
            {
                "id": client.id,
                "name": client.name,
                "whatsapp_ok": ok,
                "whatsapp_preview": (dest[:6] + "…") if dest and len(dest) > 8 else dest,
                "data_ultimo_servico": last_service_date,
            }
        )
    return {"total": total, "clients": clients}


def campaign_to_out(row: Campaign) -> dict[str, Any]:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "name": row.name,
        "message_template": row.message_template,
        "status": row.status,
        "scheduled_at": row.scheduled_at,
        "segment_kind": row.segment_kind,
        "segment_params": _json_loads(row.segment_params_json, {}),
        "asset_id": row.asset_id,
        "asset_url": row.asset.url if row.asset else None,
        "asset_content_type": row.asset.content_type if row.asset else None,
        "total_contacts": row.total_contacts,
        "sent_count": row.sent_count,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def create_campaign(db: Session, *, tenant_id: int, user: User, payload: dict[str, Any]) -> dict[str, Any]:
    name = str(payload.get("name") or "").strip()
    msg = str(payload.get("message_template") or "").strip()
    if len(name) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Informe o nome da campanha.")
    if len(msg) < 5:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Mensagem muito curta.")
    segment_kind = str(payload.get("segment_kind") or SEGMENT_INACTIVE_SINCE)
    if segment_kind not in (SEGMENT_INACTIVE_SINCE, "manual"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="segment_kind inválido.")
    params = payload.get("segment_params") if isinstance(payload.get("segment_params"), dict) else {}
    asset_id = payload.get("asset_id")
    row = Campaign(
        tenant_id=tenant_id,
        name=name,
        message_template=msg,
        status=str(payload.get("status") or "draft"),
        scheduled_at=payload.get("scheduled_at"),
        segment_kind=segment_kind,
        segment_params_json=_json_dumps(params),
        asset_id=int(asset_id) if asset_id else None,
        created_by_user_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return campaign_to_out(row)


def list_campaigns(db: Session, *, tenant_id: int) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Campaign)
        .where(Campaign.tenant_id == tenant_id)
        .order_by(Campaign.created_at.desc(), Campaign.id.desc())
    ).scalars().all()
    return [campaign_to_out(row) for row in rows]


def get_campaign(db: Session, *, tenant_id: int, campaign_id: int) -> Campaign:
    row = db.execute(
        select(Campaign)
        .where(Campaign.tenant_id == tenant_id, Campaign.id == campaign_id)
        .options(selectinload(Campaign.asset))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campanha não encontrada.")
    return row


def preview_campaign(db: Session, *, tenant_id: int, campaign_id: int) -> dict[str, Any]:
    campaign = get_campaign(db, tenant_id=tenant_id, campaign_id=campaign_id)
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    params = _json_loads(campaign.segment_params_json, {})
    if campaign.segment_kind == "manual":
        client_ids = [int(x) for x in params.get("client_ids", []) if str(x).isdigit()]
        rows = db.execute(manual_clients_query(db, tenant_id=tenant_id, client_ids=client_ids)).all() if client_ids else []
        clients = []
        for client, last_service_date in rows:
            ok, dest = client_whatsapp_destination(client)
            clients.append(
                {
                    "id": client.id,
                    "name": client.name,
                    "whatsapp_ok": ok,
                    "whatsapp_preview": (dest[:6] + "…") if dest and len(dest) > 8 else dest,
                    "data_ultimo_servico": last_service_date,
                    "message_preview": _render_message(campaign.message_template, tenant=tenant, client=client)[:300],
                }
            )
        return {"total": len(clients), "clients": clients}
    result = list_segmented_clients(
        db,
        tenant_id=tenant_id,
        segment_kind=campaign.segment_kind,
        segment_params=params,
        limit=20,
    )
    for item in result["clients"]:
        client = db.get(Client, int(item["id"]))
        if client:
            item["message_preview"] = _render_message(campaign.message_template, tenant=tenant, client=client)[:300]
    return result


def preview_recipients(
    db: Session,
    *,
    tenant_id: int,
    selection_mode: str,
    client_ids: list[int] | None,
    inactive_days: int | None,
    message_template: str = "",
    external_lead_ids: list[int] | None = None,
    import_batch_id: str | None = None,
    send_speed: str | None = None,
) -> dict[str, Any]:
    from app.campaign_send_speed import estimate_duration_seconds

    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    days = int(inactive_days) if inactive_days else 180
    recipients = build_campaign_recipients(
        db,
        tenant_id=tenant_id,
        selection_mode=selection_mode,
        client_ids=client_ids,
        inactive_days=days,
        segment_params={"inactive_days": days, "respect_preventive_opt_out": True},
        external_lead_ids=external_lead_ids,
        import_batch_id=import_batch_id,
    )
    if not recipients and selection_mode == "manual" and not (external_lead_ids or import_batch_id):
        return {"total": 0, "clients": [], "selection_mode": selection_mode}

    clients_out: list[dict[str, Any]] = []
    for recipient in recipients[:500]:
        preview_phone = (
            f"{recipient.phone[:4]}…{recipient.phone[-4:]}" if len(recipient.phone) > 8 else recipient.phone
        )
        item: dict[str, Any] = {
            "id": recipient.client.id if recipient.client else -(recipient.external_lead.id if recipient.external_lead else 0),
            "name": recipient.name,
            "whatsapp_ok": True,
            "whatsapp_preview": preview_phone,
            "source": recipient.source,
            "external_lead_id": recipient.external_lead.id if recipient.external_lead else None,
            "data_ultimo_servico": None,
        }
        if message_template:
            item["message_preview"] = _render_message_for_name(message_template, tenant=tenant, name=recipient.name)[
                :300
            ]
        clients_out.append(item)

    official_count = sum(1 for r in recipients if r.source == "client")
    external_count = sum(1 for r in recipients if r.source == "external")
    return {
        "total": len(recipients),
        "clients": clients_out,
        "selection_mode": selection_mode,
        "official_count": official_count,
        "external_count": external_count,
        "estimated_duration_seconds": estimate_duration_seconds(len(recipients), send_speed),
    }


def delete_campaign_asset(db: Session, *, tenant_id: int, asset_id: int) -> dict[str, Any]:
    row = db.execute(
        select(CampaignAsset).where(CampaignAsset.tenant_id == tenant_id, CampaignAsset.id == asset_id)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imagem da campanha não encontrada.")
    s3_key = row.s3_key
    db.execute(
        Campaign.__table__.update()
        .where(Campaign.tenant_id == tenant_id, Campaign.asset_id == asset_id)
        .values(asset_id=None)
    )
    db.delete(row)
    db.commit()
    if s3_key:
        try:
            delete_tenant_logo_if_exists(s3_key, db=db)
        except Exception:
            pass
    return {"deleted": True, "asset_id": asset_id}


def upload_campaign_asset(
    db: Session,
    *,
    tenant_id: int,
    user: User,
    file_bytes: bytes,
    source_filename: str | None,
) -> dict[str, Any]:
    uploaded = process_and_upload_tenant_logo(
        tenant_id=tenant_id,
        file_bytes=file_bytes,
        source_filename=source_filename,
        db=db,
        key_prefix=f"campaign-assets/tenant-{tenant_id}",
    )
    row = CampaignAsset(
        tenant_id=tenant_id,
        url=uploaded.public_url,
        s3_key=uploaded.s3_key,
        content_type=uploaded.content_type,
        original_filename=(source_filename or "upload")[:180],
        size_bytes=uploaded.size_bytes,
        created_by_user_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "url": row.url,
        "content_type": row.content_type,
        "s3_key": row.s3_key,
    }


def _coerce_scheduled_at(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str) and value.strip():
        raw = value.strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(raw)
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def initiate_campaign_run(
    db: Session,
    *,
    tenant_id: int,
    campaign_id: int,
    user: User,
    selection_mode: str = "automatic",
    client_ids: list[int] | None = None,
    inactive_days: int | None = None,
    external_lead_ids: list[int] | None = None,
    import_batch_id: str | None = None,
    send_speed: str | None = "fast",
    scheduled_at: datetime | None = None,
) -> dict[str, Any]:
    """Cria o registro da campanha em execução (sem enviar mensagens ainda)."""
    from app.campaign_send_speed import estimate_duration_seconds

    template = get_campaign(db, tenant_id=tenant_id, campaign_id=campaign_id)
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")

    params = _json_loads(template.segment_params_json, {})
    if inactive_days is not None:
        params["inactive_days"] = inactive_days
    recipients = build_campaign_recipients(
        db,
        tenant_id=tenant_id,
        selection_mode=selection_mode,
        client_ids=client_ids,
        inactive_days=inactive_days,
        segment_params=params,
        external_lead_ids=external_lead_ids,
        import_batch_id=import_batch_id,
    )
    if not recipients:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nenhum destinatário válido. Selecione clientes e/ou importe uma lista.",
        )

    run_segment_kind = "manual" if selection_mode == "manual" else SEGMENT_INACTIVE_SINCE
    run_params: dict[str, Any] = {
        "client_ids": [int(x) for x in (client_ids or [])],
        "external_lead_ids": [int(x) for x in (external_lead_ids or [])],
        "import_batch_id": import_batch_id,
        "send_speed": send_speed,
        "selection_mode": selection_mode,
    }
    if selection_mode != "manual":
        run_params.update(params)

    now = datetime.now(timezone.utc)
    scheduled_dt = _coerce_scheduled_at(scheduled_at)
    is_scheduled = scheduled_dt is not None and scheduled_dt > now

    campaign = Campaign(
        tenant_id=tenant_id,
        name=template.name,
        message_template=template.message_template,
        status="scheduled" if is_scheduled else "running",
        scheduled_at=scheduled_dt if is_scheduled else None,
        segment_kind=run_segment_kind,
        segment_params_json=_json_dumps(run_params),
        asset_id=template.asset_id,
        created_by_user_id=user.id,
    )
    campaign.total_contacts = len(recipients)
    campaign.sent_count = 0
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    return {
        "campaign": campaign_to_out(campaign),
        "campaign_id": campaign.id,
        "total_recipients": len(recipients),
        "estimated_duration_seconds": estimate_duration_seconds(len(recipients), send_speed),
        "send_speed": send_speed,
        "status": campaign.status,
        "scheduled_at": campaign.scheduled_at,
        "async_dispatch": not is_scheduled,
    }


def execute_campaign_dispatch(
    db: Session,
    *,
    campaign_id: int,
    tenant_id: int,
    user_id: int,
) -> dict[str, Any]:
    """Loop de envio com anti-ban (delay dinâmico). Atualiza sent_count a cada mensagem."""
    from app.campaign_send_speed import estimate_duration_seconds, pick_delay_seconds

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")

    campaign = get_campaign(db, tenant_id=tenant_id, campaign_id=campaign_id)
    if campaign.status != "running":
        return {
            "campaign": campaign_to_out(campaign),
            "sent": campaign.sent_count,
            "failed": 0,
            "total_recipients": campaign.total_contacts,
            "send_speed": None,
        }

    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")

    run_params = _json_loads(campaign.segment_params_json, {})
    selection_mode = str(run_params.get("selection_mode") or ("manual" if campaign.segment_kind == "manual" else "automatic"))
    send_speed = str(run_params.get("send_speed") or "fast")

    recipients = build_campaign_recipients(
        db,
        tenant_id=tenant_id,
        selection_mode=selection_mode,
        client_ids=run_params.get("client_ids"),
        inactive_days=run_params.get("inactive_days"),
        segment_params=run_params,
        external_lead_ids=run_params.get("external_lead_ids"),
        import_batch_id=run_params.get("import_batch_id"),
    )
    if not recipients:
        campaign.status = "failed"
        db.add(campaign)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nenhum destinatário para disparo.",
        )

    instance = _resolve_tenant_instance(db, tenant_id)
    sent = 0
    failed = 0
    processed = 0
    for recipient in recipients:
        processed += 1
        log = CampaignLog(
            campaign_id=campaign.id,
            client_id=recipient.client.id if recipient.client else None,
            external_lead_id=recipient.external_lead.id if recipient.external_lead else None,
            recipient_whatsapp=recipient.phone,
            status="pending",
        )
        db.add(log)
        db.flush()

        body = _render_message_for_name(campaign.message_template, tenant=tenant, name=recipient.name)
        metadata_client_id = recipient.client.id if recipient.client else 0
        msg_metadata = build_campaign_message_metadata(campaign.id, metadata_client_id)
        if recipient.external_lead:
            msg_metadata["external_lead_id"] = recipient.external_lead.id

        try:
            if campaign.asset and campaign.asset.url:
                job = create_message_job(
                    db,
                    tenant_id=tenant_id,
                    created_by_user=user,
                    template_key="campaign_media",
                    recipient_whatsapp=recipient.phone,
                    rendered_message=body,
                    reference_type=REFERENCE_TYPE,
                    reference_id=campaign.id,
                    scheduled_for=None,
                )
                send_result = evolution_send_media_message(
                    instance,
                    recipient.phone,
                    caption=body,
                    media_url=campaign.asset.url,
                    mimetype=campaign.asset.content_type or "image/webp",
                    filename=campaign.asset.original_filename or "campanha.webp",
                    metadata=msg_metadata,
                )
                job.status = WhatsappMessageStatus.SENT
                job.provider_message_id = send_result.get("message_id")
                job.sent_at = datetime.now(timezone.utc)
                append_event(
                    db,
                    tenant_id=tenant_id,
                    event_type="sent",
                    payload=send_result.get("raw_response"),
                    job_id=job.id,
                )
                db.add(job)
                db.flush()
            else:
                dispatch_plain_whatsapp(
                    db,
                    tenant_id=tenant_id,
                    created_by_user=user,
                    recipient_whatsapp=recipient.phone,
                    message=body,
                    template_key="campaign",
                    reference_type=REFERENCE_TYPE,
                    reference_id=campaign.id,
                    metadata=msg_metadata,
                )
            log.status = "sent"
            log.sent_at = datetime.now(timezone.utc)
            sent += 1
        except Exception as exc:
            log.status = "failed"
            log.error_message = str(getattr(exc, "detail", exc))[:1000]
            failed += 1
        campaign.sent_count = sent
        db.add(log)
        db.add(campaign)
        db.commit()
        if processed < len(recipients):
            time.sleep(pick_delay_seconds(send_speed))

    campaign.status = "completed" if failed == 0 else ("failed" if sent == 0 else "completed_with_errors")
    campaign.sent_count = sent
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return {
        "campaign": campaign_to_out(campaign),
        "sent": sent,
        "failed": failed,
        "total_recipients": len(recipients),
        "estimated_duration_seconds": estimate_duration_seconds(len(recipients), send_speed),
        "send_speed": send_speed,
    }


def run_campaign(
    db: Session,
    *,
    tenant_id: int,
    campaign_id: int,
    user: User,
    selection_mode: str = "automatic",
    client_ids: list[int] | None = None,
    inactive_days: int | None = None,
    external_lead_ids: list[int] | None = None,
    import_batch_id: str | None = None,
    send_speed: str | None = "fast",
    scheduled_at: datetime | None = None,
) -> dict[str, Any]:
    """Disparo síncrono (bloqueia até concluir). Preferir initiate + background + polling no front."""
    started = initiate_campaign_run(
        db,
        tenant_id=tenant_id,
        campaign_id=campaign_id,
        user=user,
        selection_mode=selection_mode,
        client_ids=client_ids,
        inactive_days=inactive_days,
        external_lead_ids=external_lead_ids,
        import_batch_id=import_batch_id,
        send_speed=send_speed,
        scheduled_at=scheduled_at,
    )
    if started.get("status") == "scheduled":
        return {
            **started,
            "sent": 0,
            "failed": 0,
            "async_dispatch": False,
        }
    return execute_campaign_dispatch(
        db,
        campaign_id=int(started["campaign_id"]),
        tenant_id=tenant_id,
        user_id=user.id,
    )
