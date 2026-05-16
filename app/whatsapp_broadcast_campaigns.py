from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.preventive_maintenance import client_whatsapp_destination
from app.whatsapp import dispatch_plain_whatsapp
from models import (
    Budget,
    BudgetStatus,
    Client,
    OrderStatus,
    ServiceOrder,
    Tenant,
    User,
    WhatsappBroadcastCampaign,
    WhatsappBroadcastCampaignRun,
    WhatsappMessageJob,
)

SEGMENT_INACTIVE_NO_OS = "inactive_no_os_recent"
SEGMENT_OPEN_BUDGETS = "open_budgets"
REFERENCE_TYPE = "broadcast_campaign"

SegmentKind = Literal["inactive_no_os_recent", "open_budgets"]


def _json_loads(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return default


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _slugify(name: str) -> str:
    raw = unicodedata.normalize("NFD", (name or "").strip().lower())
    raw = "".join(ch for ch in raw if unicodedata.category(ch) != "Mn")
    cleaned = re.sub(r"[^a-z0-9_-]+", "-", raw)
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    if not cleaned:
        return "campanha"
    return cleaned[:80]


def _default_params(segment_kind: str) -> dict[str, Any]:
    if segment_kind == SEGMENT_INACTIVE_NO_OS:
        return {"inactive_days": 120, "respect_preventive_opt_out": True}
    if segment_kind == SEGMENT_OPEN_BUDGETS:
        return {"budget_older_days": 7, "statuses": ["sent"], "respect_preventive_opt_out": True}
    return {}


def _merge_params(segment_kind: str, params: dict[str, Any] | None) -> dict[str, Any]:
    base = _default_params(segment_kind)
    if params:
        base.update({k: v for k, v in params.items() if v is not None})
    return base


def _inactive_recipient_ids_subquery(tenant_id: int, inactive_days: int):
    cutoff = datetime.now(timezone.utc) - timedelta(days=int(inactive_days))
    recent_done = (
        select(ServiceOrder.client_id)
        .where(
            ServiceOrder.tenant_id == tenant_id,
            ServiceOrder.status == OrderStatus.DONE,
            ServiceOrder.closed_at.isnot(None),
            ServiceOrder.closed_at >= cutoff,
        )
        .distinct()
    )
    return recent_done


def _open_budget_client_ids_subquery(tenant_id: int, budget_older_days: int, statuses: list[str]):
    cutoff = datetime.now(timezone.utc) - timedelta(days=int(budget_older_days))
    status_enums = []
    for s in statuses:
        try:
            status_enums.append(BudgetStatus(s))
        except ValueError:
            continue
    if not status_enums:
        status_enums = [BudgetStatus.SENT]

    converted = exists(
        select(ServiceOrder.id).where(
            ServiceOrder.source_budget_id == Budget.id,
        )
    )

    return (
        select(Budget.client_id)
        .where(
            Budget.tenant_id == tenant_id,
            Budget.status.in_(status_enums),
            Budget.created_at <= cutoff,
            ~converted,
        )
        .distinct()
    )


def _client_base_filters(tenant_id: int, respect_opt_out: bool):
    conds = [
        Client.tenant_id == tenant_id,
        Client.is_active.is_(True),
        or_(Client.whatsapp.isnot(None), Client.phone.isnot(None)),
    ]
    if respect_opt_out:
        conds.append(Client.preventive_campaign_opt_out.is_(False))
    return conds


def query_campaign_clients(
    db: Session,
    *,
    tenant_id: int,
    segment_kind: str,
    segment_params: dict[str, Any],
    limit: int,
) -> list[Client]:
    respect = bool(segment_params.get("respect_preventive_opt_out", True))
    base = _client_base_filters(tenant_id, respect)

    if segment_kind == SEGMENT_INACTIVE_NO_OS:
        inactive_days = int(segment_params.get("inactive_days") or 120)
        recent = _inactive_recipient_ids_subquery(tenant_id, inactive_days)
        stmt = select(Client).where(*base, ~Client.id.in_(recent))
    elif segment_kind == SEGMENT_OPEN_BUDGETS:
        older = int(segment_params.get("budget_older_days") or 7)
        raw_statuses = segment_params.get("statuses") or ["sent"]
        if not isinstance(raw_statuses, list):
            raw_statuses = ["sent"]
        statuses = [str(x).strip() for x in raw_statuses if str(x).strip()]
        bc_ids = _open_budget_client_ids_subquery(tenant_id, older, statuses)
        stmt = select(Client).where(*base, Client.id.in_(bc_ids))
    else:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="segment_kind inválido.")

    stmt = stmt.order_by(Client.id.asc()).limit(max(1, min(limit, 2000)))
    return list(db.execute(stmt).scalars().all())


def count_campaign_clients(db: Session, *, tenant_id: int, segment_kind: str, segment_params: dict[str, Any]) -> int:
    respect = bool(segment_params.get("respect_preventive_opt_out", True))
    base = _client_base_filters(tenant_id, respect)
    if segment_kind == SEGMENT_INACTIVE_NO_OS:
        inactive_days = int(segment_params.get("inactive_days") or 120)
        recent = _inactive_recipient_ids_subquery(tenant_id, inactive_days)
        stmt = select(func.count(Client.id)).where(*base, ~Client.id.in_(recent))
    elif segment_kind == SEGMENT_OPEN_BUDGETS:
        older = int(segment_params.get("budget_older_days") or 7)
        raw_statuses = segment_params.get("statuses") or ["sent"]
        if not isinstance(raw_statuses, list):
            raw_statuses = ["sent"]
        statuses = [str(x).strip() for x in raw_statuses if str(x).strip()]
        bc_ids = _open_budget_client_ids_subquery(tenant_id, older, statuses)
        stmt = select(func.count(Client.id)).where(*base, Client.id.in_(bc_ids))
    else:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="segment_kind inválido.")
    return int(db.execute(stmt).scalar_one() or 0)


def _has_recent_campaign_job(
    db: Session,
    *,
    tenant_id: int,
    campaign_id: int,
    recipient: str,
    cooldown_days: int,
) -> bool:
    if cooldown_days <= 0:
        return False
    since = datetime.now(timezone.utc) - timedelta(days=cooldown_days)
    n = db.execute(
        select(func.count())
        .select_from(WhatsappMessageJob)
        .where(
            WhatsappMessageJob.tenant_id == tenant_id,
            WhatsappMessageJob.recipient_whatsapp == recipient,
            WhatsappMessageJob.reference_type == REFERENCE_TYPE,
            WhatsappMessageJob.reference_id == campaign_id,
            WhatsappMessageJob.created_at >= since,
        )
    ).scalar_one()
    return int(n or 0) > 0


def _render_campaign_message(template: str, *, empresa: str, nome_cliente: str) -> str:
    out = template.replace("{empresa}", empresa or "").replace("{nome_cliente}", nome_cliente or "cliente")
    return out.strip()


def campaign_to_out(row: WhatsappBroadcastCampaign) -> dict[str, Any]:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "slug": row.slug,
        "name": row.name,
        "message_template": row.message_template,
        "segment_kind": row.segment_kind,
        "segment_params": _json_loads(row.segment_params_json, {}),
        "enabled": row.enabled,
        "max_recipients_per_run": row.max_recipients_per_run,
        "cooldown_days": row.cooldown_days,
        "last_run_at": row.last_run_at,
        "last_run_summary": _json_loads(row.last_run_summary_json, None),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def run_to_out(row: WhatsappBroadcastCampaignRun) -> dict[str, Any]:
    return {
        "id": row.id,
        "campaign_id": row.campaign_id,
        "tenant_id": row.tenant_id,
        "created_by_user_id": row.created_by_user_id,
        "status": row.status,
        "planned": row.planned,
        "sent_ok": row.sent_ok,
        "sent_failed": row.sent_failed,
        "skipped_cooldown": row.skipped_cooldown,
        "skipped_no_phone": row.skipped_no_phone,
        "error_message": row.error_message,
        "started_at": row.started_at,
        "finished_at": row.finished_at,
    }


def list_campaigns(db: Session, *, tenant_id: int) -> list[dict[str, Any]]:
    rows = db.execute(
        select(WhatsappBroadcastCampaign)
        .where(WhatsappBroadcastCampaign.tenant_id == tenant_id)
        .order_by(WhatsappBroadcastCampaign.updated_at.desc(), WhatsappBroadcastCampaign.id.desc())
    ).scalars().all()
    return [campaign_to_out(r) for r in rows]


def get_campaign(db: Session, *, tenant_id: int, campaign_id: int) -> WhatsappBroadcastCampaign:
    row = db.execute(
        select(WhatsappBroadcastCampaign).where(
            WhatsappBroadcastCampaign.id == campaign_id,
            WhatsappBroadcastCampaign.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campanha não encontrada.")
    return row


def create_campaign(
    db: Session,
    *,
    tenant_id: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    segment_kind = str(payload.get("segment_kind") or "").strip()
    if segment_kind not in (SEGMENT_INACTIVE_NO_OS, SEGMENT_OPEN_BUDGETS):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="segment_kind inválido.")
    params = _merge_params(segment_kind, payload.get("segment_params") if isinstance(payload.get("segment_params"), dict) else None)
    name = str(payload.get("name") or "").strip()
    if len(name) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Informe um nome para a campanha.")
    msg = str(payload.get("message_template") or "").strip()
    if len(msg) < 10:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Mensagem muito curta (mín. 10 caracteres).")
    slug = str(payload.get("slug") or "").strip() or _slugify(name)
    slug = _slugify(slug)
    row = WhatsappBroadcastCampaign(
        tenant_id=tenant_id,
        slug=slug,
        name=name,
        message_template=msg,
        segment_kind=segment_kind,
        segment_params_json=_json_dumps(params),
        enabled=bool(payload.get("enabled", True)),
        max_recipients_per_run=int(payload.get("max_recipients_per_run") or 300),
        cooldown_days=int(payload.get("cooldown_days") or 30),
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe campanha com este slug.") from exc
    db.refresh(row)
    return campaign_to_out(row)


def update_campaign(db: Session, *, tenant_id: int, campaign_id: int, patch: dict[str, Any]) -> dict[str, Any]:
    row = get_campaign(db, tenant_id=tenant_id, campaign_id=campaign_id)
    if "name" in patch and patch["name"] is not None:
        row.name = str(patch["name"]).strip()
    if "message_template" in patch and patch["message_template"] is not None:
        row.message_template = str(patch["message_template"]).strip()
    if "segment_kind" in patch and patch["segment_kind"] is not None:
        sk = str(patch["segment_kind"]).strip()
        if sk not in (SEGMENT_INACTIVE_NO_OS, SEGMENT_OPEN_BUDGETS):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="segment_kind inválido.")
        row.segment_kind = sk
    if "segment_params" in patch and patch["segment_params"] is not None:
        if not isinstance(patch["segment_params"], dict):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="segment_params deve ser objeto JSON.")
        merged = _merge_params(row.segment_kind, patch["segment_params"])
        row.segment_params_json = _json_dumps(merged)
    if "enabled" in patch and patch["enabled"] is not None:
        row.enabled = bool(patch["enabled"])
    if "max_recipients_per_run" in patch and patch["max_recipients_per_run"] is not None:
        row.max_recipients_per_run = max(1, min(int(patch["max_recipients_per_run"]), 2000))
    if "cooldown_days" in patch and patch["cooldown_days"] is not None:
        row.cooldown_days = max(0, min(int(patch["cooldown_days"]), 365))
    if "slug" in patch and patch["slug"] is not None:
        row.slug = _slugify(str(patch["slug"]))
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe campanha com este slug.") from exc
    db.refresh(row)
    return campaign_to_out(row)


def delete_campaign(db: Session, *, tenant_id: int, campaign_id: int) -> None:
    row = get_campaign(db, tenant_id=tenant_id, campaign_id=campaign_id)
    db.delete(row)
    db.commit()


def preview_campaign(
    db: Session,
    *,
    tenant_id: int,
    campaign_id: int,
    sample_limit: int,
) -> dict[str, Any]:
    row = get_campaign(db, tenant_id=tenant_id, campaign_id=campaign_id)
    tenant = db.get(Tenant, tenant_id)
    empresa = tenant.name if tenant else ""
    params = _json_loads(row.segment_params_json, {})
    total = count_campaign_clients(db, tenant_id=tenant_id, segment_kind=row.segment_kind, segment_params=params)
    clients = query_campaign_clients(
        db,
        tenant_id=tenant_id,
        segment_kind=row.segment_kind,
        segment_params=params,
        limit=min(sample_limit, 50),
    )
    samples: list[dict[str, Any]] = []
    for c in clients:
        ok, dest = client_whatsapp_destination(c)
        samples.append(
            {
                "client_id": c.id,
                "name": c.name,
                "whatsapp_ok": ok,
                "destination_preview": dest[:6] + "…" if dest and len(dest) > 8 else dest,
                "message_preview": _render_campaign_message(row.message_template, empresa=empresa, nome_cliente=c.name)[
                    :280
                ],
            }
        )
    return {"estimated_total": total, "sample": samples}


def run_campaign(db: Session, *, tenant_id: int, campaign_id: int, user: User) -> dict[str, Any]:
    row = get_campaign(db, tenant_id=tenant_id, campaign_id=campaign_id)
    if not row.enabled:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Campanha desativada. Ative antes de enviar.")
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    empresa = tenant.name or ""
    params = _json_loads(row.segment_params_json, {})
    max_n = max(1, min(int(row.max_recipients_per_run or 300), 2000))
    clients = query_campaign_clients(
        db,
        tenant_id=tenant_id,
        segment_kind=row.segment_kind,
        segment_params=params,
        limit=max_n,
    )

    run = WhatsappBroadcastCampaignRun(
        campaign_id=row.id,
        tenant_id=tenant_id,
        created_by_user_id=user.id,
        status="running",
        planned=len(clients),
    )
    db.add(run)
    db.flush()

    sent_ok = 0
    sent_failed = 0
    skipped_cd = 0
    skipped_phone = 0
    err_first: str | None = None

    for cli in clients:
        ok, dest = client_whatsapp_destination(cli)
        if not ok or not dest:
            skipped_phone += 1
            continue
        if _has_recent_campaign_job(
            db,
            tenant_id=tenant_id,
            campaign_id=row.id,
            recipient=dest,
            cooldown_days=int(row.cooldown_days or 0),
        ):
            skipped_cd += 1
            continue
        body = _render_campaign_message(row.message_template, empresa=empresa, nome_cliente=cli.name)
        try:
            dispatch_plain_whatsapp(
                db,
                tenant_id=tenant_id,
                created_by_user=user,
                recipient_whatsapp=dest,
                message=body,
                reference_type=REFERENCE_TYPE,
                reference_id=row.id,
            )
            sent_ok += 1
        except HTTPException as exc:
            sent_failed += 1
            if err_first is None:
                err_first = str(exc.detail)
        except Exception as exc:  # pragma: no cover
            sent_failed += 1
            if err_first is None:
                err_first = str(exc)

    run.sent_ok = sent_ok
    run.sent_failed = sent_failed
    run.skipped_cooldown = skipped_cd
    run.skipped_no_phone = skipped_phone
    run.status = "failed" if sent_ok == 0 and sent_failed > 0 else "completed"
    run.finished_at = datetime.now(timezone.utc)
    if run.status == "failed":
        run.error_message = err_first

    row.last_run_at = run.finished_at
    row.last_run_summary_json = _json_dumps(
        {
            "run_id": run.id,
            "planned": run.planned,
            "sent_ok": sent_ok,
            "sent_failed": sent_failed,
            "skipped_cooldown": skipped_cd,
            "skipped_no_phone": skipped_phone,
        }
    )
    db.add(run)
    db.add(row)
    db.commit()
    db.refresh(run)
    return {"campaign": campaign_to_out(row), "run": run_to_out(run)}


def list_runs(db: Session, *, tenant_id: int, campaign_id: int, limit: int = 30) -> list[dict[str, Any]]:
    get_campaign(db, tenant_id=tenant_id, campaign_id=campaign_id)
    rows = db.execute(
        select(WhatsappBroadcastCampaignRun)
        .where(
            WhatsappBroadcastCampaignRun.tenant_id == tenant_id,
            WhatsappBroadcastCampaignRun.campaign_id == campaign_id,
        )
        .order_by(WhatsappBroadcastCampaignRun.id.desc())
        .limit(min(limit, 100))
    ).scalars().all()
    return [run_to_out(r) for r in rows]
