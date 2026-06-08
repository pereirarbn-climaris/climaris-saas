"""Manutenção preventiva: histórico por cliente/serviço, vencimento e disparos Evolution API."""

from __future__ import annotations

import calendar
import json
import logging
import threading
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.preventive_message_ai import polish_preventive_whatsapp_message
from app.schemas_preventive import PreventivePreviewOut, PreventiveQuickClientCreate, PreventiveSettingsPatch
from app.tenant_business_calendar import (
    effective_preventive_reminder_day,
    is_within_tenant_work_hours,
    load_tenant_holiday_dates,
)
from app.whatsapp import (
    append_event,
    create_message_job,
    evolution_send_media_message,
    normalize_whatsapp_number,
    tenant_whatsapp_automation_active,
    _evolution_send_text,
    _resolve_tenant_instance,
)
from models import (
    Client,
    HistoricoServico,
    LembretePreventivo,
    OrderStatus,
    PreventiveInterestKind,
    PreventiveInterestLead,
    Service,
    ServiceOrder,
    ServiceOrderEquipmentService,
    ServiceOrderServiceItem,
    Tenant,
    User,
    WhatsappMessageJob,
    WhatsappMessageStatus,
)

logger = logging.getLogger("erp.preventive_maintenance")


@dataclass(frozen=True)
class PreventiveReminderSendBundle:
    """Contexto carregado para criar o job e enviar pela Evolution (sem efeitos colaterais além de leitura no DB)."""

    hist: HistoricoServico
    tenant: Tenant
    dest: str
    body: str
    url: str | None
    b64: str | None
    mimetype: str
    instance_name: str


def build_preventive_reminder_send_bundle(
    db: Session,
    *,
    tenant_id: int,
    historico_servico_id: int,
    promo_image_url: str | None = None,
    promo_image_base64: str | None = None,
    promo_image_mimetype: str | None = None,
    technical_problem_hint: str | None = None,
) -> PreventiveReminderSendBundle:
    """Valida histórico/cliente/serviço/WhatsApp e monta texto e mídia; levanta HTTPException se não for possível enviar."""
    hist = db.execute(
        select(HistoricoServico)
        .where(HistoricoServico.id == historico_servico_id, HistoricoServico.tenant_id == tenant_id)
        .options(joinedload(HistoricoServico.service), joinedload(HistoricoServico.client))
    ).scalar_one_or_none()
    if hist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de histórico não encontrado.")
    svc = hist.service
    cli = hist.client
    if svc is None or svc.periodicidade_meses is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Serviço sem periodicidade.")
    if cli is not None and bool(cli.preventive_campaign_opt_out):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cliente optou por não receber campanhas de manutenção preventiva.",
        )
    ok_wa, dest = client_whatsapp_destination(cli)
    if not ok_wa or not dest:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cliente sem WhatsApp válido cadastrado.",
        )

    tenant = load_tenant_settings_row(db, tenant_id)
    today = tenant_local_date(datetime.now(timezone.utc), tenant.timezone)
    equipment_label = _equipment_label_from_historico_notes(hist.notes)
    intervalo = elapsed_preventive_interval_label(last=hist.data_realizacao, today=today)
    body = render_preventive_message(
        tenant=tenant,
        client_name=cli.name,
        service_name=svc.name,
        months_display=months_between_approx(hist.data_realizacao, today),
        problem_hint=technical_problem_hint,
        equipment_name=_preventive_message_equipment_label(
            {
                "equipment_identificacao": equipment_label,
                "equipment_tipo": "AR_CONDICIONADO",
                "service_name": svc.name,
            }
        )
        if equipment_label
        else None,
        brand_model=None,
        intervalo_label=intervalo,
    )
    body = _finalize_preventive_whatsapp_body(
        db,
        tenant_id=tenant_id,
        tenant=tenant,
        rendered_body=body,
        client_name=cli.name,
    )

    url, b64, mimetype = _resolve_preventive_promo_media(
        tenant,
        promo_image_url=promo_image_url,
        promo_image_base64=promo_image_base64,
        promo_image_mimetype=promo_image_mimetype,
    )

    instance_name = _resolve_tenant_instance(db, tenant_id)

    return PreventiveReminderSendBundle(
        hist=hist,
        tenant=tenant,
        dest=dest,
        body=body,
        url=url,
        b64=b64,
        mimetype=mimetype,
        instance_name=instance_name,
    )


PREVENTIVE_MORE_PREFIX = "climaris:preventive:more:"
PREVENTIVE_SCHEDULE_PREFIX = "climaris:preventive:schedule:"
REMINDER_KIND_MANUAL = "preventive_whatsapp_manual"
REMINDER_KIND_AUTO_DUE = "preventive_auto_due_day"
REMINDER_KIND_AUTO_ADVANCE = "preventive_auto_advance"

DEFAULT_TECHNICAL_PROBLEM = (
    "perdas de eficiência energética, falhas no sistema e riscos ao cumprimento do PMOC e à qualidade do ar"
)

DEFAULT_MESSAGE_TEMPLATE = (
    "Olá, {cliente}! Notamos que faz {intervalo} desde a última manutenção do seu "
    "{equipamento} ({marca_modelo}). Vamos agendar a próxima preventiva?"
)


def format_preventive_interval_label(
    *,
    months_display: int | None = None,
    interval_value: int | None = None,
    interval_type: str | None = None,
) -> str:
    """Rótulo humano para {intervalo} (regras por equipamento ou histórico legado)."""
    if interval_value is not None and interval_type:
        value = max(1, int(interval_value))
        kind = interval_type.value if hasattr(interval_type, "value") else str(interval_type)
        if str(kind).lower() == "days":
            return f"{value} {'dia' if value == 1 else 'dias'}"
        return f"{value} {'mês' if value == 1 else 'meses'}"
    if months_display is not None and int(months_display) > 0:
        m = int(months_display)
        return f"{m} {'mês' if m == 1 else 'meses'}"
    return ""


def render_preventive_message(
    *,
    tenant: Tenant,
    client_name: str,
    service_name: str,
    months_display: int,
    problem_hint: str | None = None,
    equipment_name: str | None = None,
    brand_model: str | None = None,
    interval_value: int | None = None,
    interval_type: str | None = None,
    intervalo_label: str | None = None,
) -> str:
    """Substitui tags do template ({cliente}, {equipamento}, …) pelos dados reais."""
    problema = (problem_hint or tenant.preventive_technical_problem_hint or DEFAULT_TECHNICAL_PROBLEM).strip()
    tpl = (tenant.preventive_message_template or DEFAULT_MESSAGE_TEMPLATE).strip()
    cliente = client_name.strip() or "Cliente"
    servico = service_name.strip() or "serviço"
    equipamento = (equipment_name or servico).strip() or "equipamento"
    marca_modelo = (brand_model or "").strip()
    if marca_modelo.lower() == equipamento.lower() or marca_modelo.lower() == servico.lower():
        marca_modelo = ""
    if intervalo_label is not None:
        intervalo = intervalo_label
    elif months_display is not None:
        intervalo = format_preventive_interval_label(months_display=months_display)
    else:
        intervalo = format_preventive_interval_label(
            interval_value=interval_value,
            interval_type=interval_type,
        )
    replacements = {
        "{cliente}": cliente,
        "{nome}": cliente,
        "{equipamento}": equipamento,
        "{marca_modelo}": marca_modelo,
        "{intervalo}": intervalo,
        "{meses}": str(months_display) if months_display else "",
        "{servico}": servico,
        "{problema}": problema,
    }
    text = tpl
    for token, value in replacements.items():
        text = text.replace(token, value)
    text = text.replace(" ()", "").replace("()", "")
    return text.strip()


def tenant_local_date(utc_dt: datetime, tz_name: str) -> date:
    """Data civil no fuso do tenant (para vencimento ‘hoje’ e janelas da lista)."""
    raw = (tz_name or "").strip() or "UTC"
    try:
        tz = ZoneInfo(raw)
    except Exception:
        tz = ZoneInfo("UTC")
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=timezone.utc)
    return utc_dt.astimezone(tz).date()


def tenant_reminder_local_to_utc(tz_name: str, local_day: date, local_time_hhmm: str) -> datetime:
    """Combina data civil + hora local do tenant e retorna instante em UTC."""
    raw_tz = (tz_name or "").strip() or "UTC"
    try:
        tz = ZoneInfo(raw_tz)
    except Exception:
        tz = ZoneInfo("UTC")
    t_raw = (local_time_hhmm or "09:00").strip()
    parts = t_raw.split(":")
    try:
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
    except (ValueError, IndexError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Horário inválido; use HH:MM.")
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Horário fora do intervalo válido.")
    local_dt = datetime.combine(local_day, time(hour=h, minute=m), tzinfo=tz)
    return local_dt.astimezone(timezone.utc)


def add_calendar_months(d: date, months: int) -> date:
    if months <= 0:
        return d
    m_idx = d.month - 1 + months
    y = d.year + m_idx // 12
    m = m_idx % 12 + 1
    last = calendar.monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def months_between_approx(start: date, end: date) -> int:
    """Meses cheios aproximados (exibição na mensagem)."""
    if end < start:
        return 0
    return max(1, (end.year - start.year) * 12 + (end.month - start.month))


def elapsed_preventive_interval_label(*, last: date | None, today: date) -> str:
    """Tempo decorrido desde a última manutenção (texto humano para {intervalo})."""
    if last is None:
        return "algum tempo"
    days = (today - last).days
    if days <= 0:
        return "menos de 1 mês"
    if days < 45:
        return format_preventive_interval_label(interval_value=max(1, days), interval_type="days")
    return format_preventive_interval_label(months_display=months_between_approx(last, today))


def _equipment_label_from_historico_notes(notes: str | None) -> str | None:
    if not notes:
        return None
    for line in str(notes).splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("equipamento:"):
            label = stripped.split(":", 1)[1].strip()
            return label or None
    return None


def _historico_item_dict(
    hist: HistoricoServico,
    client: Client,
    service: Service,
    *,
    today: date,
    deadline: date,
) -> dict[str, Any] | None:
    per = service.periodicidade_meses
    if per is None:
        return None
    nxt = next_due_date(hist.data_realizacao, per)
    if nxt is None or nxt > deadline:
        return None
    dias = (nxt - today).days
    ok_wa, dest = client_whatsapp_destination(client)
    equipment_label = _equipment_label_from_historico_notes(hist.notes)
    return {
        "historico_servico_id": hist.id,
        "client_id": client.id,
        "client_name": client.name,
        "service_id": service.id,
        "service_name": service.name,
        "equipment_identificacao": equipment_label,
        "periodicidade_meses": per,
        "data_ultima_realizacao": hist.data_realizacao,
        "data_proximo_vencimento": nxt,
        "dias_ate_vencimento": dias,
        "whatsapp_valido": ok_wa,
        "whatsapp_destino": dest,
    }


def next_due_date(historico_date: date, periodicidade: int | None) -> date | None:
    if periodicidade is None or periodicidade <= 0:
        return None
    return add_calendar_months(historico_date, periodicidade)


def client_whatsapp_destination(client: Client | None) -> tuple[bool, str | None]:
    if client is None:
        return False, None
    raw = (client.whatsapp or "").strip() or (client.phone or "").strip()
    if not raw:
        return False, None
    try:
        normalized = normalize_whatsapp_number(raw)
        return True, normalized
    except HTTPException:
        return False, None


def _finalize_preventive_whatsapp_body(
    db: Session,
    *,
    tenant_id: int,
    tenant: Tenant,
    rendered_body: str,
    client_name: str,
) -> str:
    return polish_preventive_whatsapp_message(
        db,
        tenant=tenant,
        tenant_id=tenant_id,
        rendered_body=rendered_body,
        client_name=client_name,
        template_pattern=tenant.preventive_message_template,
    )


def _resolve_preventive_promo_media(
    tenant: Tenant,
    *,
    promo_image_url: str | None = None,
    promo_image_base64: str | None = None,
    promo_image_mimetype: str | None = None,
) -> tuple[str | None, str | None, str]:
    url = (promo_image_url or "").strip() or None
    b64 = (promo_image_base64 or "").strip() or None
    if not url and not b64:
        if not bool(getattr(tenant, "preventive_promo_image_enabled", False)):
            return None, None, "image/jpeg"
        url = (tenant.preventive_promo_image_url or "").strip() or None
    if b64 and len(b64) > 350_000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Imagem Base64 muito grande; use upload ou reduza o arquivo.",
        )
    mimetype = (
        (promo_image_mimetype or "").strip()
        or (tenant.preventive_promo_image_mimetype or "").strip()
        or "image/jpeg"
    )
    return url, b64, mimetype


def load_tenant_settings_row(db: Session, tenant_id: int) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    return tenant


def get_preventive_settings(db: Session, tenant_id: int) -> dict[str, Any]:
    t = load_tenant_settings_row(db, tenant_id)
    image_url = t.preventive_promo_image_url
    has_banner = bool((getattr(t, "preventive_promo_image_s3_key", None) or "").strip())
    return {
        "preventive_promo_image_url": image_url,
        "preventive_image_url": image_url,
        "preventive_has_banner": has_banner,
        "preventive_promo_image_mimetype": t.preventive_promo_image_mimetype or "image/jpeg",
        "preventive_promo_image_enabled": bool(getattr(t, "preventive_promo_image_enabled", False)),
        "preventive_technical_problem_hint": t.preventive_technical_problem_hint,
        "preventive_button_more_text": t.preventive_button_more_text,
        "preventive_button_schedule_text": t.preventive_button_schedule_text,
        "preventive_message_template": t.preventive_message_template,
        "preventive_auto_remind_days_before": int(t.preventive_auto_remind_days_before or 0),
        "preventive_auto_whatsapp_enabled": bool(getattr(t, "preventive_auto_whatsapp_enabled", False)),
        "default_message_template": DEFAULT_MESSAGE_TEMPLATE,
    }


def patch_preventive_settings(db: Session, tenant_id: int, payload: PreventiveSettingsPatch) -> dict[str, Any]:
    t = load_tenant_settings_row(db, tenant_id)
    data = payload.model_dump(exclude_unset=True)
    if "preventive_image_url" in data:
        data["preventive_promo_image_url"] = data.pop("preventive_image_url")
    for key, val in data.items():
        setattr(t, key, val)
    db.add(t)
    db.commit()
    db.refresh(t)
    return get_preventive_settings(db, tenant_id)


def build_grouped_preview(
    db: Session,
    *,
    tenant_id: int,
    window_days: int,
    historico_servico_id: int | None = None,
    rule_id: int | None = None,
    override_problem: str | None = None,
) -> PreventivePreviewOut:
    """Prévia da mensagem WhatsApp agrupada por cliente + mês de vencimento."""
    if (historico_servico_id is None) == (rule_id is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe historico_servico_id ou rule_id.",
        )
    group = find_preventive_group_for_item(
        db,
        tenant_id=tenant_id,
        window_days=window_days,
        historico_servico_id=historico_servico_id,
        rule_id=rule_id,
    )
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Item não encontrado na janela de preventivas.",
        )
    tenant = load_tenant_settings_row(db, tenant_id)
    items = group["items"]
    text = render_preventive_grouped_message(
        tenant=tenant,
        client_name=str(group["client_name"]),
        items=items,
        problem_hint=override_problem,
    )
    text = _finalize_preventive_whatsapp_body(
        db,
        tenant_id=tenant_id,
        tenant=tenant,
        rendered_body=text,
        client_name=str(group["client_name"]),
    )
    count = len(items)
    return PreventivePreviewOut(
        message_text=text,
        image_url=tenant.preventive_promo_image_url,
        image_mimetype=tenant.preventive_promo_image_mimetype or "image/jpeg",
        button_more_label=tenant.preventive_button_more_text,
        button_schedule_label=tenant.preventive_button_schedule_text,
        equipment_count=count,
        is_grouped=count > 1,
    )


def build_preview(
    db: Session,
    *,
    tenant_id: int,
    historico_servico_id: int,
    override_problem: str | None = None,
) -> PreventivePreviewOut:
    return build_grouped_preview(
        db,
        tenant_id=tenant_id,
        window_days=365,
        historico_servico_id=historico_servico_id,
        override_problem=override_problem,
    )


def _latest_historico_ids_subquery(tenant_id: int):
    rn = (
        func.row_number()
        .over(
            partition_by=(HistoricoServico.client_id, HistoricoServico.service_id),
            order_by=(HistoricoServico.data_realizacao.desc(), HistoricoServico.id.desc()),
        )
        .label("rn")
    )
    return (
        select(HistoricoServico.id, rn)
        .join(Service, Service.id == HistoricoServico.service_id)
        .where(HistoricoServico.tenant_id == tenant_id, Service.periodicidade_meses.isnot(None))
    ).subquery()


_WHATSAPP_SENT_STATUSES = frozenset(
    {
        WhatsappMessageStatus.SENT,
        WhatsappMessageStatus.DELIVERED,
        WhatsappMessageStatus.READ,
    }
)


def _fetch_preventive_jobs_by_max_id_subquery(db: Session, subq) -> dict[int, WhatsappMessageJob]:
    jobs = db.execute(select(WhatsappMessageJob).join(subq, WhatsappMessageJob.id == subq.c.jid)).scalars().all()
    out: dict[int, WhatsappMessageJob] = {}
    for job in jobs:
        rid = int(job.reference_id or 0)
        if rid > 0:
            out[rid] = job
    return out


def _latest_preventive_whatsapp_jobs_for_references(
    db: Session,
    *,
    tenant_id: int,
    reference_type: str,
    reference_ids: list[int],
) -> dict[int, WhatsappMessageJob]:
    """Último job preventivo por referência; prioriza envio bem-sucedido (evita QUEUED/FAILED mais novo)."""
    if not reference_ids:
        return {}
    common = (
        WhatsappMessageJob.tenant_id == tenant_id,
        WhatsappMessageJob.template_key == "preventive_maintenance",
        WhatsappMessageJob.reference_type == reference_type,
        WhatsappMessageJob.reference_id.in_(reference_ids),
    )
    sent_subq = (
        select(
            WhatsappMessageJob.reference_id.label("rid"),
            func.max(WhatsappMessageJob.id).label("jid"),
        )
        .where(*common, WhatsappMessageJob.status.in_(tuple(_WHATSAPP_SENT_STATUSES)))
        .group_by(WhatsappMessageJob.reference_id)
    ).subquery()
    out = _fetch_preventive_jobs_by_max_id_subquery(db, sent_subq)

    missing = [rid for rid in reference_ids if rid not in out]
    if not missing:
        return out
    latest_subq = (
        select(
            WhatsappMessageJob.reference_id.label("rid"),
            func.max(WhatsappMessageJob.id).label("jid"),
        )
        .where(
            WhatsappMessageJob.tenant_id == tenant_id,
            WhatsappMessageJob.template_key == "preventive_maintenance",
            WhatsappMessageJob.reference_type == reference_type,
            WhatsappMessageJob.reference_id.in_(missing),
        )
        .group_by(WhatsappMessageJob.reference_id)
    ).subquery()
    out.update(_fetch_preventive_jobs_by_max_id_subquery(db, latest_subq))
    return out


def _latest_preventive_whatsapp_jobs_by_historico(
    db: Session, *, tenant_id: int, historico_ids: list[int]
) -> dict[int, WhatsappMessageJob]:
    """Último job preventivo por `historico_servico_id` (prioriza SENT/DELIVERED/READ)."""
    return _latest_preventive_whatsapp_jobs_for_references(
        db,
        tenant_id=tenant_id,
        reference_type="preventive_historico",
        reference_ids=historico_ids,
    )


def _latest_preventive_whatsapp_jobs_by_client(
    db: Session, *, tenant_id: int, client_ids: list[int]
) -> dict[int, WhatsappMessageJob]:
    """Último job preventivo agrupado por cliente (prioriza SENT/DELIVERED/READ)."""
    return _latest_preventive_whatsapp_jobs_for_references(
        db,
        tenant_id=tenant_id,
        reference_type="preventive_client",
        reference_ids=client_ids,
    )


def _pending_preventive_order_ids_by_equipment_service(
    db: Session,
    *,
    tenant_id: int,
    equipment_ids: list[int],
) -> dict[tuple[int, int], int]:
    """Mapa (equipment_id, service_id) → OS preventiva em aberto/agendada."""
    if not equipment_ids:
        return {}
    rows = db.execute(
        select(
            ServiceOrderEquipmentService.equipment_id,
            ServiceOrderEquipmentService.service_id,
            ServiceOrder.id,
        )
        .join(ServiceOrder, ServiceOrder.id == ServiceOrderEquipmentService.service_order_id)
        .join(Service, Service.id == ServiceOrderEquipmentService.service_id)
        .where(
            ServiceOrder.tenant_id == tenant_id,
            ServiceOrderEquipmentService.equipment_id.in_(equipment_ids),
            ServiceOrder.status.in_(
                (
                    OrderStatus.OPEN,
                    OrderStatus.SCHEDULED,
                    OrderStatus.APPROVED,
                    OrderStatus.IN_PROGRESS,
                )
            ),
            Service.preventive_enabled.is_(True),
        )
        .order_by(ServiceOrder.id.desc())
    ).all()
    out: dict[tuple[int, int], int] = {}
    for eq_id, svc_id, order_id in rows:
        if eq_id is None or svc_id is None:
            continue
        key = (int(eq_id), int(svc_id))
        if key not in out:
            out[key] = int(order_id)
    return out


def _whatsapp_job_is_sent(job: WhatsappMessageJob | None) -> bool:
    if job is None:
        return False
    st = job.status.value if isinstance(job.status, WhatsappMessageStatus) else str(job.status)
    try:
        return WhatsappMessageStatus(st) in _WHATSAPP_SENT_STATUSES
    except ValueError:
        return st.lower() in {"sent", "delivered", "read"}


def _prefer_preventive_whatsapp_job(candidate: WhatsappMessageJob, current: WhatsappMessageJob) -> bool:
    """True se `candidate` deve substituir `current` no mapa por cliente."""
    c_sent = _whatsapp_job_is_sent(candidate)
    cur_sent = _whatsapp_job_is_sent(current)
    if c_sent and not cur_sent:
        return True
    if cur_sent and not c_sent:
        return False
    return int(candidate.id) > int(current.id)


def _resolve_preventive_whatsapp_jobs_by_client(
    db: Session,
    *,
    tenant_id: int,
    client_ids: list[int],
) -> dict[int, WhatsappMessageJob]:
    """Último job preventivo por cliente (`preventive_client` + `preventive_historico` do cliente)."""
    out = _latest_preventive_whatsapp_jobs_by_client(db, tenant_id=tenant_id, client_ids=client_ids)
    if not client_ids:
        return out
    hist_rows = db.execute(
        select(HistoricoServico.id, HistoricoServico.client_id).where(
            HistoricoServico.tenant_id == tenant_id,
            HistoricoServico.client_id.in_(client_ids),
        )
    ).all()
    if not hist_rows:
        return out
    hist_to_client = {int(hid): int(cid) for hid, cid in hist_rows}
    wa_by_hist = _latest_preventive_whatsapp_jobs_by_historico(
        db,
        tenant_id=tenant_id,
        historico_ids=list(hist_to_client.keys()),
    )
    for hid, job in wa_by_hist.items():
        cid = hist_to_client.get(int(hid))
        if cid is None:
            continue
        existing = out.get(cid)
        if existing is None or _prefer_preventive_whatsapp_job(job, existing):
            out[cid] = job
    return out


def _preventive_item_due_date(item: dict[str, Any]) -> date:
    due = item["data_proximo_vencimento"]
    if isinstance(due, datetime):
        return due.date()
    return due


def _preventive_sent_reminders_by_client(
    db: Session,
    *,
    tenant_id: int,
    client_ids: list[int],
    tenant_tz: str,
    lookback_days: int = 120,
) -> dict[int, list[tuple[date, str | None]]]:
    """Jobs preventivos enviados por cliente → [(data civil envio, reminder_kind ou None)]."""
    if not client_ids:
        return {}
    since = datetime.now(timezone.utc) - timedelta(days=max(1, lookback_days))
    rows = db.execute(
        select(WhatsappMessageJob, LembretePreventivo.reminder_kind)
        .outerjoin(LembretePreventivo, LembretePreventivo.whatsapp_job_id == WhatsappMessageJob.id)
        .where(
            WhatsappMessageJob.tenant_id == tenant_id,
            WhatsappMessageJob.template_key == "preventive_maintenance",
            WhatsappMessageJob.reference_type == "preventive_client",
            WhatsappMessageJob.reference_id.in_(client_ids),
            WhatsappMessageJob.status.in_(tuple(_WHATSAPP_SENT_STATUSES)),
            WhatsappMessageJob.created_at >= since,
        )
        .order_by(WhatsappMessageJob.id.desc())
    ).all()
    out: dict[int, list[tuple[date, str | None]]] = {cid: [] for cid in client_ids}
    for job, kind in rows:
        cid = int(job.reference_id or 0)
        if cid not in out:
            continue
        sent_at = job.sent_at or job.created_at
        if sent_at is None:
            continue
        out[cid].append((tenant_local_date(sent_at, tenant_tz), kind))
    return out


def enrich_preventive_items_campaign_status(
    db: Session,
    *,
    tenant_id: int,
    items: list[dict[str, Any]],
    advance_days: int = 0,
    tenant_tz: str = "UTC",
) -> None:
    """Preenche status: agenda (OS), lembrete WhatsApp automático/manual e vencida."""
    if not items:
        return

    client_ids = sorted({int(i["client_id"]) for i in items if i.get("client_id")})
    equipment_ids = sorted({int(i["equipment_id"]) for i in items if i.get("equipment_id")})
    advance_days = max(0, int(advance_days or 0))
    tenant = db.get(Tenant, tenant_id)
    holidays = load_tenant_holiday_dates(db, tenant_id) if tenant else set()

    wa_by_client = _resolve_preventive_whatsapp_jobs_by_client(
        db, tenant_id=tenant_id, client_ids=client_ids
    )
    sent_by_client = _preventive_sent_reminders_by_client(
        db,
        tenant_id=tenant_id,
        client_ids=client_ids,
        tenant_tz=tenant_tz,
    )
    pending_os = _pending_preventive_order_ids_by_equipment_service(
        db,
        tenant_id=tenant_id,
        equipment_ids=equipment_ids,
    )

    for item in items:
        cid = int(item.get("client_id") or 0)
        eid = int(item.get("equipment_id") or 0)
        sid = int(item.get("service_id") or 0)
        dias = int(item.get("dias_ate_vencimento") or 0)
        due = _preventive_item_due_date(item)

        order_id = pending_os.get((eid, sid)) if eid > 0 and sid > 0 else None
        job = wa_by_client.get(cid) if cid > 0 else None
        if job is None and int(item.get("historico_servico_id") or 0) > 0:
            hist_job = _latest_preventive_whatsapp_jobs_by_historico(
                db,
                tenant_id=tenant_id,
                historico_ids=[int(item["historico_servico_id"])],
            ).get(int(item["historico_servico_id"]))
            job = hist_job

        if tenant:
            reminder_target = effective_preventive_reminder_day(tenant, due, advance_days, holidays)
        else:
            reminder_target = due - timedelta(days=advance_days) if advance_days > 0 else due
        auto_reminder_sent = False
        for sent_day, kind in sent_by_client.get(cid, []):
            if sent_day == reminder_target:
                auto_reminder_sent = True
                break
            if advance_days > 0 and kind == REMINDER_KIND_AUTO_ADVANCE:
                auto_reminder_sent = True
                break
            if advance_days == 0 and kind == REMINDER_KIND_AUTO_DUE:
                auto_reminder_sent = True
                break

        mensagem_enviada = auto_reminder_sent or _whatsapp_job_is_sent(job)
        if not mensagem_enviada and item.get("ultimo_whatsapp_status"):
            try:
                mensagem_enviada = WhatsappMessageStatus(str(item["ultimo_whatsapp_status"])) in _WHATSAPP_SENT_STATUSES
            except ValueError:
                mensagem_enviada = str(item["ultimo_whatsapp_status"]).lower() in {"sent", "delivered", "read"}

        status_agenda = order_id is not None
        status_vencida = dias < 0

        item["pending_service_order_id"] = order_id
        item["status_agenda"] = status_agenda
        item["status_lembrete_antecipado"] = False
        item["status_lembrete_vencimento"] = False
        item["status_mensagem_enviada"] = mensagem_enviada
        item["status_vencida"] = status_vencida

        if status_agenda:
            item["campaign_status"] = "agenda"
        elif mensagem_enviada:
            item["campaign_status"] = "mensagem_enviada"
        elif status_vencida:
            item["campaign_status"] = "vencida"
        else:
            item["campaign_status"] = None

        if job is not None and item.get("ultimo_whatsapp_status") is None:
            st = job.status.value if isinstance(job.status, WhatsappMessageStatus) else str(job.status)
            item["ultimo_whatsapp_status"] = st
            err = (job.error_message or "").strip()
            if job.status == WhatsappMessageStatus.FAILED and err:
                item["ultimo_whatsapp_erro"] = err[:400] + ("…" if len(err) > 400 else "")
            else:
                item["ultimo_whatsapp_erro"] = None
            item["ultimo_whatsapp_em"] = job.failed_at or job.sent_at or job.created_at


def list_preventive_items(db: Session, *, tenant_id: int, window_days: int) -> list[dict[str, Any]]:
    """Lista preventivas vencidas ou na janela — regras por equipamento + histórico legado."""
    from app.equipment_preventive_rules import (
        equipment_due_row_to_preventive_item,
        list_equipment_preventive_due,
    )

    equipment_items = [
        equipment_due_row_to_preventive_item(row)
        for row in list_equipment_preventive_due(db, tenant_id=tenant_id, window_days=window_days)
    ]
    historico_items = _list_preventive_items_from_historico(db, tenant_id=tenant_id, window_days=window_days)
    from app.equipment_service_preventive import list_schedule_preventive_items_in_window

    schedule_items = list_schedule_preventive_items_in_window(
        db,
        tenant_id=tenant_id,
        window_days=window_days,
    )
    merged = _merge_equipment_and_historico_preventive_items(equipment_items, historico_items)
    merged = _merge_equipment_and_historico_preventive_items(merged, schedule_items)
    tenant = load_tenant_settings_row(db, tenant_id)
    enrich_preventive_items_campaign_status(
        db,
        tenant_id=tenant_id,
        items=merged,
        advance_days=int(tenant.preventive_auto_remind_days_before or 0),
        tenant_tz=tenant.timezone or "UTC",
    )
    return merged


def _merge_equipment_and_historico_preventive_items(
    equipment_items: list[dict[str, Any]],
    historico_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Une regras por equipamento com histórico legado (sem esconder cadastros antigos)."""
    merged = list(equipment_items)
    covered: set[tuple[int, str]] = set()
    for item in equipment_items:
        cid = int(item.get("client_id") or 0)
        ident = str(item.get("equipment_identificacao") or "").strip().lower()
        if cid > 0 and ident:
            covered.add((cid, ident))
        eid = int(item.get("equipment_id") or 0)
        sid = int(item.get("service_id") or 0)
        if cid > 0 and eid > 0:
            covered.add((cid, f"equipment:{eid}"))
        if cid > 0 and eid > 0 and sid > 0:
            covered.add((cid, f"schedule:{eid}:{sid}"))

    for hist in historico_items:
        cid = int(hist.get("client_id") or 0)
        ident = str(hist.get("equipment_identificacao") or "").strip().lower()
        if ident and (cid, ident) in covered:
            continue
        eid = int(hist.get("equipment_id") or 0)
        sid = int(hist.get("service_id") or 0)
        if eid > 0 and sid > 0 and (cid, f"schedule:{eid}:{sid}") in covered:
            continue
        merged.append(hist)

    merged.sort(key=lambda r: (r.get("dias_ate_vencimento", 999), r.get("client_name", ""), str(r.get("equipment_identificacao") or "")))
    return merged


def _list_preventive_items_from_historico(db: Session, *, tenant_id: int, window_days: int) -> list[dict[str, Any]]:
    tenant = load_tenant_settings_row(db, tenant_id)
    sub = _latest_historico_ids_subquery(tenant_id)
    rows = db.execute(
        select(HistoricoServico, Client, Service)
        .join(sub, sub.c.id == HistoricoServico.id)
        .where(sub.c.rn == 1)
        .join(Client, Client.id == HistoricoServico.client_id)
        .join(Service, Service.id == HistoricoServico.service_id)
        .where(Service.periodicidade_meses.isnot(None))
    ).all()

    today = tenant_local_date(datetime.now(timezone.utc), tenant.timezone)
    deadline = today + timedelta(days=max(0, window_days))
    out: list[dict[str, Any]] = []
    for hist, client, service in rows:
        if bool(client.preventive_campaign_opt_out):
            continue
        per = service.periodicidade_meses
        if per is None:
            continue
        nxt = next_due_date(hist.data_realizacao, per)
        if nxt is None:
            continue
        dias = (nxt - today).days
        ok_wa, dest = client_whatsapp_destination(client)
        # Inclui vencidos e próximos N dias (próximo vencimento dentro da janela ou já passou)
        if nxt > deadline:
            continue
        out.append(
            {
                "historico_servico_id": hist.id,
                "client_id": client.id,
                "client_name": client.name,
                "service_id": service.id,
                "service_name": service.name,
                "equipment_identificacao": _equipment_label_from_historico_notes(hist.notes),
                "periodicidade_meses": per,
                "data_ultima_realizacao": hist.data_realizacao,
                "data_proximo_vencimento": nxt,
                "dias_ate_vencimento": dias,
                "whatsapp_valido": ok_wa,
                "whatsapp_destino": dest,
            }
        )
    hist_ids = [r["historico_servico_id"] for r in out]
    job_map = _latest_preventive_whatsapp_jobs_by_historico(db, tenant_id=tenant_id, historico_ids=hist_ids)
    for row in out:
        job = job_map.get(row["historico_servico_id"])
        if job is None:
            row["ultimo_whatsapp_status"] = None
            row["ultimo_whatsapp_erro"] = None
            row["ultimo_whatsapp_em"] = None
            continue
        st = job.status.value if isinstance(job.status, WhatsappMessageStatus) else str(job.status)
        row["ultimo_whatsapp_status"] = st
        err = (job.error_message or "").strip()
        if job.status == WhatsappMessageStatus.FAILED and err:
            if len(err) > 400:
                err = err[:400] + "…"
            row["ultimo_whatsapp_erro"] = err
        else:
            row["ultimo_whatsapp_erro"] = None
        row["ultimo_whatsapp_em"] = job.failed_at or job.sent_at or job.created_at
    out.sort(key=lambda r: (r["dias_ate_vencimento"], r["client_name"]))
    return out


def _preventive_item_due_month_key(item: dict[str, Any]) -> tuple[int, int, int]:
    """Chave de agrupamento: (client_id, ano, mês) do próximo vencimento."""
    due = item["data_proximo_vencimento"]
    if isinstance(due, datetime):
        due = due.date()
    return (int(item["client_id"]), int(due.year), int(due.month))


def _normalize_equipment_label_text(label: str) -> str:
    """Remove partes repetidas (ex.: 'Sala · … · Sala' → 'Sala · …')."""
    parts = [p.strip() for p in str(label or "").split(" · ") if p.strip()]
    if not parts:
        return ""
    if len(parts) >= 2 and parts[0].lower() == parts[-1].lower():
        parts = parts[:-1]
    deduped: list[str] = []
    for part in parts:
        if deduped and deduped[-1].lower() == part.lower():
            continue
        deduped.append(part)
    return " · ".join(deduped)


def _format_equipment_category_label(item: dict[str, Any]) -> str | None:
    raw = str(item.get("equipment_category") or item.get("equipment_tipo") or "").strip()
    if not raw:
        return None
    labels = {
        "AR_CONDICIONADO": "Ar condicionado",
    }
    return labels.get(raw.upper(), raw.replace("_", " ").title())


def _preventive_equipment_product_label(item: dict[str, Any]) -> str:
    """Marca/modelo do aparelho (sem setor/local — usado na mensagem WhatsApp)."""
    fabricante = str(item.get("equipment_fabricante") or "").strip()
    modelo = str(item.get("equipment_modelo") or "").strip()
    evap = str(item.get("equipment_modelo_evaporadora") or "").strip()
    cond = str(item.get("equipment_modelo_condensadora") or "").strip()

    if evap or cond:
        parts = [p for p in (evap, cond) if p]
        product = " + ".join(parts) if len(parts) > 1 else (parts[0] if parts else "")
        if fabricante and product and fabricante.lower() not in product.lower():
            product = f"{fabricante} {product}"
    elif fabricante and modelo:
        product = modelo if fabricante.lower() in modelo.lower() else f"{fabricante} {modelo}"
    elif modelo:
        product = modelo
    elif fabricante:
        product = fabricante
    else:
        ident = _normalize_equipment_label_text(str(item.get("equipment_identificacao") or ""))
        local = str(item.get("equipment_local") or "").strip()
        if local:
            parts = [p.strip() for p in ident.split(" · ") if p.strip()]
            parts = [p for p in parts if p.lower() != local.lower()]
            ident = " · ".join(parts) if parts else ident
        product = ident

    return product.strip() or "equipamento"


def _preventive_message_equipment_label(item: dict[str, Any]) -> str:
    """Rótulo para mensagem WhatsApp: categoria + produto (ex.: Ar condicionado Elgin …)."""
    category = _format_equipment_category_label(item)
    product = _preventive_equipment_product_label(item)
    if category:
        if product.lower().startswith(category.lower()):
            return product
        return f"{category} {product}"
    return product


def _preventive_equipment_display_name(item: dict[str, Any]) -> str:
    ident = str(item.get("equipment_identificacao") or "").strip()
    svc = str(item.get("service_name") or "").strip()
    if svc.lower().startswith("preventiva"):
        svc = svc.split("—", 1)[-1].split("-", 1)[-1].strip()
    base = ident if ident else (svc or "Equipamento")
    base = _normalize_equipment_label_text(base)
    category = _format_equipment_category_label(item)
    if category:
        cat_lower = category.lower()
        if not base.lower().startswith(cat_lower):
            return f"{category} {base}"
    return base


def group_preventive_items_by_client_and_due_month(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Agrupa preventivas por cliente e mês de vencimento (uma mensagem WhatsApp por grupo)."""
    groups: dict[tuple[int, int, int], dict[str, Any]] = {}
    for row in items:
        key = _preventive_item_due_month_key(row)
        if key not in groups:
            due = row["data_proximo_vencimento"]
            if isinstance(due, datetime):
                due = due.date()
            groups[key] = {
                "client_id": int(row["client_id"]),
                "client_name": str(row["client_name"]),
                "due_year": int(due.year),
                "due_month": int(due.month),
                "whatsapp_valido": bool(row.get("whatsapp_valido")),
                "whatsapp_destino": row.get("whatsapp_destino"),
                "items": [],
            }
        groups[key]["items"].append(row)
    out = list(groups.values())
    out.sort(
        key=lambda g: (
            min(int(i.get("dias_ate_vencimento") or 999) for i in g["items"]),
            g["client_name"],
            g["due_year"],
            g["due_month"],
        )
    )
    return out


def render_preventive_grouped_message(
    *,
    tenant: Tenant,
    client_name: str,
    items: list[dict[str, Any]],
    problem_hint: str | None = None,
) -> str:
    """Mensagem consolidada quando vários equipamentos do mesmo cliente vencem no mesmo mês."""
    if len(items) == 1:
        item = items[0]
        due = item["data_proximo_vencimento"]
        if isinstance(due, datetime):
            due = due.date()
        last = item.get("data_ultima_realizacao")
        if isinstance(last, datetime):
            last = last.date()
        today = tenant_local_date(datetime.now(timezone.utc), tenant.timezone)
        intervalo = elapsed_preventive_interval_label(last=last or due, today=today)
        return render_preventive_message(
            tenant=tenant,
            client_name=client_name,
            service_name=str(item.get("service_name") or ""),
            months_display=months_between_approx(last or due, today),
            problem_hint=problem_hint,
            equipment_name=_preventive_message_equipment_label(item),
            brand_model=None,
            intervalo_label=intervalo,
        )

    problema = (problem_hint or tenant.preventive_technical_problem_hint or DEFAULT_TECHNICAL_PROBLEM).strip()
    cliente = client_name.strip() or "Cliente"
    equip_lines: list[str] = []
    for item in sorted(items, key=lambda r: (_preventive_message_equipment_label(r), str(r.get("data_proximo_vencimento")))):
        name = _preventive_message_equipment_label(item)
        due = item["data_proximo_vencimento"]
        if isinstance(due, datetime):
            due = due.date()
        equip_lines.append(f"• {name} — vencimento {due.strftime('%d/%m/%Y')}")
    equipamentos_lista = "\n".join(equip_lines)

    tpl = (tenant.preventive_message_template or "").strip()
    if tpl and "{equipamentos_lista}" in tpl:
        first = items[0]
        due = first["data_proximo_vencimento"]
        if isinstance(due, datetime):
            due = due.date()
        last = first.get("data_ultima_realizacao")
        if isinstance(last, datetime):
            last = last.date()
        today = tenant_local_date(datetime.now(timezone.utc), tenant.timezone)
        intervalo = elapsed_preventive_interval_label(last=last or due, today=today)
        base = render_preventive_message(
            tenant=tenant,
            client_name=client_name,
            service_name=str(first.get("service_name") or ""),
            months_display=months_between_approx(last or due, today),
            problem_hint=problem_hint,
            equipment_name=_preventive_message_equipment_label(first),
            brand_model=None,
            intervalo_label=intervalo,
        )
        return base.replace("{equipamentos_lista}", equipamentos_lista)

    count = len(items)
    equip_label = f"{count} equipamento{'s' if count != 1 else ''}"
    return (
        f"Olá, {cliente}! Notamos que a manutenção preventiva de {equip_label} "
        f"está vencendo:\n\n{equipamentos_lista}\n\n"
        f"Isso pode gerar {problema}. Vamos agendar?"
    ).strip()


def _resolve_group_anchor_historico_id(items: list[dict[str, Any]]) -> int | None:
    for item in items:
        hid = int(item.get("historico_servico_id") or 0)
        if hid > 0:
            return hid
    return None


def expand_preventive_group_items(
    db: Session,
    *,
    tenant_id: int,
    items: list[dict[str, Any]],
    window_days: int = 400,
) -> list[dict[str, Any]]:
    """Expande itens parciais para o grupo completo (cliente + mês de vencimento)."""
    if not items:
        return []
    anchor = items[0]
    hid = int(anchor.get("historico_servico_id") or 0)
    rid = int(anchor.get("rule_id") or 0)
    group = find_preventive_group_for_item(
        db,
        tenant_id=tenant_id,
        window_days=window_days,
        historico_servico_id=hid if hid > 0 else None,
        rule_id=rid if rid > 0 else None,
    )
    return group["items"] if group else items


def find_preventive_group_for_item(
    db: Session,
    *,
    tenant_id: int,
    window_days: int,
    historico_servico_id: int | None = None,
    rule_id: int | None = None,
) -> dict[str, Any] | None:
    """Localiza o grupo (cliente + mês) que contém o item indicado."""
    rows = list_preventive_items(db, tenant_id=tenant_id, window_days=window_days)
    target: dict[str, Any] | None = None
    if historico_servico_id is not None:
        for row in rows:
            if int(row.get("historico_servico_id") or 0) == historico_servico_id:
                target = row
                break
    if target is None and rule_id is not None:
        for row in rows:
            if int(row.get("rule_id") or 0) == rule_id:
                target = row
                break
    if target is None:
        return None
    key = _preventive_item_due_month_key(target)
    group_items = [r for r in rows if _preventive_item_due_month_key(r) == key and r.get("whatsapp_valido")]
    if not group_items:
        return None
    due = target["data_proximo_vencimento"]
    if isinstance(due, datetime):
        due = due.date()
    return {
        "client_id": int(target["client_id"]),
        "client_name": str(target["client_name"]),
        "due_year": int(due.year),
        "due_month": int(due.month),
        "whatsapp_valido": True,
        "whatsapp_destino": target.get("whatsapp_destino"),
        "items": group_items,
    }


def list_preventive_items_grouped(db: Session, *, tenant_id: int, window_days: int) -> dict[str, Any]:
    """Retorno agrupado por cliente (regras por equipamento + fallback histórico)."""
    flat = list_preventive_items(db, tenant_id=tenant_id, window_days=window_days)
    legacy_by_client: dict[int, dict[str, Any]] = {}
    for row in flat:
        cid = int(row["client_id"])
        if cid not in legacy_by_client:
            legacy_by_client[cid] = {
                "client_id": cid,
                "client_name": row["client_name"],
                "whatsapp_valido": row["whatsapp_valido"],
                "whatsapp_destino": row.get("whatsapp_destino"),
                "equipments": [],
            }
        legacy_by_client[cid]["equipments"].append(row)
    clients = sorted(
        legacy_by_client.values(),
        key=lambda g: (g["equipments"][0]["dias_ate_vencimento"] if g["equipments"] else 999, g["client_name"]),
    )

    return {
        "window_days": window_days,
        "clients": clients,
        "items": flat,
    }


def create_historico(
    db: Session,
    *,
    tenant_id: int,
    client_id: int,
    service_id: int,
    data_realizacao: date,
    service_order_id: int | None,
    notes: str | None,
) -> HistoricoServico:
    svc = db.execute(
        select(Service).where(Service.id == service_id, Service.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if svc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Serviço não encontrado.")
    cli = db.execute(select(Client).where(Client.id == client_id, Client.tenant_id == tenant_id)).scalar_one_or_none()
    if cli is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")

    row = HistoricoServico(
        tenant_id=tenant_id,
        client_id=client_id,
        service_id=service_id,
        data_realizacao=data_realizacao,
        service_order_id=service_order_id,
        notes=notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def create_quick_client_for_preventive(
    db: Session,
    *,
    tenant_id: int,
    payload: PreventiveQuickClientCreate,
) -> Client:
    """Cliente mínimo para registrar preventiva; mesmas regras de unicidade de telefone do cadastro completo."""
    name = payload.name.strip()
    phone = (payload.phone or "").strip() or None
    wa = (payload.whatsapp or "").strip() or None
    if phone:
        existing_phone = db.execute(
            select(Client).where(Client.tenant_id == tenant_id, Client.phone == phone)
        ).scalar_one_or_none()
        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe um cliente com este telefone nesta empresa.",
            )

    client = Client(
        tenant_id=tenant_id,
        name=name,
        document=None,
        tax_id_kind="cnpj",
        optante_mei=False,
        phone=phone,
        whatsapp=wa or phone,
        email=None,
        preventive_campaign_opt_out=False,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def create_historicos_from_service_order(
    db: Session,
    *,
    tenant_id: int,
    service_order_id: int,
    data_realizacao: date | None,
    notes: str | None,
) -> list[HistoricoServico]:
    """Um histórico por tipo de serviço na OS com `periodicidade_meses` definida."""
    order = db.execute(
        select(ServiceOrder).where(
            ServiceOrder.id == service_order_id,
            ServiceOrder.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de serviço não encontrada.")
    if order.status == OrderStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="OS cancelada não permite registro de manutenção preventiva.",
        )

    tenant = load_tenant_settings_row(db, tenant_id)
    dr = (
        data_realizacao
        if data_realizacao is not None
        else tenant_local_date(datetime.now(timezone.utc), tenant.timezone)
    )

    service_ids = db.execute(
        select(ServiceOrderServiceItem.service_id)
        .join(Service, Service.id == ServiceOrderServiceItem.service_id)
        .where(
            ServiceOrderServiceItem.service_order_id == service_order_id,
            Service.tenant_id == tenant_id,
            Service.periodicidade_meses.isnot(None),
        )
        .distinct()
    ).scalars().all()

    if not service_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Nenhum serviço desta OS tem periodicidade configurada (ex.: 6 ou 12 meses). "
                "Ajuste o cadastro do tipo de serviço."
            ),
        )

    extra = (notes or "").strip()
    merged_notes = f"OS #{service_order_id}" + (f". {extra}" if extra else "")

    out: list[HistoricoServico] = []
    for sid in service_ids:
        row = create_historico(
            db,
            tenant_id=tenant_id,
            client_id=order.client_id,
            service_id=int(sid),
            data_realizacao=dr,
            service_order_id=service_order_id,
            notes=merged_notes,
        )
        out.append(row)
    return out


def _already_sent_reminder_on_tenant_local_day(
    db: Session,
    *,
    tenant_id: int,
    historico_id: int,
    reminder_kind: str,
    tenant_tz: str,
    tenant_local_day: date,
) -> bool:
    since = datetime.now(timezone.utc) - timedelta(days=2)
    rows = db.execute(
        select(LembretePreventivo.created_at).where(
            LembretePreventivo.tenant_id == tenant_id,
            LembretePreventivo.historico_servico_id == historico_id,
            LembretePreventivo.reminder_kind == reminder_kind,
            LembretePreventivo.created_at >= since,
        )
    ).all()
    for (created_at,) in rows:
        if created_at is None:
            continue
        if tenant_local_date(created_at, tenant_tz) == tenant_local_day:
            return True
    return False


def _deliver_preventive_evolution_message(
    db: Session,
    *,
    tenant_id: int,
    tenant: Tenant,
    instance_name: str,
    historico_servico_id: int | None,
    client_id: int | None,
    dest: str,
    body: str,
    url: str | None,
    b64: str | None,
    mimetype: str,
    reminder_kind: str,
    job: WhatsappMessageJob,
) -> None:
    from app.whatsapp import finalize_pending_client_whatsapp_flows

    finalize_pending_client_whatsapp_flows(
        db,
        tenant_id=tenant_id,
        jid_digits=dest,
        source="preventive_reminder_send",
    )
    try:
        media_sent = False
        caption_for_media = body
        if url or b64:
            evolution_send_media_message(
                instance_name,
                dest,
                caption=caption_for_media,
                media_url=url if url else None,
                media_base64=b64 if not url else None,
                mimetype=mimetype,
            )
            media_sent = True
        short_follow = "Como podemos ajudar?"
        # Sempre texto simples (sem botões interativos): melhor compatibilidade Web/celular e Evolution.
        if media_sent:
            lines = [
                short_follow,
                "",
                f"👉 {tenant.preventive_button_more_text}: responda MAIS",
                f"👉 {tenant.preventive_button_schedule_text}: responda AGENDAR",
            ]
        else:
            lines = [
                body,
                "",
                f"👉 {tenant.preventive_button_more_text}: responda MAIS",
                f"👉 {tenant.preventive_button_schedule_text}: responda AGENDAR",
            ]
        _evolution_send_text(instance_name, dest, "\n".join(lines))

        job.status = WhatsappMessageStatus.SENT
        job.sent_at = datetime.now(timezone.utc)
        db.flush()

        if historico_servico_id is not None and historico_servico_id > 0:
            lr = LembretePreventivo(
                tenant_id=tenant_id,
                historico_servico_id=historico_servico_id,
                reminder_kind=reminder_kind,
                recipient_whatsapp=dest,
                whatsapp_job_id=job.id,
            )
            db.add(lr)
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="preventive_reminder_sent",
            payload={
                "historico_servico_id": historico_servico_id,
                "client_id": client_id,
                "reminder_kind": reminder_kind,
                "media": bool(url or b64),
            },
            job_id=job.id,
        )
    except HTTPException as exc:
        job.status = WhatsappMessageStatus.FAILED
        job.failed_at = datetime.now(timezone.utc)
        job.error_message = str(exc.detail)
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="preventive_reminder_failed",
            payload={
                "error": str(exc.detail),
                "historico_servico_id": historico_servico_id,
                "client_id": client_id,
            },
            job_id=job.id,
        )
        db.commit()
        db.refresh(job)
        raise

    db.commit()
    db.refresh(job)


def dispatch_preventive_reminder(
    db: Session,
    *,
    tenant_id: int,
    created_by_user: User | None,
    historico_servico_id: int,
    promo_image_url: str | None = None,
    promo_image_base64: str | None = None,
    promo_image_mimetype: str | None = None,
    technical_problem_hint: str | None = None,
    reminder_kind: str = REMINDER_KIND_MANUAL,
    skip_evolution_send: bool = False,
    scheduled_send_at_utc: datetime | None = None,
    window_days: int = 400,
) -> WhatsappMessageJob:
    group = find_preventive_group_for_item(
        db,
        tenant_id=tenant_id,
        window_days=window_days,
        historico_servico_id=historico_servico_id,
    )
    if group is not None and len(group["items"]) > 0:
        return dispatch_preventive_grouped_reminder(
            db,
            tenant_id=tenant_id,
            created_by_user=created_by_user,
            items=group["items"],
            promo_image_url=promo_image_url,
            promo_image_base64=promo_image_base64,
            promo_image_mimetype=promo_image_mimetype,
            technical_problem_hint=technical_problem_hint,
            reminder_kind=reminder_kind,
            skip_evolution_send=skip_evolution_send,
            scheduled_send_at_utc=scheduled_send_at_utc,
        )

    bundle = build_preventive_reminder_send_bundle(
        db,
        tenant_id=tenant_id,
        historico_servico_id=historico_servico_id,
        promo_image_url=promo_image_url,
        promo_image_base64=promo_image_base64,
        promo_image_mimetype=promo_image_mimetype,
        technical_problem_hint=technical_problem_hint,
    )
    hist = bundle.hist
    tenant = bundle.tenant
    dest = bundle.dest
    body = bundle.body
    url = bundle.url
    b64 = bundle.b64
    mimetype = bundle.mimetype
    instance_name = bundle.instance_name

    now_utc = datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    sched = scheduled_send_at_utc
    if sched is not None and sched.tzinfo is None:
        sched = sched.replace(tzinfo=timezone.utc)
    use_schedule = sched is not None and sched > now_utc

    job = create_message_job(
        db,
        tenant_id=tenant_id,
        created_by_user=created_by_user,
        template_key="preventive_maintenance",
        recipient_whatsapp=dest,
        rendered_message=body,
        reference_type="preventive_historico",
        reference_id=hist.id,
        scheduled_for=sched if use_schedule else None,
    )

    if use_schedule:
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="preventive_reminder_scheduled",
            payload={"scheduled_for": sched.isoformat(), "historico_servico_id": hist.id},
            job_id=job.id,
        )
        db.commit()
        db.refresh(job)
        return job

    if skip_evolution_send:
        db.commit()
        db.refresh(job)
        return job

    _deliver_preventive_evolution_message(
        db,
        tenant_id=tenant_id,
        tenant=tenant,
        instance_name=instance_name,
        historico_servico_id=hist.id,
        client_id=hist.client_id,
        dest=dest,
        body=body,
        url=url,
        b64=b64,
        mimetype=mimetype,
        reminder_kind=reminder_kind,
        job=job,
    )
    item = _historico_item_dict(
        hist,
        hist.client,
        hist.service,
        today=tenant_local_date(datetime.now(timezone.utc), tenant.timezone),
        deadline=tenant_local_date(datetime.now(timezone.utc), tenant.timezone) + timedelta(days=400),
    )
    if item is not None:
        from app.preventive_schedule_whatsapp import save_preventive_reminder_context

        save_preventive_reminder_context(
            db,
            tenant_id=tenant_id,
            client_id=hist.client_id,
            whatsapp_digits=dest,
            whatsapp_job_id=job.id,
            items=[item],
        )
    db.commit()
    db.refresh(job)
    return job


def build_preventive_grouped_send_bundle(
    db: Session,
    *,
    tenant_id: int,
    items: list[dict[str, Any]],
    promo_image_url: str | None = None,
    promo_image_base64: str | None = None,
    promo_image_mimetype: str | None = None,
    technical_problem_hint: str | None = None,
) -> tuple[Tenant, Client, str, str, str | None, str | None, str, str, int | None]:
    if not items:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nenhum item para enviar.")
    client_id = int(items[0]["client_id"])
    keys = {_preventive_item_due_month_key(i) for i in items}
    if len(keys) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Itens devem ser do mesmo cliente e mês de vencimento.",
        )
    cli = db.execute(select(Client).where(Client.id == client_id, Client.tenant_id == tenant_id)).scalar_one_or_none()
    if cli is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")
    if bool(cli.preventive_campaign_opt_out):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cliente optou por não receber campanhas de manutenção preventiva.",
        )
    ok_wa, dest = client_whatsapp_destination(cli)
    if not ok_wa or not dest:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cliente sem WhatsApp válido cadastrado.",
        )
    tenant = load_tenant_settings_row(db, tenant_id)
    body = render_preventive_grouped_message(
        tenant=tenant,
        client_name=cli.name,
        items=items,
        problem_hint=technical_problem_hint,
    )
    body = _finalize_preventive_whatsapp_body(
        db,
        tenant_id=tenant_id,
        tenant=tenant,
        rendered_body=body,
        client_name=cli.name,
    )
    url, b64, mimetype = _resolve_preventive_promo_media(
        tenant,
        promo_image_url=promo_image_url,
        promo_image_base64=promo_image_base64,
        promo_image_mimetype=promo_image_mimetype,
    )
    instance_name = _resolve_tenant_instance(db, tenant_id)
    anchor_historico_id = _resolve_group_anchor_historico_id(items)
    return tenant, cli, dest, body, url, b64, mimetype, instance_name, anchor_historico_id


def dispatch_preventive_grouped_reminder(
    db: Session,
    *,
    tenant_id: int,
    created_by_user: User | None,
    items: list[dict[str, Any]],
    promo_image_url: str | None = None,
    promo_image_base64: str | None = None,
    promo_image_mimetype: str | None = None,
    technical_problem_hint: str | None = None,
    reminder_kind: str = REMINDER_KIND_MANUAL,
    skip_evolution_send: bool = False,
    scheduled_send_at_utc: datetime | None = None,
) -> WhatsappMessageJob:
    tenant, cli, dest, body, url, b64, mimetype, instance_name, anchor_historico_id = (
        build_preventive_grouped_send_bundle(
            db,
            tenant_id=tenant_id,
            items=items,
            promo_image_url=promo_image_url,
            promo_image_base64=promo_image_base64,
            promo_image_mimetype=promo_image_mimetype,
            technical_problem_hint=technical_problem_hint,
        )
    )

    now_utc = datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    sched = scheduled_send_at_utc
    if sched is not None and sched.tzinfo is None:
        sched = sched.replace(tzinfo=timezone.utc)
    use_schedule = sched is not None and sched > now_utc

    # Sempre `preventive_client`: itens da gestão por equipamento usam historico_servico_id=0.
    job = create_message_job(
        db,
        tenant_id=tenant_id,
        created_by_user=created_by_user,
        template_key="preventive_maintenance",
        recipient_whatsapp=dest,
        rendered_message=body,
        reference_type="preventive_client",
        reference_id=cli.id,
        scheduled_for=sched if use_schedule else None,
    )

    if use_schedule:
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="preventive_reminder_scheduled",
            payload={
                "scheduled_for": sched.isoformat(),
                "client_id": cli.id,
                "historico_servico_id": anchor_historico_id,
                "equipment_count": len(items),
            },
            job_id=job.id,
        )
        db.commit()
        db.refresh(job)
        return job

    if skip_evolution_send:
        db.commit()
        db.refresh(job)
        return job

    _deliver_preventive_evolution_message(
        db,
        tenant_id=tenant_id,
        tenant=tenant,
        instance_name=instance_name,
        historico_servico_id=anchor_historico_id,
        client_id=cli.id,
        dest=dest,
        body=body,
        url=url,
        b64=b64,
        mimetype=mimetype,
        reminder_kind=reminder_kind,
        job=job,
    )
    from app.preventive_schedule_whatsapp import save_preventive_reminder_context

    save_preventive_reminder_context(
        db,
        tenant_id=tenant_id,
        client_id=cli.id,
        whatsapp_digits=dest,
        whatsapp_job_id=job.id,
        items=items,
    )
    db.commit()
    db.refresh(job)
    return job


def flush_single_scheduled_preventive_job(db: Session, job: WhatsappMessageJob) -> None:
    """Envia Evolution para um job preventivo já na fila com `scheduled_for` vencido."""
    tenant_id = job.tenant_id
    hist_id = job.reference_id
    if hist_id is None:
        job.status = WhatsappMessageStatus.FAILED
        job.failed_at = datetime.now(timezone.utc)
        job.error_message = "Job sem histórico de referência."
        db.commit()
        return

    hist = db.execute(
        select(HistoricoServico)
        .where(HistoricoServico.id == hist_id, HistoricoServico.tenant_id == tenant_id)
        .options(joinedload(HistoricoServico.service), joinedload(HistoricoServico.client))
    ).scalar_one_or_none()
    if hist is None:
        job.status = WhatsappMessageStatus.FAILED
        job.failed_at = datetime.now(timezone.utc)
        job.error_message = "Histórico não encontrado."
        db.commit()
        return

    svc = hist.service
    cli = hist.client
    if svc is None or svc.periodicidade_meses is None:
        job.status = WhatsappMessageStatus.FAILED
        job.failed_at = datetime.now(timezone.utc)
        job.error_message = "Serviço sem periodicidade."
        db.commit()
        return
    if cli is not None and bool(cli.preventive_campaign_opt_out):
        job.status = WhatsappMessageStatus.FAILED
        job.failed_at = datetime.now(timezone.utc)
        job.error_message = "Cliente optou por não receber campanhas preventivas."
        db.commit()
        return
    ok_wa, dest = client_whatsapp_destination(cli)
    if not ok_wa or not dest:
        job.status = WhatsappMessageStatus.FAILED
        job.failed_at = datetime.now(timezone.utc)
        job.error_message = "Cliente sem WhatsApp válido."
        db.commit()
        return

    tenant = load_tenant_settings_row(db, tenant_id)
    today = tenant_local_date(datetime.now(timezone.utc), tenant.timezone)
    meses = months_between_approx(hist.data_realizacao, today)
    body = render_preventive_message(
        tenant=tenant,
        client_name=cli.name,
        service_name=svc.name,
        months_display=meses,
        problem_hint=None,
    )
    job.rendered_message = body

    url = (tenant.preventive_promo_image_url or "").strip() or None
    b64 = None
    mimetype = (tenant.preventive_promo_image_mimetype or "").strip() or "image/jpeg"

    instance_name = _resolve_tenant_instance(db, tenant_id)
    _deliver_preventive_evolution_message(
        db,
        tenant_id=tenant_id,
        tenant=tenant,
        instance_name=instance_name,
        historico_servico_id=hist.id,
        client_id=hist.client_id,
        dest=dest,
        body=body,
        url=url,
        b64=b64,
        mimetype=mimetype,
        reminder_kind=REMINDER_KIND_MANUAL,
        job=job,
    )


def process_pending_preventive_notifications(now_utc: datetime | None = None) -> dict[str, int]:
    """Processa a fila de lembretes preventivos agendados (WhatsApp) com template do tenant."""
    return flush_scheduled_preventive_whatsapp_jobs(now_utc)


def flush_scheduled_preventive_whatsapp_jobs(now_utc: datetime | None = None) -> dict[str, int]:
    """Processa jobs preventivos agendados (`scheduled_for` <= agora)."""
    now = now_utc or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    processed = 0
    failed = 0
    from app.database import SessionLocal

    with SessionLocal() as db:
        jobs = (
            db.execute(
                select(WhatsappMessageJob)
                .where(
                    WhatsappMessageJob.template_key == "preventive_maintenance",
                    WhatsappMessageJob.status == WhatsappMessageStatus.QUEUED,
                    WhatsappMessageJob.scheduled_for.isnot(None),
                    WhatsappMessageJob.scheduled_for <= now,
                    WhatsappMessageJob.reference_type == "preventive_historico",
                )
                .order_by(WhatsappMessageJob.scheduled_for.asc())
                .limit(40)
            )
            .scalars()
            .all()
        )
        for job in jobs:
            try:
                flush_single_scheduled_preventive_job(db, job)
                processed += 1
            except HTTPException:
                failed += 1
                db.rollback()
            except Exception:
                logger.exception("flush preventive scheduled job failed job_id=%s", job.id)
                failed += 1
                db.rollback()

    return {"processed": processed, "failed": failed}


def register_manual_preventive_entry(
    db: Session,
    *,
    tenant_id: int,
    created_by_user: User,
    client_id: int | None,
    new_client: PreventiveQuickClientCreate | None,
    equipment_id: int | None,
    equipment_label: str | None = None,
    entry_mode: Literal["temporary", "existing"] = "temporary",
    service_id: int,
    data_realizacao: date,
    notes: str | None,
    reminder_send: Literal["none", "now", "scheduled"],
    reminder_local_date: date | None,
    reminder_local_time: str | None,
    promo_image_url: str | None = None,
    promo_image_base64: str | None = None,
    promo_image_mimetype: str | None = None,
    technical_problem_hint: str | None = None,
) -> tuple[HistoricoServico, WhatsappMessageJob | None]:
    if (client_id is None) == (new_client is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe client_id ou new_client.",
        )

    if client_id is not None:
        cli = db.execute(
            select(Client).where(Client.id == client_id, Client.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if cli is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")
    else:
        assert new_client is not None
        cli = create_quick_client_for_preventive(db, tenant_id=tenant_id, payload=new_client)

    svc = db.execute(
        select(Service).where(Service.id == service_id, Service.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if svc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Serviço não encontrado.")
    from app.services.service_preventive_config import preventive_config_from_service

    svc_cfg = preventive_config_from_service(svc)
    if not svc_cfg.get("preventive_enabled") and svc.periodicidade_meses is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Serviço sem gestão preventiva ativa (ative em Serviços ou defina periodicidade).",
        )

    resolved_equipment_id = equipment_id
    if resolved_equipment_id is None:
        label = (equipment_label or "").strip()
        if not label:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Informe o apelido do aparelho (ex.: Split sala, Mercado).",
            )
        from app.equipment_service_preventive import create_temporary_equipment_for_preventive

        temp_eq = create_temporary_equipment_for_preventive(
            db,
            tenant_id=tenant_id,
            client_id=cli.id,
            label=label,
        )
        resolved_equipment_id = temp_eq.id

    if reminder_send != "none":
        if bool(cli.preventive_campaign_opt_out):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cliente optou por não receber campanhas de manutenção preventiva.",
            )
        ok_wa, _wa_dest = client_whatsapp_destination(cli)
        if not ok_wa:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cliente sem WhatsApp válido cadastrado; ajuste o cadastro ou escolha apenas registrar.",
            )
        _resolve_tenant_instance(db, tenant_id)

    scheduled_utc: datetime | None = None
    if reminder_send == "scheduled":
        tenant_tz_row = load_tenant_settings_row(db, tenant_id)
        rd = reminder_local_date
        if rd is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Informe a data do lembrete agendado.",
            )
        scheduled_utc = tenant_reminder_local_to_utc(
            tenant_tz_row.timezone,
            rd,
            reminder_local_time or "09:00",
        )
        now_chk = datetime.now(timezone.utc)
        if now_chk.tzinfo is None:
            now_chk = now_chk.replace(tzinfo=timezone.utc)
        if scheduled_utc <= now_chk:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "A data e hora do envio já passaram no fuso da empresa. "
                    "Escolha um horário futuro ou use “Enviar agora”."
                ),
            )

    hist = create_historico(
        db,
        tenant_id=tenant_id,
        client_id=cli.id,
        service_id=service_id,
        data_realizacao=data_realizacao,
        service_order_id=None,
        notes=notes,
    )

    from app.equipment_service_preventive import record_manual_preventive_schedule

    record_manual_preventive_schedule(
        db,
        tenant_id=tenant_id,
        equipment_id=int(resolved_equipment_id),
        service_id=service_id,
        performed_date=data_realizacao,
    )

    equipment_rule_id: int | None = None
    if equipment_id is not None:
        from app.equipment_preventive_rules import record_manual_equipment_preventive

        interval_months = int(svc.periodicidade_meses or svc_cfg.get("preventive_interval_value") or 6)
        rule = record_manual_equipment_preventive(
            db,
            tenant_id=tenant_id,
            equipment_id=equipment_id,
            interval_value=interval_months,
            interval_type="months",
            performed_date=data_realizacao,
        )
        equipment_rule_id = rule.id

    db.commit()

    job: WhatsappMessageJob | None = None
    if reminder_send != "none":
        group = find_preventive_group_for_item(
            db,
            tenant_id=tenant_id,
            window_days=400,
            historico_servico_id=hist.id,
            rule_id=equipment_rule_id,
        )
        if group is not None:
            job = dispatch_preventive_grouped_reminder(
                db,
                tenant_id=tenant_id,
                created_by_user=created_by_user,
                items=group["items"],
                promo_image_url=promo_image_url,
                promo_image_base64=promo_image_base64,
                promo_image_mimetype=promo_image_mimetype,
                technical_problem_hint=technical_problem_hint,
                reminder_kind=REMINDER_KIND_MANUAL,
                scheduled_send_at_utc=scheduled_utc if reminder_send == "scheduled" else None,
            )
            return hist, job

        job = dispatch_preventive_reminder(
            db,
            tenant_id=tenant_id,
            created_by_user=created_by_user,
            historico_servico_id=hist.id,
            promo_image_url=promo_image_url,
            promo_image_base64=promo_image_base64,
            promo_image_mimetype=promo_image_mimetype,
            technical_problem_hint=technical_problem_hint,
            reminder_kind=REMINDER_KIND_MANUAL,
            scheduled_send_at_utc=scheduled_utc if reminder_send == "scheduled" else None,
        )

    return hist, job


def _group_already_sent_auto_reminder_today(
    db: Session,
    *,
    tenant_id: int,
    group: dict[str, Any],
    reminder_kind: str,
    tenant_tz: str,
    tenant_local_day: date,
) -> bool:
    """Evita reenvio no mesmo dia civil (por histórico do grupo ou job preventivo do cliente)."""
    for item in group.get("items") or []:
        hid = int(item.get("historico_servico_id") or 0)
        if hid > 0 and _already_sent_reminder_on_tenant_local_day(
            db,
            tenant_id=tenant_id,
            historico_id=hid,
            reminder_kind=reminder_kind,
            tenant_tz=tenant_tz,
            tenant_local_day=tenant_local_day,
        ):
            return True

    client_id = int(group["client_id"])
    since = datetime.now(timezone.utc) - timedelta(days=2)
    jobs = db.execute(
        select(WhatsappMessageJob)
        .where(
            WhatsappMessageJob.tenant_id == tenant_id,
            WhatsappMessageJob.template_key == "preventive_maintenance",
            WhatsappMessageJob.reference_type == "preventive_client",
            WhatsappMessageJob.reference_id == client_id,
            WhatsappMessageJob.status == WhatsappMessageStatus.SENT,
            WhatsappMessageJob.created_at >= since,
        )
        .order_by(WhatsappMessageJob.id.desc())
        .limit(20)
    ).scalars().all()
    for job in jobs:
        sent_at = job.sent_at or job.created_at
        if sent_at is None:
            continue
        if tenant_local_date(sent_at, tenant_tz) != tenant_local_day:
            continue
        lp = db.execute(
            select(LembretePreventivo).where(LembretePreventivo.whatsapp_job_id == job.id)
        ).scalar_one_or_none()
        if lp is None or lp.reminder_kind == reminder_kind:
            return True
    return False


def _collect_auto_reminder_groups_for_tenant(
    db: Session,
    *,
    tenant: Tenant,
    local_today: date,
    advance_days: int,
    holidays: set[date],
) -> list[dict[str, Any]]:
    """Grupos (cliente + mês) cujo lembrete automático cai no dia civil local (ajustado a dias úteis)."""
    window_days = max(advance_days, 1)
    rows = list_preventive_items(db, tenant_id=tenant.id, window_days=window_days)
    eligible = [r for r in rows if r.get("whatsapp_valido")]

    matching: list[dict[str, Any]] = []
    for row in eligible:
        due = _preventive_item_due_date(row)
        effective = effective_preventive_reminder_day(tenant, due, advance_days, holidays)
        if effective == local_today:
            matching.append(row)

    return group_preventive_items_by_client_and_due_month(matching)


def dispatch_preventive_due_today(
    *,
    now_utc: datetime | None = None,
) -> dict[str, int]:
    """Automático: um lembrete por cliente — no dia do vencimento (0 dias) ou N dias antes, em dias úteis e no expediente."""
    now = now_utc or datetime.now(timezone.utc)
    now = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
    checked = 0
    sent_due = 0
    sent_advance = 0
    from app.database import SessionLocal

    with SessionLocal() as db:
        tenants = db.execute(select(Tenant)).scalars().all()
        for tenant in tenants:
            if not tenant_whatsapp_automation_active(tenant):
                continue
            if not bool(getattr(tenant, "preventive_auto_whatsapp_enabled", False)):
                continue
            tz_name = tenant.timezone or "UTC"
            holidays = load_tenant_holiday_dates(db, tenant.id)
            if not is_within_tenant_work_hours(tenant, now, holidays):
                continue
            local_today = tenant_local_date(now, tz_name)
            advance_days = max(0, int(tenant.preventive_auto_remind_days_before or 0))

            window_days = max(advance_days, 1)
            checked += len(list_preventive_items(db, tenant_id=tenant.id, window_days=window_days))

            auto_groups = _collect_auto_reminder_groups_for_tenant(
                db,
                tenant=tenant,
                local_today=local_today,
                advance_days=advance_days,
                holidays=holidays,
            )
            auto_kind = REMINDER_KIND_AUTO_ADVANCE if advance_days > 0 else REMINDER_KIND_AUTO_DUE

            for group in auto_groups:
                if _group_already_sent_auto_reminder_today(
                    db,
                    tenant_id=tenant.id,
                    group=group,
                    reminder_kind=auto_kind,
                    tenant_tz=tz_name,
                    tenant_local_day=local_today,
                ):
                    continue
                try:
                    dispatch_preventive_grouped_reminder(
                        db,
                        tenant_id=tenant.id,
                        created_by_user=None,
                        items=group["items"],
                        reminder_kind=auto_kind,
                    )
                    if advance_days > 0:
                        sent_advance += 1
                    else:
                        sent_due += 1
                except Exception:
                    logger.exception(
                        "preventive auto reminder failed tenant_id=%s client_id=%s due=%s-%02d kind=%s",
                        tenant.id,
                        group.get("client_id"),
                        group.get("due_year"),
                        group.get("due_month"),
                        auto_kind,
                    )
                    db.rollback()
                    continue

    return {
        "checked": checked,
        "sent": sent_due + sent_advance,
        "sent_due": sent_due,
        "sent_advance": sent_advance,
    }


def dispatch_preventive_reminders_bulk(
    db: Session,
    *,
    tenant_id: int,
    created_by_user: User,
    historico_servico_ids: list[int],
    promo_image_url: str | None = None,
    window_days: int = 365,
) -> dict[str, Any]:
    rows = list_preventive_items(db, tenant_id=tenant_id, window_days=window_days)
    eligible = [r for r in rows if r.get("whatsapp_valido")]
    all_groups = group_preventive_items_by_client_and_due_month(eligible)

    if historico_servico_ids:
        id_set = {int(h) for h in historico_servico_ids if int(h) > 0}
        target_keys = {
            _preventive_item_due_month_key(r)
            for r in eligible
            if int(r.get("historico_servico_id") or 0) in id_set
        }
        groups = [g for g in all_groups if _preventive_item_due_month_key(g["items"][0]) in target_keys]
    else:
        groups = all_groups

    errors: list[dict[str, Any]] = []
    sent = 0
    for group in groups:
        try:
            dispatch_preventive_grouped_reminder(
                db,
                tenant_id=tenant_id,
                created_by_user=created_by_user,
                items=group["items"],
                promo_image_url=promo_image_url,
            )
            sent += 1
        except HTTPException as exc:
            detail = exc.detail
            if not isinstance(detail, str):
                detail = str(detail)
            errors.append(
                {
                    "client_id": group.get("client_id"),
                    "due_month": f"{group.get('due_year')}-{group.get('due_month'):02d}",
                    "detail": detail,
                }
            )
        except Exception:
            logger.exception(
                "preventive bulk send failed client_id=%s due=%s-%02d",
                group.get("client_id"),
                group.get("due_year"),
                group.get("due_month"),
            )
            errors.append(
                {
                    "client_id": group.get("client_id"),
                    "due_month": f"{group.get('due_year')}-{group.get('due_month'):02d}",
                    "detail": "Erro interno ao enviar.",
                }
            )
            db.rollback()
    attempted = len(groups)
    return {"attempted": attempted, "sent": sent, "failed": len(errors), "errors": errors[:100]}


def run_preventive_reminder_send_background(
    tenant_id: int,
    user_id: int,
    historico_servico_id: int | None,
    rule_id: int | None,
    window_days: int,
    promo_image_url: str | None,
    promo_image_base64: str | None,
    promo_image_mimetype: str | None,
    technical_problem_hint: str | None,
    client_id: int | None = None,
    year: int | None = None,
    month: int | None = None,
) -> None:
    """Envio unitário (agrupado por cliente+mês) fora do ciclo ASGI."""
    from app.database import SessionLocal

    logger.info(
        "preventive single background iniciado tenant_id=%s historico=%s rule_id=%s client=%s user_id=%s",
        tenant_id,
        historico_servico_id,
        rule_id,
        client_id,
        user_id,
    )
    group: dict[str, Any] | None = None
    try:
        with SessionLocal() as db:
            user = db.get(User, user_id)
            if user is None or user.tenant_id != tenant_id:
                logger.error(
                    "preventive single background: usuário inválido user_id=%s tenant_id=%s",
                    user_id,
                    tenant_id,
                )
                return
            if client_id is not None and year is not None and month is not None:
                from app.equipment_service_preventive import find_preventive_group_for_client_month

                group = find_preventive_group_for_client_month(
                    db,
                    tenant_id=tenant_id,
                    client_id=client_id,
                    year=year,
                    month=month,
                )
            else:
                group = find_preventive_group_for_item(
                    db,
                    tenant_id=tenant_id,
                    window_days=window_days,
                    historico_servico_id=historico_servico_id,
                    rule_id=rule_id,
                )
            if group is None:
                logger.warning(
                    "preventive single background: grupo não encontrado tenant_id=%s historico=%s rule_id=%s client=%s",
                    tenant_id,
                    historico_servico_id,
                    rule_id,
                    client_id,
                )
                return
            dispatch_preventive_grouped_reminder(
                db,
                tenant_id=tenant_id,
                created_by_user=user,
                items=group["items"],
                promo_image_url=promo_image_url,
                promo_image_base64=promo_image_base64,
                promo_image_mimetype=promo_image_mimetype,
                technical_problem_hint=technical_problem_hint,
            )
        if group is not None:
            logger.info(
                "preventive single background concluído tenant_id=%s client_id=%s equipamentos=%s",
                tenant_id,
                group["client_id"],
                len(group["items"]),
            )
    except HTTPException as exc:
        logger.warning(
            "preventive single background falhou tenant_id=%s detail=%s",
            tenant_id,
            exc.detail,
        )
    except Exception:
        logger.exception("preventive single background falhou tenant_id=%s", tenant_id)


def run_preventive_reminders_bulk_background(
    tenant_id: int,
    user_id: int,
    historico_servico_ids: list[int],
    promo_image_url: str | None,
    window_days: int,
) -> None:
    """Executa lote em thread dedicada (evita BaseHTTPMiddleware impedir BackgroundTasks)."""
    from app.database import SessionLocal

    logger.info(
        "preventive bulk background iniciado tenant_id=%s ids=%s window_days=%s",
        tenant_id,
        len(historico_servico_ids),
        window_days,
    )
    try:
        with SessionLocal() as db:
            user = db.get(User, user_id)
            if user is None or user.tenant_id != tenant_id:
                logger.error(
                    "preventive bulk background: usuário inválido user_id=%s tenant_id=%s",
                    user_id,
                    tenant_id,
                )
                return
            result = dispatch_preventive_reminders_bulk(
                db,
                tenant_id=tenant_id,
                created_by_user=user,
                historico_servico_ids=historico_servico_ids,
                promo_image_url=promo_image_url,
                window_days=window_days,
            )
            logger.info(
                "preventive bulk background concluído tenant=%s attempted=%s sent=%s failed=%s",
                tenant_id,
                result["attempted"],
                result["sent"],
                result["failed"],
            )
    except Exception:
        logger.exception("preventive bulk background falhou tenant_id=%s", tenant_id)


def spawn_preventive_reminder_send_thread(
    tenant_id: int,
    user_id: int,
    historico_servico_id: int | None,
    rule_id: int | None,
    window_days: int,
    promo_image_url: str | None,
    promo_image_base64: str | None,
    promo_image_mimetype: str | None,
    technical_problem_hint: str | None,
    client_id: int | None = None,
    year: int | None = None,
    month: int | None = None,
) -> None:
    """Dispara envio unitário agrupado em thread."""
    ref = historico_servico_id or rule_id or client_id or 0
    threading.Thread(
        target=run_preventive_reminder_send_background,
        args=(
            tenant_id,
            user_id,
            historico_servico_id,
            rule_id,
            window_days,
            promo_image_url,
            promo_image_base64,
            promo_image_mimetype,
            technical_problem_hint,
            client_id,
            year,
            month,
        ),
        daemon=True,
        name=f"preventive-send-{ref}",
    ).start()


def spawn_preventive_reminders_bulk_thread(
    tenant_id: int,
    user_id: int,
    historico_servico_ids: list[int],
    promo_image_url: str | None,
    window_days: int,
) -> None:
    """Dispara lote em thread (BackgroundTasks pode não rodar com BaseHTTPMiddleware)."""
    threading.Thread(
        target=run_preventive_reminders_bulk_background,
        args=(tenant_id, user_id, list(historico_servico_ids), promo_image_url, window_days),
        daemon=True,
        name="preventive-bulk",
    ).start()


def list_interest_leads(db: Session, *, tenant_id: int, limit: int = 100) -> list[PreventiveInterestLead]:
    from sqlalchemy.orm import joinedload

    return (
        db.execute(
            select(PreventiveInterestLead)
            .options(joinedload(PreventiveInterestLead.client))
            .where(PreventiveInterestLead.tenant_id == tenant_id)
            .order_by(PreventiveInterestLead.id.desc())
            .limit(limit)
        )
        .scalars()
        .unique()
        .all()
    )


def _extract_button_id_from_payload(payload: dict[str, Any]) -> str | None:
    data = payload.get("data")
    if not isinstance(data, dict):
        return None
    msg = data.get("message")
    if not isinstance(msg, dict):
        return None
    br = msg.get("buttonsResponseMessage")
    if isinstance(br, dict):
        raw = str(br.get("selectedButtonId") or "").strip()
        if raw:
            return raw
    br2 = msg.get("buttonReply")
    if isinstance(br2, dict):
        raw = str(br2.get("id") or "").strip()
        if raw:
            return raw
    return None


def _whatsapp_digits_match(jid_digits: str, recipient: str | None) -> bool:
    da = "".join(ch for ch in jid_digits if ch.isdigit())
    db_rec = "".join(ch for ch in (recipient or "") if ch.isdigit())
    if len(da) < 8 or len(db_rec) < 8:
        return False
    return da.endswith(db_rec[-11:]) or db_rec.endswith(da[-11:]) or da == db_rec


def _latest_preventive_lembrete_for_digits(
    db: Session, *, tenant_id: int, jid_digits: str
) -> LembretePreventivo | None:
    since = datetime.now(timezone.utc) - timedelta(days=14)
    rows = db.execute(
        select(LembretePreventivo)
        .where(
            LembretePreventivo.tenant_id == tenant_id,
            LembretePreventivo.created_at >= since,
            LembretePreventivo.reminder_kind.in_(
                (REMINDER_KIND_MANUAL, REMINDER_KIND_AUTO_DUE, REMINDER_KIND_AUTO_ADVANCE)
            ),
        )
        .order_by(LembretePreventivo.created_at.desc())
        .limit(80)
    ).scalars().all()
    for lp in rows:
        if _whatsapp_digits_match(jid_digits, lp.recipient_whatsapp):
            return lp
    return None


def _plain_text_from_evolution_upsert(payload: dict[str, Any]) -> str:
    data = payload.get("data")
    if not isinstance(data, dict):
        return ""
    msg = data.get("message")
    if not isinstance(msg, dict):
        return ""
    raw = str(msg.get("conversation") or "").strip()
    if not raw and isinstance(msg.get("extendedTextMessage"), dict):
        raw = str(msg["extendedTextMessage"].get("text") or "").strip()
    return raw


def _preventive_text_intent(text: str) -> PreventiveInterestKind | None:
    raw = (text or "").strip().upper()
    for punct in "!?.…":
        raw = raw.replace(punct, "")
    raw = raw.strip()
    if raw == "MAIS":
        return PreventiveInterestKind.MORE
    if raw == "AGENDAR":
        return PreventiveInterestKind.SCHEDULE
    return None


def _record_preventive_interest_lead(
    db: Session,
    *,
    tenant_id: int,
    hist: HistoricoServico,
    kind: PreventiveInterestKind,
    message_text: str,
    payload: dict[str, Any],
    key: dict[str, Any],
) -> None:
    remote_jid = str(key.get("remoteJid") or "")
    digits = "".join(ch for ch in remote_jid if ch.isdigit())
    lead = PreventiveInterestLead(
        tenant_id=tenant_id,
        client_id=hist.client_id,
        historico_servico_id=hist.id,
        whatsapp_digits=digits or "0",
        interest_kind=kind,
        message_text=message_text,
        raw_payload_json=json.dumps(payload, ensure_ascii=True)[:12000],
        provider_message_id=str(key.get("id") or "") if key else None,
    )
    db.add(lead)
    append_event(
        db,
        tenant_id=tenant_id,
        event_type="preventive_interest_recorded",
        payload={"historico_servico_id": hist.id, "kind": kind.value},
        job_id=None,
    )


def try_consume_preventive_reply(db: Session, *, tenant_id: int, payload: dict[str, Any]) -> bool:
    """Botões ou texto MAIS/AGENDAR (fallback quando a Evolution envia só texto)."""
    event_name = str(payload.get("event") or payload.get("type") or "").lower()
    if event_name != "messages.upsert":
        return False

    data = payload.get("data")
    if not isinstance(data, dict):
        return False
    key = data.get("key") if isinstance(data.get("key"), dict) else {}
    if isinstance(key, dict) and bool(key.get("fromMe")):
        return False

    from app.preventive_schedule_whatsapp import try_handle_preventive_schedule_reply

    if try_handle_preventive_schedule_reply(db, tenant_id=tenant_id, payload=payload):
        return True

    btn_id = _extract_button_id_from_payload(payload)
    if btn_id:
        kind_btn: PreventiveInterestKind | None = None
        raw_hid: str | None = None
        if btn_id.startswith(PREVENTIVE_MORE_PREFIX):
            kind_btn = PreventiveInterestKind.MORE
            raw_hid = btn_id[len(PREVENTIVE_MORE_PREFIX) :]
        elif btn_id.startswith(PREVENTIVE_SCHEDULE_PREFIX):
            remote_jid = str(key.get("remoteJid") or "") if isinstance(key, dict) else ""
            jid_digits = "".join(ch for ch in remote_jid if ch.isdigit())
            if len(jid_digits) >= 8:
                from app.preventive_schedule_whatsapp import _start_schedule_flow

                return _start_schedule_flow(
                    db,
                    tenant_id=tenant_id,
                    jid_digits=jid_digits,
                    plain="AGENDAR",
                    payload=payload,
                    key=key if isinstance(key, dict) else {},
                )
            return True
        else:
            return False

        if not raw_hid or not raw_hid.isdigit():
            return False
        historico_id = int(raw_hid)

        hist_btn = db.execute(
            select(HistoricoServico).where(
                HistoricoServico.id == historico_id,
                HistoricoServico.tenant_id == tenant_id,
            )
        ).scalar_one_or_none()
        if hist_btn is None:
            append_event(
                db,
                tenant_id=tenant_id,
                event_type="preventive_reply_unknown_historico",
                payload={"button_id": btn_id},
                job_id=None,
            )
            return True

        _record_preventive_interest_lead(
            db,
            tenant_id=tenant_id,
            hist=hist_btn,
            kind=kind_btn,
            message_text=btn_id,
            payload=payload,
            key=key if isinstance(key, dict) else {},
        )
        return True

    plain = _plain_text_from_evolution_upsert(payload)
    intent = _preventive_text_intent(plain)
    if intent is None:
        return False

    remote_jid = str(key.get("remoteJid") or "") if isinstance(key, dict) else ""
    jid_digits = "".join(ch for ch in remote_jid if ch.isdigit())
    if len(jid_digits) < 8:
        return False

    lp = _latest_preventive_lembrete_for_digits(db, tenant_id=tenant_id, jid_digits=jid_digits)
    if lp is None:
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="preventive_reply_text_no_context",
            payload={"text": plain[:80]},
            job_id=None,
        )
        return True

    hist_txt = db.get(HistoricoServico, lp.historico_servico_id)
    if hist_txt is None or hist_txt.tenant_id != tenant_id:
        return True

    _record_preventive_interest_lead(
        db,
        tenant_id=tenant_id,
        hist=hist_txt,
        kind=intent,
        message_text=plain[:500],
        payload=payload,
        key=key if isinstance(key, dict) else {},
    )
    return True
