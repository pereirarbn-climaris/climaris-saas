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

from app.schemas_preventive import PreventivePreviewOut, PreventiveQuickClientCreate, PreventiveSettingsPatch
from app.whatsapp import (
    append_event,
    create_message_job,
    evolution_send_media_message,
    normalize_whatsapp_number,
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
    meses = months_between_approx(hist.data_realizacao, today)
    body = render_preventive_message(
        tenant=tenant,
        client_name=cli.name,
        service_name=svc.name,
        months_display=meses,
        problem_hint=technical_problem_hint,
    )

    url = (promo_image_url or "").strip() or (tenant.preventive_promo_image_url or "").strip() or None
    b64 = (promo_image_base64 or "").strip() or None
    if b64 and len(b64) > 350_000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Imagem Base64 muito grande; use uma URL ou reduza o arquivo.",
        )
    mimetype = (
        (promo_image_mimetype or "").strip()
        or (tenant.preventive_promo_image_mimetype or "").strip()
        or "image/jpeg"
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
    "Olá {nome}, notamos que faz {meses} meses desde sua última manutenção de {servico}. "
    "Isso é fundamental para evitar {problema} e garantir a qualidade do ar."
)


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


def load_tenant_settings_row(db: Session, tenant_id: int) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    return tenant


def get_preventive_settings(db: Session, tenant_id: int) -> dict[str, Any]:
    t = load_tenant_settings_row(db, tenant_id)
    return {
        "preventive_promo_image_url": t.preventive_promo_image_url,
        "preventive_promo_image_mimetype": t.preventive_promo_image_mimetype or "image/jpeg",
        "preventive_technical_problem_hint": t.preventive_technical_problem_hint,
        "preventive_button_more_text": t.preventive_button_more_text,
        "preventive_button_schedule_text": t.preventive_button_schedule_text,
        "preventive_message_template": t.preventive_message_template,
        "preventive_auto_remind_days_before": int(t.preventive_auto_remind_days_before or 0),
    }


def patch_preventive_settings(db: Session, tenant_id: int, payload: PreventiveSettingsPatch) -> dict[str, Any]:
    t = load_tenant_settings_row(db, tenant_id)
    data = payload.model_dump(exclude_unset=True)
    for key, val in data.items():
        setattr(t, key, val)
    db.add(t)
    db.commit()
    db.refresh(t)
    return get_preventive_settings(db, tenant_id)


def render_preventive_message(
    *,
    tenant: Tenant,
    client_name: str,
    service_name: str,
    months_display: int,
    problem_hint: str | None,
) -> str:
    problema = (problem_hint or tenant.preventive_technical_problem_hint or DEFAULT_TECHNICAL_PROBLEM).strip()
    tpl = (tenant.preventive_message_template or DEFAULT_MESSAGE_TEMPLATE).strip()
    try:
        return tpl.format(
            nome=client_name.strip() or "Cliente",
            meses=str(months_display),
            servico=service_name.strip() or "serviço",
            problema=problema,
        ).strip()
    except Exception:
        return DEFAULT_MESSAGE_TEMPLATE.format(
            nome=client_name.strip() or "Cliente",
            meses=str(months_display),
            servico=service_name.strip() or "serviço",
            problema=problema,
        ).strip()


def build_preview(
    db: Session,
    *,
    tenant_id: int,
    historico_servico_id: int,
    override_problem: str | None = None,
) -> PreventivePreviewOut:
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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Serviço sem periodicidade configurada (6 ou 12 meses).",
        )
    tenant = load_tenant_settings_row(db, tenant_id)
    today = tenant_local_date(datetime.now(timezone.utc), tenant.timezone)
    meses = months_between_approx(hist.data_realizacao, today)
    text = render_preventive_message(
        tenant=tenant,
        client_name=cli.name if cli else "Cliente",
        service_name=svc.name,
        months_display=meses,
        problem_hint=override_problem,
    )
    return PreventivePreviewOut(
        message_text=text,
        image_url=tenant.preventive_promo_image_url,
        image_mimetype=tenant.preventive_promo_image_mimetype or "image/jpeg",
        button_more_label=tenant.preventive_button_more_text,
        button_schedule_label=tenant.preventive_button_schedule_text,
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


def _latest_preventive_whatsapp_jobs_by_historico(
    db: Session, *, tenant_id: int, historico_ids: list[int]
) -> dict[int, WhatsappMessageJob]:
    """Último job preventivo por `historico_servico_id` (maior id)."""
    if not historico_ids:
        return {}
    subq = (
        select(
            WhatsappMessageJob.reference_id.label("hid"),
            func.max(WhatsappMessageJob.id).label("jid"),
        )
        .where(
            WhatsappMessageJob.tenant_id == tenant_id,
            WhatsappMessageJob.template_key == "preventive_maintenance",
            WhatsappMessageJob.reference_type == "preventive_historico",
            WhatsappMessageJob.reference_id.in_(historico_ids),
        )
        .group_by(WhatsappMessageJob.reference_id)
    ).subquery()
    jobs = db.execute(select(WhatsappMessageJob).join(subq, WhatsappMessageJob.id == subq.c.jid)).scalars().all()
    return {int(j.reference_id): j for j in jobs if j.reference_id is not None}


def list_preventive_items(db: Session, *, tenant_id: int, window_days: int) -> list[dict[str, Any]]:
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
    hist: HistoricoServico,
    dest: str,
    body: str,
    url: str | None,
    b64: str | None,
    mimetype: str,
    reminder_kind: str,
    job: WhatsappMessageJob,
) -> None:
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

        lr = LembretePreventivo(
            tenant_id=tenant_id,
            historico_servico_id=hist.id,
            reminder_kind=reminder_kind,
            recipient_whatsapp=dest,
            whatsapp_job_id=job.id,
        )
        db.add(lr)
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="preventive_reminder_sent",
            payload={"historico_servico_id": hist.id, "media": bool(url or b64)},
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
            payload={"error": str(exc.detail), "historico_servico_id": hist.id},
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
) -> WhatsappMessageJob:
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
        hist=hist,
        dest=dest,
        body=body,
        url=url,
        b64=b64,
        mimetype=mimetype,
        reminder_kind=reminder_kind,
        job=job,
    )
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
        hist=hist,
        dest=dest,
        body=body,
        url=url,
        b64=b64,
        mimetype=mimetype,
        reminder_kind=REMINDER_KIND_MANUAL,
        job=job,
    )


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
    if svc.periodicidade_meses is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Serviço sem periodicidade (configure 6 ou 12 meses no cadastro).",
        )

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

    job: WhatsappMessageJob | None = None
    if reminder_send != "none":
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


def dispatch_preventive_due_today(
    *,
    now_utc: datetime | None = None,
) -> dict[str, int]:
    """Automático: vencimento no dia civil do tenant e opcionalmente N dias antes."""
    now = now_utc or datetime.now(timezone.utc)
    now = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
    checked = 0
    sent_due = 0
    sent_advance = 0
    from app.database import SessionLocal

    with SessionLocal() as db:
        tenants = db.execute(select(Tenant)).scalars().all()
        for tenant in tenants:
            tz_name = tenant.timezone or "UTC"
            local_today = tenant_local_date(now, tz_name)
            advance_days = max(0, int(tenant.preventive_auto_remind_days_before or 0))
            sub = _latest_historico_ids_subquery(tenant.id)
            rows = db.execute(
                select(HistoricoServico, Service)
                .join(sub, sub.c.id == HistoricoServico.id)
                .where(sub.c.rn == 1)
                .join(Service, Service.id == HistoricoServico.service_id)
                .where(Service.periodicidade_meses.isnot(None))
            ).all()
            for hist, service in rows:
                checked += 1
                per = service.periodicidade_meses
                if per is None:
                    continue
                nxt = next_due_date(hist.data_realizacao, per)
                if nxt is None:
                    continue
                cli = db.get(Client, hist.client_id)
                if cli is None or bool(cli.preventive_campaign_opt_out):
                    continue
                ok_wa, _ = client_whatsapp_destination(cli)
                if not ok_wa:
                    continue

                if nxt == local_today:
                    if not _already_sent_reminder_on_tenant_local_day(
                        db,
                        tenant_id=tenant.id,
                        historico_id=hist.id,
                        reminder_kind=REMINDER_KIND_AUTO_DUE,
                        tenant_tz=tz_name,
                        tenant_local_day=local_today,
                    ):
                        try:
                            dispatch_preventive_reminder(
                                db,
                                tenant_id=tenant.id,
                                created_by_user=None,
                                historico_servico_id=hist.id,
                                reminder_kind=REMINDER_KIND_AUTO_DUE,
                            )
                            sent_due += 1
                        except Exception:
                            logger.exception(
                                "preventive auto due reminder failed tenant_id=%s historico=%s",
                                tenant.id,
                                hist.id,
                            )
                            db.rollback()
                            continue

                if advance_days > 0:
                    advance_target = nxt - timedelta(days=advance_days)
                    if local_today == advance_target:
                        if not _already_sent_reminder_on_tenant_local_day(
                            db,
                            tenant_id=tenant.id,
                            historico_id=hist.id,
                            reminder_kind=REMINDER_KIND_AUTO_ADVANCE,
                            tenant_tz=tz_name,
                            tenant_local_day=local_today,
                        ):
                            try:
                                dispatch_preventive_reminder(
                                    db,
                                    tenant_id=tenant.id,
                                    created_by_user=None,
                                    historico_servico_id=hist.id,
                                    reminder_kind=REMINDER_KIND_AUTO_ADVANCE,
                                )
                                sent_advance += 1
                            except Exception:
                                logger.exception(
                                    "preventive auto advance reminder failed tenant_id=%s historico=%s",
                                    tenant.id,
                                    hist.id,
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
) -> dict[str, Any]:
    errors: list[dict[str, Any]] = []
    sent = 0
    for hid in historico_servico_ids:
        try:
            dispatch_preventive_reminder(
                db,
                tenant_id=tenant_id,
                created_by_user=created_by_user,
                historico_servico_id=hid,
                promo_image_url=promo_image_url,
            )
            sent += 1
        except HTTPException as exc:
            detail = exc.detail
            if not isinstance(detail, str):
                detail = str(detail)
            errors.append({"historico_servico_id": hid, "detail": detail})
        except Exception:
            logger.exception("preventive bulk send failed historico=%s", hid)
            errors.append({"historico_servico_id": hid, "detail": "Erro interno ao enviar."})
            db.rollback()
    attempted = len(historico_servico_ids)
    return {"attempted": attempted, "sent": sent, "failed": len(errors), "errors": errors[:100]}


def run_preventive_reminder_send_background(
    tenant_id: int,
    user_id: int,
    historico_servico_id: int,
    promo_image_url: str | None,
    promo_image_base64: str | None,
    promo_image_mimetype: str | None,
    technical_problem_hint: str | None,
) -> None:
    """Envio unitário fora do ciclo ASGI (thread); evita 502 no proxy e falhas silenciosas com BaseHTTPMiddleware."""
    from app.database import SessionLocal

    logger.info(
        "preventive single background iniciado tenant_id=%s historico=%s user_id=%s",
        tenant_id,
        historico_servico_id,
        user_id,
    )
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
            dispatch_preventive_reminder(
                db,
                tenant_id=tenant_id,
                created_by_user=user,
                historico_servico_id=historico_servico_id,
                promo_image_url=promo_image_url,
                promo_image_base64=promo_image_base64,
                promo_image_mimetype=promo_image_mimetype,
                technical_problem_hint=technical_problem_hint,
            )
        logger.info(
            "preventive single background concluído tenant_id=%s historico=%s",
            tenant_id,
            historico_servico_id,
        )
    except HTTPException as exc:
        logger.warning(
            "preventive single background falhou tenant_id=%s historico=%s detail=%s",
            tenant_id,
            historico_servico_id,
            exc.detail,
        )
    except Exception:
        logger.exception(
            "preventive single background falhou tenant_id=%s historico=%s",
            tenant_id,
            historico_servico_id,
        )


def run_preventive_reminders_bulk_background(
    tenant_id: int,
    user_id: int,
    historico_servico_ids: list[int],
    promo_image_url: str | None,
) -> None:
    """Executa lote em thread dedicada (evita BaseHTTPMiddleware impedir BackgroundTasks)."""
    from app.database import SessionLocal

    logger.info(
        "preventive bulk background iniciado tenant_id=%s ids=%s",
        tenant_id,
        len(historico_servico_ids),
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
    historico_servico_id: int,
    promo_image_url: str | None,
    promo_image_base64: str | None,
    promo_image_mimetype: str | None,
    technical_problem_hint: str | None,
) -> None:
    """Dispara envio unitário em thread (BackgroundTasks pode não rodar com BaseHTTPMiddleware)."""
    threading.Thread(
        target=run_preventive_reminder_send_background,
        args=(
            tenant_id,
            user_id,
            historico_servico_id,
            promo_image_url,
            promo_image_base64,
            promo_image_mimetype,
            technical_problem_hint,
        ),
        daemon=True,
        name=f"preventive-send-{historico_servico_id}",
    ).start()


def spawn_preventive_reminders_bulk_thread(
    tenant_id: int,
    user_id: int,
    historico_servico_ids: list[int],
    promo_image_url: str | None,
) -> None:
    """Dispara lote em thread (BackgroundTasks pode não rodar com BaseHTTPMiddleware)."""
    threading.Thread(
        target=run_preventive_reminders_bulk_background,
        args=(tenant_id, user_id, list(historico_servico_ids), promo_image_url),
        daemon=True,
        name="preventive-bulk",
    ).start()


def list_interest_leads(db: Session, *, tenant_id: int, limit: int = 100) -> list[PreventiveInterestLead]:
    return (
        db.execute(
            select(PreventiveInterestLead)
            .where(PreventiveInterestLead.tenant_id == tenant_id)
            .order_by(PreventiveInterestLead.id.desc())
            .limit(limit)
        )
        .scalars()
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

    btn_id = _extract_button_id_from_payload(payload)
    if btn_id:
        kind_btn: PreventiveInterestKind | None = None
        raw_hid: str | None = None
        if btn_id.startswith(PREVENTIVE_MORE_PREFIX):
            kind_btn = PreventiveInterestKind.MORE
            raw_hid = btn_id[len(PREVENTIVE_MORE_PREFIX) :]
        elif btn_id.startswith(PREVENTIVE_SCHEDULE_PREFIX):
            kind_btn = PreventiveInterestKind.SCHEDULE
            raw_hid = btn_id[len(PREVENTIVE_SCHEDULE_PREFIX) :]
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
