"""Fluxo WhatsApp preventiva: AGENDAR → equipamento(s) → horários → OS + agenda."""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session, joinedload

from app.preventive_maintenance import (
    _plain_text_from_evolution_upsert,
    _preventive_message_equipment_label,
    _whatsapp_digits_match,
    expand_preventive_group_items,
    load_tenant_settings_row,
)
from app.routers.service_orders import suggest_booking_slots
from app.whatsapp import (
    RESCHEDULE_AUTO_SLOT_COUNT,
    _dispatch_reminders_for_schedule_after_reschedule,
    _evolution_send_text,
    _format_local_datetime,
    _incoming_message_already_processed,
    _incoming_message_id,
    _infer_schedule_id_from_active_reschedule_options,
    _resolve_tenant_instance,
    finalize_pending_client_whatsapp_flows,
    _tenant_tz,
    append_event,
    normalize_whatsapp_number,
)
from models import (
    Client,
    HistoricoServico,
    OrderStatus,
    PreventiveInterestKind,
    PreventiveInterestLead,
    PreventiveReminderContext,
    PreventiveScheduleFlow,
    PreventiveScheduleSlotOption,
    Schedule,
    ScheduleStatus,
    ScheduleTechnician,
    Service,
    ServiceOrder,
    ServiceOrderServiceItem,
    WhatsappMessageEvent,
)

logger = logging.getLogger("erp.preventive_schedule_whatsapp")

PREVENTIVE_SCHEDULE_FLOW_TTL_MINUTES = 60
_CONTEXT_LOOKBACK_DAYS = 14

_PREVENTIVE_SCHEDULE_SYNONYMS: frozenset[str] = frozenset(
    {
        "AGENDAR",
        "AGENDA",
        "AGENDAMENTO",
        "AGENDE",
        "MARCAR",
        "MARCA",
        "QUERO AGENDAR",
        "QUERO MARCAR",
        "AGENDAR PREVENTIVA",
        "PREVENTIVA",
        "SIM AGENDAR",
    }
)


def _normalize_reply_text(text: str) -> str:
    raw = (text or "").strip().upper()
    for punct in "!?.…":
        raw = raw.replace(punct, "")
    return " ".join(raw.split())


def is_preventive_schedule_intent(text: str) -> bool:
    raw = _normalize_reply_text(text)
    if not raw:
        return False
    if raw in _PREVENTIVE_SCHEDULE_SYNONYMS:
        return True
    if raw.startswith("AGEND"):
        return True
    if raw.startswith("QUERO AGENDAR") or raw.startswith("QUERO MARCAR"):
        return True
    return False


def _serialize_items(items: list[dict[str, Any]]) -> str:
    def _json_default(val: Any) -> str:
        if isinstance(val, (date, datetime)):
            return val.isoformat()
        raise TypeError(type(val))

    return json.dumps(items, ensure_ascii=True, default=_json_default)


def _deserialize_items(raw: str) -> list[dict[str, Any]]:
    data = json.loads(raw or "[]")
    return data if isinstance(data, list) else []


def save_preventive_reminder_context(
    db: Session,
    *,
    tenant_id: int,
    client_id: int,
    whatsapp_digits: str,
    whatsapp_job_id: int | None,
    items: list[dict[str, Any]],
) -> None:
    digits = "".join(ch for ch in whatsapp_digits if ch.isdigit())
    row = PreventiveReminderContext(
        tenant_id=tenant_id,
        client_id=client_id,
        whatsapp_digits=digits or whatsapp_digits,
        whatsapp_job_id=whatsapp_job_id,
        group_items_json=_serialize_items(items),
    )
    db.add(row)
    db.flush()


def _latest_reminder_context(
    db: Session, *, tenant_id: int, jid_digits: str
) -> PreventiveReminderContext | None:
    since = datetime.now(timezone.utc) - timedelta(days=_CONTEXT_LOOKBACK_DAYS)
    rows = db.execute(
        select(PreventiveReminderContext)
        .where(
            PreventiveReminderContext.tenant_id == tenant_id,
            PreventiveReminderContext.created_at >= since,
        )
        .order_by(PreventiveReminderContext.created_at.desc())
        .limit(40)
    ).scalars().all()
    for ctx in rows:
        if _whatsapp_digits_match(jid_digits, ctx.whatsapp_digits):
            return ctx
    return None


def _persist_preventive_schedule_state(db: Session) -> None:
    """Grava fluxo preventivo imediatamente (evita corrida entre webhooks paralelos)."""
    db.flush()
    db.commit()


def _expire_flow_slot_options(
    db: Session,
    *,
    flow_id: int,
    now: datetime | None = None,
) -> None:
    ts = now or datetime.now(timezone.utc)
    db.execute(
        update(PreventiveScheduleSlotOption)
        .where(
            PreventiveScheduleSlotOption.flow_id == flow_id,
            PreventiveScheduleSlotOption.selected_at.is_(None),
        )
        .values(expires_at=ts)
    )


def _complete_active_flows_for_jid(
    db: Session,
    *,
    tenant_id: int,
    jid_digits: str,
) -> None:
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(PreventiveScheduleFlow)
        .where(
            PreventiveScheduleFlow.tenant_id == tenant_id,
            PreventiveScheduleFlow.completed_at.is_(None),
            PreventiveScheduleFlow.expires_at >= now,
            PreventiveScheduleFlow.step.in_(("equipment", "slot")),
        )
        .order_by(PreventiveScheduleFlow.id.desc())
        .limit(20)
    ).scalars().all()
    for row in rows:
        if _whatsapp_digits_match(jid_digits, row.whatsapp_digits):
            row.completed_at = now
            db.add(row)
            _expire_flow_slot_options(db, flow_id=int(row.id), now=now)
    db.flush()


def _get_active_flow(db: Session, *, tenant_id: int, jid_digits: str) -> PreventiveScheduleFlow | None:
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(PreventiveScheduleFlow)
        .where(
            PreventiveScheduleFlow.tenant_id == tenant_id,
            PreventiveScheduleFlow.completed_at.is_(None),
            PreventiveScheduleFlow.expires_at >= now,
            PreventiveScheduleFlow.step.in_(("equipment", "slot")),
        )
        .order_by(PreventiveScheduleFlow.id.desc())
        .limit(10)
    ).scalars().all()
    for flow in rows:
        if _whatsapp_digits_match(jid_digits, flow.whatsapp_digits):
            return flow
    return None


def has_active_preventive_schedule_flow(db: Session, *, tenant_id: int, jid_digits: str) -> bool:
    """True se o cliente está em fluxo preventivo AGENDAR (equipamento ou horário)."""
    return _get_active_flow(db, tenant_id=tenant_id, jid_digits=jid_digits) is not None


def has_open_preventive_schedule_prompt(db: Session, *, tenant_id: int, jid_digits: str) -> bool:
    """Fluxo preventivo ativo ou prompt recente (equipamento/horário) aguardando resposta numérica."""
    if has_active_preventive_schedule_flow(db, tenant_id=tenant_id, jid_digits=jid_digits):
        return True
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=45)
    rows = db.execute(
        select(WhatsappMessageEvent)
        .where(
            WhatsappMessageEvent.tenant_id == tenant_id,
            WhatsappMessageEvent.event_type.in_(
                ("preventive_schedule_equipment_prompt_sent", "preventive_schedule_slots_sent")
            ),
            WhatsappMessageEvent.created_at >= cutoff,
        )
        .order_by(WhatsappMessageEvent.id.desc())
        .limit(20)
    ).scalars().all()
    for row in rows:
        raw = (row.payload_json or "").strip()
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except Exception:
            continue
        client_id = payload.get("client_id")
        if not client_id:
            continue
        cli = db.get(Client, int(client_id))
        if cli is None or cli.tenant_id != tenant_id:
            continue
        if _whatsapp_digits_match(jid_digits, cli.whatsapp or "") or _whatsapp_digits_match(
            jid_digits, cli.phone or ""
        ):
            return True
    return False


def _resend_current_flow_prompt(
    db: Session,
    *,
    tenant_id: int,
    flow: PreventiveScheduleFlow,
    jid_digits: str,
) -> bool:
    """Reenvia a pergunta atual sem reiniciar o fluxo (evita prompts duplicados)."""
    if flow.step == "equipment":
        items = _deserialize_items(flow.equipment_items_json)
        if not items:
            return False
        body = _build_equipment_prompt(items)
    elif flow.step == "slot":
        now = datetime.now(timezone.utc)
        options = db.execute(
            select(PreventiveScheduleSlotOption)
            .where(
                PreventiveScheduleSlotOption.flow_id == flow.id,
                PreventiveScheduleSlotOption.expires_at >= now,
                PreventiveScheduleSlotOption.selected_at.is_(None),
            )
            .order_by(PreventiveScheduleSlotOption.option_index.asc())
        ).scalars().all()
        if not options:
            return _offer_slots_for_flow(db, tenant_id=tenant_id, flow=flow, jid_digits=jid_digits)
        selected = _deserialize_items(flow.selected_equipment_json or flow.equipment_items_json)
        labels = [_equipment_label(i) for i in selected]
        if len(labels) == 1:
            equipment_summary = labels[0]
        else:
            tail = "…" if len(labels) > 3 else ""
            equipment_summary = f"{len(labels)} equipamentos ({', '.join(labels[:3])}{tail})"
        tenant = load_tenant_settings_row(db, tenant_id)
        body = _build_slot_prompt(
            tenant_tz=_tenant_tz(tenant),
            options=list(options),
            equipment_summary=equipment_summary,
        )
    else:
        return False
    try:
        _send_whatsapp_text(db, tenant_id=tenant_id, dest=jid_digits, body=body)
    except HTTPException:
        return True
    _persist_preventive_schedule_state(db)
    return True


def _parse_pick_number(text: str) -> int | None:
    raw = _normalize_reply_text(text)
    if raw.isdigit():
        n = int(raw)
        return n if n > 0 else None
    match = re.match(r"^(\d+)\b", raw)
    if match:
        return int(match.group(1))
    return None


def _resolve_preventive_service(db: Session, *, tenant_id: int, item: dict[str, Any]) -> Service:
    svc_id = int(item.get("service_id") or 0)
    if svc_id > 0:
        svc = db.get(Service, svc_id)
        if svc is not None and svc.tenant_id == tenant_id and svc.is_active:
            return svc

    hid = int(item.get("historico_servico_id") or 0)
    if hid > 0:
        hist = db.execute(
            select(HistoricoServico).where(
                HistoricoServico.id == hid,
                HistoricoServico.tenant_id == tenant_id,
            )
        ).scalar_one_or_none()
        if hist is not None:
            svc = db.get(Service, hist.service_id)
            if svc is not None and svc.tenant_id == tenant_id and svc.is_active:
                return svc

    equipment_id = int(item.get("equipment_id") or 0)
    if equipment_id > 0:
        svc_eq = db.execute(
            select(Service)
            .join(ServiceOrderServiceItem, ServiceOrderServiceItem.service_id == Service.id)
            .where(
                ServiceOrderServiceItem.equipment_id == equipment_id,
                Service.tenant_id == tenant_id,
                Service.is_active.is_(True),
            )
            .order_by(ServiceOrderServiceItem.id.desc())
            .limit(1)
        ).scalars().first()
        if svc_eq is not None:
            return svc_eq

    svc = db.execute(
        select(Service)
        .where(
            Service.tenant_id == tenant_id,
            Service.is_active.is_(True),
            Service.periodicidade_meses.isnot(None),
        )
        .order_by(Service.id.asc())
        .limit(1)
    ).scalars().first()
    if svc is not None:
        return svc

    svc = db.execute(
        select(Service)
        .where(Service.tenant_id == tenant_id, Service.is_active.is_(True))
        .order_by(Service.id.asc())
        .limit(1)
    ).scalars().first()
    if svc is None:
        raise HTTPException(status_code=422, detail="Nenhum tipo de serviço ativo cadastrado para preventiva.")
    return svc


def _equipment_label(item: dict[str, Any]) -> str:
    return _preventive_message_equipment_label(item)


def _send_whatsapp_text(db: Session, *, tenant_id: int, dest: str, body: str) -> None:
    instance = _resolve_tenant_instance(db, tenant_id)
    _evolution_send_text(instance, normalize_whatsapp_number(dest), body)


def _build_equipment_prompt(items: list[dict[str, Any]]) -> str:
    lines = [
        "Qual equipamento deseja agendar a preventiva?",
        "",
    ]
    for idx, item in enumerate(items, start=1):
        due = item.get("data_proximo_vencimento")
        due_str = ""
        if isinstance(due, str) and due:
            try:
                due_str = datetime.fromisoformat(due[:10]).strftime("%d/%m/%Y")
            except ValueError:
                due_str = due[:10]
        elif isinstance(due, date):
            due_str = due.strftime("%d/%m/%Y")
        label = _equipment_label(item)
        suffix = f" (venc. {due_str})" if due_str else ""
        lines.append(f"{idx}- {label}{suffix}")
    todos_idx = len(items) + 1
    lines.extend(
        [
            f"{todos_idx}- Todos os equipamentos",
            "",
            f"Responda com o número (1 a {todos_idx}).",
        ]
    )
    return "\n".join(lines)


def _build_slot_prompt(
    *,
    tenant_tz,
    options: list[PreventiveScheduleSlotOption],
    equipment_summary: str,
) -> str:
    lines = [
        f"Horários disponíveis para: {equipment_summary}",
        "",
    ]
    for opt in sorted(options, key=lambda o: o.option_index):
        starts = _format_local_datetime(opt.starts_at, tenant_tz)
        lines.append(f"{opt.option_index}- {starts}")
    lines.extend(
        [
            "",
            f"Responda com 1 a {len(options)} para confirmar o agendamento.",
        ]
    )
    return "\n".join(lines)


def _create_flow(
    db: Session,
    *,
    tenant_id: int,
    client_id: int,
    whatsapp_digits: str,
    items: list[dict[str, Any]],
    step: str = "equipment",
) -> PreventiveScheduleFlow:
    now = datetime.now(timezone.utc)
    flow = PreventiveScheduleFlow(
        tenant_id=tenant_id,
        client_id=client_id,
        whatsapp_digits=whatsapp_digits,
        step=step,
        equipment_items_json=_serialize_items(items),
        expires_at=now + timedelta(minutes=PREVENTIVE_SCHEDULE_FLOW_TTL_MINUTES),
    )
    db.add(flow)
    db.flush()
    return flow


def _record_schedule_lead(
    db: Session,
    *,
    tenant_id: int,
    client_id: int,
    historico_servico_id: int | None,
    whatsapp_digits: str,
    message_text: str,
    payload: dict[str, Any],
    key: dict[str, Any],
) -> None:
    lead = PreventiveInterestLead(
        tenant_id=tenant_id,
        client_id=client_id,
        historico_servico_id=historico_servico_id,
        whatsapp_digits=whatsapp_digits,
        interest_kind=PreventiveInterestKind.SCHEDULE,
        message_text=message_text[:500],
        raw_payload_json=json.dumps(payload, ensure_ascii=True)[:12000],
        provider_message_id=str(key.get("id") or "") if key else None,
    )
    db.add(lead)


def _start_schedule_flow(
    db: Session,
    *,
    tenant_id: int,
    jid_digits: str,
    plain: str,
    payload: dict[str, Any],
    key: dict[str, Any],
) -> bool:
    ctx = _latest_reminder_context(db, tenant_id=tenant_id, jid_digits=jid_digits)
    if ctx is None:
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="preventive_schedule_no_context",
            payload={"text": plain[:80]},
            job_id=None,
        )
        try:
            _send_whatsapp_text(
                db,
                tenant_id=tenant_id,
                dest=jid_digits,
                body=(
                    "Recebemos seu pedido de agendamento, mas não encontramos a campanha preventiva recente. "
                    "Peça à nossa equipe para reenviar o lembrete ou entre em contato pelo telefone."
                ),
            )
        except HTTPException:
            pass
        return True

    items = expand_preventive_group_items(db, tenant_id=tenant_id, items=_deserialize_items(ctx.group_items_json))
    if not items:
        return True

    finalize_pending_client_whatsapp_flows(
        db,
        tenant_id=tenant_id,
        jid_digits=jid_digits,
        source="preventive_schedule_start",
    )
    _persist_preventive_schedule_state(db)

    anchor_hid = next(
        (int(i.get("historico_servico_id") or 0) for i in items if int(i.get("historico_servico_id") or 0) > 0),
        None,
    )
    _record_schedule_lead(
        db,
        tenant_id=tenant_id,
        client_id=ctx.client_id,
        historico_servico_id=anchor_hid,
        whatsapp_digits=jid_digits,
        message_text=plain,
        payload=payload,
        key=key if isinstance(key, dict) else {},
    )

    if len(items) == 1:
        flow = _create_flow(
            db,
            tenant_id=tenant_id,
            client_id=ctx.client_id,
            whatsapp_digits=jid_digits,
            items=items,
            step="slot",
        )
        flow.selected_equipment_json = _serialize_items(items)
        db.add(flow)
        db.flush()
        _persist_preventive_schedule_state(db)
        return _offer_slots_for_flow(db, tenant_id=tenant_id, flow=flow, jid_digits=jid_digits)

    flow = _create_flow(
        db,
        tenant_id=tenant_id,
        client_id=ctx.client_id,
        whatsapp_digits=jid_digits,
        items=items,
        step="equipment",
    )
    _persist_preventive_schedule_state(db)
    try:
        _send_whatsapp_text(
            db,
            tenant_id=tenant_id,
            dest=jid_digits,
            body=_build_equipment_prompt(items),
        )
    except HTTPException:
        return True
    append_event(
        db,
        tenant_id=tenant_id,
        event_type="preventive_schedule_equipment_prompt_sent",
        payload={"flow_id": flow.id, "client_id": flow.client_id, "count": len(items)},
        job_id=None,
    )
    _persist_preventive_schedule_state(db)
    return True


def _compute_duration_minutes(db: Session, *, tenant_id: int, items: list[dict[str, Any]]) -> int:
    total = 0
    for item in items:
        svc = _resolve_preventive_service(db, tenant_id=tenant_id, item=item)
        total += max(1, int(svc.duration_minutes or 30))
    return max(1, total)


def _offer_slots_for_flow(
    db: Session,
    *,
    tenant_id: int,
    flow: PreventiveScheduleFlow,
    jid_digits: str,
) -> bool:
    selected = _deserialize_items(flow.selected_equipment_json or flow.equipment_items_json)
    if not selected:
        return True

    try:
        tenant = load_tenant_settings_row(db, tenant_id)
        duration = _compute_duration_minutes(db, tenant_id=tenant_id, items=selected)
    except Exception as exc:
        logger.exception("preventive_schedule duration failed flow_id=%s", flow.id)
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="preventive_schedule_duration_failed",
            payload={"flow_id": flow.id, "error": str(exc)[:300]},
            job_id=None,
        )
        try:
            _send_whatsapp_text(
                db,
                tenant_id=tenant_id,
                dest=jid_digits,
                body=(
                    "Não conseguimos calcular a duração desta preventiva agora. "
                    "Responda AGENDAR de novo ou fale com nossa equipe."
                ),
            )
        except HTTPException:
            pass
        _persist_preventive_schedule_state(db)
        return True

    flow.duration_minutes = duration
    flow.step = "slot"
    db.add(flow)

    now = datetime.now(timezone.utc)
    slots = suggest_booking_slots(
        db,
        tenant=tenant,
        tenant_id=tenant_id,
        duration_minutes=duration,
        from_at=now,
        technician_id=None,
        limit=RESCHEDULE_AUTO_SLOT_COUNT,
    )

    db.execute(delete(PreventiveScheduleSlotOption).where(PreventiveScheduleSlotOption.flow_id == flow.id))

    if not slots:
        flow.completed_at = now
        db.add(flow)
        try:
            _send_whatsapp_text(
                db,
                tenant_id=tenant_id,
                dest=jid_digits,
                body=(
                    "No momento não encontramos horários livres na agenda para esta preventiva. "
                    "Nossa equipe entrará em contato em breve."
                ),
            )
        except HTTPException:
            pass
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="preventive_schedule_no_slots",
            payload={"flow_id": flow.id, "duration_minutes": duration},
            job_id=None,
        )
        return True

    batch_token = int(now.timestamp())
    created: list[PreventiveScheduleSlotOption] = []
    for idx, slot in enumerate(sorted(slots, key=lambda s: s.starts_at)[:RESCHEDULE_AUTO_SLOT_COUNT], start=1):
        opt = PreventiveScheduleSlotOption(
            tenant_id=tenant_id,
            flow_id=flow.id,
            option_code=f"PS{flow.id}-{batch_token}-{idx}",
            option_index=idx,
            starts_at=slot.starts_at,
            ends_at=slot.ends_at,
            technician_id=slot.technician_id,
            expires_at=now + timedelta(minutes=PREVENTIVE_SCHEDULE_FLOW_TTL_MINUTES),
        )
        db.add(opt)
        created.append(opt)
    db.flush()

    labels = [_equipment_label(i) for i in selected]
    if len(labels) == 1:
        equipment_summary = labels[0]
    else:
        tail = "…" if len(labels) > 3 else ""
        equipment_summary = f"{len(labels)} equipamentos ({', '.join(labels[:3])}{tail})"
    tenant_tz = _tenant_tz(tenant)
    try:
        _send_whatsapp_text(
            db,
            tenant_id=tenant_id,
            dest=jid_digits,
            body=_build_slot_prompt(tenant_tz=tenant_tz, options=created, equipment_summary=equipment_summary),
        )
    except HTTPException:
        return True

    append_event(
        db,
        tenant_id=tenant_id,
        event_type="preventive_schedule_slots_sent",
        payload={
            "flow_id": flow.id,
            "options": [o.option_code for o in created],
            "duration_minutes": duration,
        },
        job_id=None,
    )
    _persist_preventive_schedule_state(db)
    return True


def _handle_equipment_pick(
    db: Session,
    *,
    tenant_id: int,
    flow: PreventiveScheduleFlow,
    pick: int,
    jid_digits: str,
) -> bool:
    items = _deserialize_items(flow.equipment_items_json)
    todos_idx = len(items) + 1
    if pick < 1 or pick > todos_idx:
        try:
            _send_whatsapp_text(
                db,
                tenant_id=tenant_id,
                dest=jid_digits,
                body=f"Opção inválida. Responda com um número de 1 a {todos_idx}.",
            )
        except HTTPException:
            pass
        return True

    selected = items if pick == todos_idx else [items[pick - 1]]
    flow.selected_equipment_json = _serialize_items(selected)
    db.add(flow)
    db.flush()
    _persist_preventive_schedule_state(db)
    return _offer_slots_for_flow(db, tenant_id=tenant_id, flow=flow, jid_digits=jid_digits)


def _create_os_and_schedule(
    db: Session,
    *,
    tenant_id: int,
    flow: PreventiveScheduleFlow,
    slot: PreventiveScheduleSlotOption,
) -> tuple[ServiceOrder, Schedule]:
    selected = _deserialize_items(flow.selected_equipment_json or "[]")
    if not selected:
        raise HTTPException(status_code=422, detail="Fluxo sem equipamentos selecionados.")

    labels = [_equipment_label(i) for i in selected]
    title = (
        f"Preventiva WhatsApp — {labels[0]}"
        if len(labels) == 1
        else f"Preventiva WhatsApp — {len(labels)} equipamentos"
    )
    description = "Agendamento automático via resposta AGENDAR (gestão preventiva).\nEquipamentos: " + ", ".join(labels)

    order = ServiceOrder(
        tenant_id=tenant_id,
        client_id=flow.client_id,
        title=title[:200],
        description=description[:4000],
        discount_amount=0.0,
        status=OrderStatus.OPEN,
    )
    db.add(order)
    db.flush()

    for item in selected:
        svc = _resolve_preventive_service(db, tenant_id=tenant_id, item=item)
        equipment_id = int(item["equipment_id"]) if item.get("equipment_id") else None
        db.add(
            ServiceOrderServiceItem(
                service_order_id=order.id,
                service_id=svc.id,
                equipment_id=equipment_id,
                quantity=1,
                unit_price=float(svc.price or 0),
                duration_minutes=max(1, int(svc.duration_minutes or 30)),
            )
        )

    schedule = Schedule(
        tenant_id=tenant_id,
        client_id=flow.client_id,
        service_order_id=order.id,
        starts_at=slot.starts_at,
        ends_at=slot.ends_at,
        status=ScheduleStatus.PENDING,
        notes="Preventiva agendada via WhatsApp",
    )
    db.add(schedule)
    db.flush()

    if slot.technician_id is not None:
        db.add(ScheduleTechnician(schedule_id=schedule.id, technician_id=int(slot.technician_id)))

    order.status = OrderStatus.SCHEDULED
    slot.selected_at = datetime.now(timezone.utc)
    flow.completed_at = datetime.now(timezone.utc)
    flow.step = "done"
    flow.service_order_id = order.id
    flow.schedule_id = schedule.id
    db.add(slot)
    db.add(flow)
    db.flush()
    return order, schedule


def _client_has_schedule_on_local_day(
    db: Session,
    *,
    tenant_id: int,
    client_id: int,
    starts_at: datetime,
    tenant_tz,
) -> bool:
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    local_day = starts_at.astimezone(tenant_tz).date()
    day_start = datetime.combine(local_day, datetime.min.time(), tzinfo=tenant_tz).astimezone(timezone.utc)
    day_end = day_start + timedelta(days=1)
    existing = db.execute(
        select(Schedule.id)
        .where(
            Schedule.tenant_id == tenant_id,
            Schedule.client_id == client_id,
            Schedule.status != ScheduleStatus.CANCELLED,
            Schedule.starts_at >= day_start,
            Schedule.starts_at < day_end,
        )
        .limit(1)
    ).scalar_one_or_none()
    return existing is not None


def _slot_still_bookable(
    db: Session,
    *,
    tenant_id: int,
    flow: PreventiveScheduleFlow,
    slot: PreventiveScheduleSlotOption,
) -> bool:
    now = datetime.now(timezone.utc)
    if slot.selected_at is not None or slot.expires_at < now:
        return False
    tenant = load_tenant_settings_row(db, tenant_id)
    tenant_tz = _tenant_tz(tenant)
    if _client_has_schedule_on_local_day(
        db,
        tenant_id=tenant_id,
        client_id=int(flow.client_id),
        starts_at=slot.starts_at,
        tenant_tz=tenant_tz,
    ):
        return False
    if slot.technician_id is not None:
        from app.routers.service_orders import _check_technician_conflict

        try:
            _check_technician_conflict(
                db,
                tenant_id,
                int(slot.technician_id),
                slot.starts_at,
                slot.ends_at,
            )
        except HTTPException:
            return False
    return True


def _handle_slot_pick(
    db: Session,
    *,
    tenant_id: int,
    flow: PreventiveScheduleFlow,
    pick: int,
    jid_digits: str,
) -> bool:
    now = datetime.now(timezone.utc)
    if flow.completed_at is not None:
        try:
            _send_whatsapp_text(
                db,
                tenant_id=tenant_id,
                dest=jid_digits,
                body="Este agendamento já foi encerrado. Responda AGENDAR na mensagem da preventiva para recomeçar.",
            )
        except HTTPException:
            pass
        return True

    options = db.execute(
        select(PreventiveScheduleSlotOption)
        .where(
            PreventiveScheduleSlotOption.flow_id == flow.id,
            PreventiveScheduleSlotOption.expires_at >= now,
            PreventiveScheduleSlotOption.selected_at.is_(None),
        )
        .order_by(PreventiveScheduleSlotOption.option_index.asc())
    ).scalars().all()

    if not options:
        try:
            _send_whatsapp_text(
                db,
                tenant_id=tenant_id,
                dest=jid_digits,
                body="Esta conversa expirou. Responda AGENDAR novamente na mensagem da preventiva.",
            )
        except HTTPException:
            pass
        return True

    match = next((o for o in options if o.option_index == pick), None)
    if match is None:
        try:
            _send_whatsapp_text(
                db,
                tenant_id=tenant_id,
                dest=jid_digits,
                body=f"Opção inválida. Responda com um número de 1 a {len(options)}.",
            )
        except HTTPException:
            pass
        return True

    if not _slot_still_bookable(db, tenant_id=tenant_id, flow=flow, slot=match):
        _expire_flow_slot_options(db, flow_id=int(flow.id), now=now)
        flow.step = "slot"
        flow.completed_at = None
        db.add(flow)
        db.flush()
        try:
            _send_whatsapp_text(
                db,
                tenant_id=tenant_id,
                dest=jid_digits,
                body=(
                    "Esse horário não está mais disponível (conflito na agenda ou visita já marcada no dia). "
                    "Vou enviar novas opções."
                ),
            )
        except HTTPException:
            pass
        return _offer_slots_for_flow(db, tenant_id=tenant_id, flow=flow, jid_digits=jid_digits)

    try:
        order, schedule = _create_os_and_schedule(db, tenant_id=tenant_id, flow=flow, slot=match)
    except Exception:
        logger.exception("preventive schedule OS creation failed flow_id=%s", flow.id)
        db.rollback()
        try:
            _send_whatsapp_text(
                db,
                tenant_id=tenant_id,
                dest=jid_digits,
                body="Não foi possível concluir o agendamento agora. Nossa equipe entrará em contato.",
            )
        except HTTPException:
            pass
        return True

    schedule_with_client = db.execute(
        select(Schedule)
        .where(Schedule.id == schedule.id, Schedule.tenant_id == tenant_id)
        .options(joinedload(Schedule.client))
    ).scalar_one()
    try:
        _dispatch_reminders_for_schedule_after_reschedule(
            db,
            tenant_id=tenant_id,
            schedule=schedule_with_client,
        )
    except Exception:
        logger.exception("preventive schedule reminder dispatch failed schedule_id=%s", schedule.id)

    tenant = load_tenant_settings_row(db, tenant_id)
    tenant_tz = _tenant_tz(tenant)
    when = _format_local_datetime(schedule.starts_at, tenant_tz)
    try:
        _send_whatsapp_text(
            db,
            tenant_id=tenant_id,
            dest=jid_digits,
            body=(
                f"Perfeito! Sua preventiva foi agendada para *{when}*.\n"
                f"Ordem de serviço #{order.id}.\n\n"
                "Qualquer dúvida, estamos à disposição."
            ),
        )
    except HTTPException:
        pass

    append_event(
        db,
        tenant_id=tenant_id,
        event_type="preventive_schedule_os_created",
        payload={
            "flow_id": flow.id,
            "service_order_id": order.id,
            "schedule_id": schedule.id,
            "starts_at": schedule.starts_at.isoformat(),
        },
        job_id=None,
    )
    _persist_preventive_schedule_state(db)
    return True


def _mark_incoming_message_processed(db: Session, *, tenant_id: int, message_id: str | None) -> None:
    if not message_id:
        return
    append_event(
        db,
        tenant_id=tenant_id,
        event_type="incoming_message_processed",
        payload={"message_id": message_id},
        job_id=None,
    )


def try_handle_preventive_schedule_reply(
    db: Session,
    *,
    tenant_id: int,
    payload: dict[str, Any],
) -> bool:
    """Trata fluxo AGENDAR (equipamento → horário → OS). Retorna True se consumiu a mensagem."""
    event_name = str(payload.get("event") or payload.get("type") or "").lower()
    if event_name != "messages.upsert":
        return False

    data = payload.get("data")
    if not isinstance(data, dict):
        return False
    key = data.get("key") if isinstance(data.get("key"), dict) else {}
    if isinstance(key, dict) and bool(key.get("fromMe")):
        return False

    message_id = _incoming_message_id(payload)
    if message_id and _incoming_message_already_processed(db, tenant_id=tenant_id, message_id=message_id):
        return True

    plain = _plain_text_from_evolution_upsert(payload)
    remote_jid = str(key.get("remoteJid") or "") if isinstance(key, dict) else ""
    jid_digits = "".join(ch for ch in remote_jid if ch.isdigit())
    if len(jid_digits) < 8:
        return False

    flow = _get_active_flow(db, tenant_id=tenant_id, jid_digits=jid_digits)
    if flow is None and _parse_pick_number(plain) is not None and _infer_schedule_id_from_active_reschedule_options(
        db, tenant_id=tenant_id, sender_number=jid_digits
    ):
        return False

    if flow is not None:
        if is_preventive_schedule_intent(plain):
            if flow.step in ("equipment", "slot"):
                handled = _resend_current_flow_prompt(
                    db, tenant_id=tenant_id, flow=flow, jid_digits=jid_digits
                )
            else:
                _complete_active_flows_for_jid(db, tenant_id=tenant_id, jid_digits=jid_digits)
                _persist_preventive_schedule_state(db)
                handled = _start_schedule_flow(
                    db,
                    tenant_id=tenant_id,
                    jid_digits=jid_digits,
                    plain=plain,
                    payload=payload,
                    key=key if isinstance(key, dict) else {},
                )
            _mark_incoming_message_processed(db, tenant_id=tenant_id, message_id=message_id)
            _persist_preventive_schedule_state(db)
            return handled
        pick = _parse_pick_number(plain)
        if pick is None:
            plain_stripped = (plain or "").strip()
            if not plain_stripped:
                _mark_incoming_message_processed(db, tenant_id=tenant_id, message_id=message_id)
                _persist_preventive_schedule_state(db)
                return True
            try:
                _send_whatsapp_text(
                    db,
                    tenant_id=tenant_id,
                    dest=jid_digits,
                    body="Não entendi. Responda apenas com o número da opção desejada.",
                )
            except HTTPException:
                pass
            _mark_incoming_message_processed(db, tenant_id=tenant_id, message_id=message_id)
            _persist_preventive_schedule_state(db)
            return True
        if flow.step == "equipment":
            handled = _handle_equipment_pick(db, tenant_id=tenant_id, flow=flow, pick=pick, jid_digits=jid_digits)
            _mark_incoming_message_processed(db, tenant_id=tenant_id, message_id=message_id)
            _persist_preventive_schedule_state(db)
            return handled
        if flow.step == "slot":
            handled = _handle_slot_pick(db, tenant_id=tenant_id, flow=flow, pick=pick, jid_digits=jid_digits)
            _mark_incoming_message_processed(db, tenant_id=tenant_id, message_id=message_id)
            _persist_preventive_schedule_state(db)
            return handled
        _mark_incoming_message_processed(db, tenant_id=tenant_id, message_id=message_id)
        _persist_preventive_schedule_state(db)
        return True

    if is_preventive_schedule_intent(plain):
        handled = _start_schedule_flow(
            db,
            tenant_id=tenant_id,
            jid_digits=jid_digits,
            plain=plain,
            payload=payload,
            key=key if isinstance(key, dict) else {},
        )
        _mark_incoming_message_processed(db, tenant_id=tenant_id, message_id=message_id)
        _persist_preventive_schedule_state(db)
        return handled

    return False
