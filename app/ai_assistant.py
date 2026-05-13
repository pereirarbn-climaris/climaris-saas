from __future__ import annotations

import json
import logging
import re
import ssl
import unicodedata
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date as date_type
from datetime import datetime, time, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import Select, delete, desc, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from app.config import CLAUDE_API_KEY, CLAUDE_MODEL, HAUKU_ECONOMY_MODEL
from models import (
    AIChatHistory,
    AIPendingToolConfirmation,
    Client,
    Product,
    OrderStatus,
    Schedule,
    ScheduleStatus,
    ScheduleTechnician,
    ServiceOrder,
    ServiceOrderServiceItem,
    Service,
    Tenant,
    TenantAISettings,
    TenantHoliday,
    User,
    UserRole,
    WhatsappMessageEvent,
)

logger = logging.getLogger("erp.ai.assistant")

SENSITIVE_TOOLS: frozenset[str] = frozenset({"cancel_appointment", "finalize_service", "reschedule_appointment"})
AGENDA_READ_TOOLS: frozenset[str] = frozenset(
    {
        "list_my_appointments",
        "get_available_slots",
        "find_reschedule_slots",
        "get_next_available_slots",
    }
)
AGENDA_WRITE_TOOLS: frozenset[str] = frozenset({"create_appointment"})
BILLING_TOOLS: frozenset[str] = frozenset({"generate_payment_link", "finalize_service"})
PROFILE_TOOLS: frozenset[str] = frozenset({"get_my_client_profile"})
PENDING_CONFIRMATION_TTL = timedelta(minutes=30)
# Apenas Haiku (e variantes): evita fallback silencioso para Sonnet (custo).
MODEL_FALLBACK_CHAIN: tuple[str, ...] = (
    HAUKU_ECONOMY_MODEL,
    "claude-3-haiku-20240307",
    "claude-haiku-4-5-20251001",
)
LEGACY_MODEL_ALIASES: dict[str, str] = {
    # Slugs legados (Sonnet / painel antigo) → Haiku 4.5 econômico.
    "claude-3-5-sonnet-latest": HAUKU_ECONOMY_MODEL,
    "claude-sonnet-4-6": HAUKU_ECONOMY_MODEL,
    "claude-sonnet-4-20250514": HAUKU_ECONOMY_MODEL,
}


def normalize_tenant_model_slug(raw: str | None) -> str:
    """Slug efetivo por tenant: vazio → CLAUDE_MODEL; Sonnet legado → Haiku (alinhado à migração 0063)."""
    s = (raw or "").strip()
    if not s:
        return CLAUDE_MODEL
    return LEGACY_MODEL_ALIASES.get(s, s)


@dataclass(frozen=True)
class ToolPolicy:
    """Permissões de ferramentas por tenant (espelha TenantAISettings)."""

    agenda_read: bool
    reschedule: bool
    cancel: bool
    billing: bool
    direct_schedule: bool
    auto_client_create: bool


@dataclass
class CompanyContext:
    tenant_id: int
    company_name: str
    services: list[dict[str, Any]]
    prices: list[dict[str, Any]]
    products: list[dict[str, Any]]
    cancellation_rules: str
    agent_name: str
    tone_of_voice: str
    custom_instructions: str
    model_slug: str
    context_products_enabled: bool
    context_service_prices_enabled: bool
    context_services_catalog_enabled: bool
    tool_billing_enabled: bool
    tool_cancel_enabled: bool
    tool_reschedule_enabled: bool
    tool_agenda_read_enabled: bool
    allow_direct_schedule: bool
    allow_auto_client_create: bool
    clarification_instructions: str

    @classmethod
    def from_db(cls, db: Session, tenant_id: int) -> "CompanyContext":
        tenant = db.get(Tenant, tenant_id)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")

        settings = db.execute(
            select(TenantAISettings).where(TenantAISettings.tenant_id == tenant_id)
        ).scalar_one_or_none()
        show_catalog = True if settings is None else bool(getattr(settings, "ai_context_services_catalog", True))
        show_prices = True if settings is None else bool(getattr(settings, "ai_context_service_prices", True))
        show_products = True if settings is None else bool(getattr(settings, "ai_context_products", True))
        tool_billing = False if settings is None else bool(getattr(settings, "ai_tool_billing", False))
        tool_cancel = True if settings is None else bool(getattr(settings, "ai_tool_cancel", True))
        tool_reschedule = True if settings is None else bool(getattr(settings, "ai_tool_reschedule", True))
        tool_agenda_read = True if settings is None else bool(getattr(settings, "ai_tool_agenda_read", True))
        allow_direct_schedule = False if settings is None else bool(getattr(settings, "ai_allow_direct_schedule", False))
        allow_auto_client_create = False if settings is None else bool(getattr(settings, "ai_allow_auto_client_create", False))
        clarification = (
            (getattr(settings, "ai_clarification_instructions", None) or "").strip()
            if settings
            else ""
        )

        active_services = db.execute(
            select(Service)
            .where(Service.tenant_id == tenant_id, Service.is_active.is_(True))
            .order_by(Service.name.asc())
        ).scalars().all()

        services_payload = (
            [
                {
                    "name": service.name,
                    "description": service.description or "",
                    "estimated_duration_minutes": int(service.duration_minutes),
                    "equipment_type_tags": (service.equipment_type_tags or ""),
                    "btu_min": int(service.btu_min) if service.btu_min is not None else None,
                    "btu_max": int(service.btu_max) if service.btu_max is not None else None,
                    "service_category": (service.service_category or ""),
                    "applies_residential": bool(getattr(service, "applies_residential", True)),
                    "applies_commercial": bool(getattr(service, "applies_commercial", True)),
                }
                for service in active_services
            ]
            if show_catalog
            else []
        )
        prices_payload = (
            [
                {
                    "service_name": service.name,
                    "base_price_brl": float(service.price),
                }
                for service in active_services
            ]
            if show_prices
            else []
        )
        active_products = db.execute(
            select(Product)
            .where(Product.tenant_id == tenant_id, Product.is_active.is_(True))
            .order_by(Product.name.asc())
            .limit(80)
        ).scalars().all()
        products_payload = (
            [
                {
                    "name": p.name,
                    "sku": p.sku,
                    "sale_price_brl": float(p.sale_price),
                    "unit_price_brl": float(p.unit_price),
                    "stock": float(p.stock_quantity),
                    "compatible_equipment_tags": (p.compatible_equipment_tags or ""),
                    "btu_min": int(p.btu_min) if p.btu_min is not None else None,
                    "btu_max": int(p.btu_max) if p.btu_max is not None else None,
                    "application_scope": (p.application_scope or ""),
                }
                for p in active_products
            ]
            if show_products
            else []
        )
        cancel_rules = (
            "Cancelamentos e mudança de horário sensíveis exigem confirmação explícita do cliente (SIM) antes de aplicar."
            if settings is None or not (settings.instructions or "").strip()
            else (settings.instructions or "").strip()
        )
        return cls(
            tenant_id=tenant_id,
            company_name=tenant.name,
            services=services_payload,
            prices=prices_payload,
            products=products_payload,
            cancellation_rules=cancel_rules,
            agent_name=(settings.agent_name if settings else "Assistente") or "Assistente",
            tone_of_voice=(settings.tone_of_voice if settings else "amigavel") or "amigavel",
            custom_instructions=(settings.instructions if settings else "") or "",
            model_slug=normalize_tenant_model_slug(
                (settings.model_slug if settings else CLAUDE_MODEL) or CLAUDE_MODEL
            ),
            context_products_enabled=show_products,
            context_service_prices_enabled=show_prices,
            context_services_catalog_enabled=show_catalog,
            tool_billing_enabled=tool_billing,
            tool_cancel_enabled=tool_cancel,
            tool_reschedule_enabled=tool_reschedule,
            tool_agenda_read_enabled=tool_agenda_read,
            allow_direct_schedule=allow_direct_schedule,
            allow_auto_client_create=allow_auto_client_create,
            clarification_instructions=clarification,
        )


def _is_ai_enabled(db: Session, tenant_id: int) -> bool:
    row = db.execute(
        select(TenantAISettings).where(TenantAISettings.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if row is None:
        return True
    return bool(row.is_enabled)


def _load_tool_policy(db: Session, tenant_id: int) -> ToolPolicy:
    row = db.execute(
        select(TenantAISettings).where(TenantAISettings.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if row is None:
        return ToolPolicy(
            agenda_read=True,
            reschedule=True,
            cancel=True,
            billing=False,
            direct_schedule=False,
            auto_client_create=False,
        )
    return ToolPolicy(
        agenda_read=bool(getattr(row, "ai_tool_agenda_read", True)),
        reschedule=bool(getattr(row, "ai_tool_reschedule", True)),
        cancel=bool(getattr(row, "ai_tool_cancel", True)),
        billing=bool(getattr(row, "ai_tool_billing", False)),
        direct_schedule=bool(getattr(row, "ai_allow_direct_schedule", False)),
        auto_client_create=bool(getattr(row, "ai_allow_auto_client_create", False)),
    )


def _tool_name_allowed(policy: ToolPolicy, name: str) -> bool:
    if name in PROFILE_TOOLS:
        return True
    if name in AGENDA_READ_TOOLS:
        return policy.agenda_read
    if name in AGENDA_WRITE_TOOLS:
        return policy.direct_schedule
    if name == "reschedule_appointment":
        return policy.reschedule
    if name == "cancel_appointment":
        return policy.cancel
    if name in BILLING_TOOLS:
        return policy.billing
    return False


POLICY_DENIED_MESSAGE = (
    "Esta ação está desabilitada nas configurações do assistente da empresa. "
    "Peça para um atendente humano."
)


def _policy_denied_result() -> dict[str, Any]:
    return {"ok": False, "message": POLICY_DENIED_MESSAGE}


def _defer_sensitive_confirmation(policy: ToolPolicy, tool_name: str) -> bool:
    """Enfileira fluxo SIM apenas para tools sensíveis que a política permite."""
    return tool_name in SENSITIVE_TOOLS and _tool_name_allowed(policy, tool_name)


def _filter_tool_definitions(policy: ToolPolicy) -> list[dict[str, Any]]:
    return [t for t in _all_tool_definitions() if _tool_name_allowed(policy, t["name"])]


def _candidate_models(preferred: str | None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in [preferred, CLAUDE_MODEL, *MODEL_FALLBACK_CHAIN]:
        m = normalize_tenant_model_slug(raw)
        if not m or m in seen:
            continue
        seen.add(m)
        out.append(m)
    return out


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _extract_option_choice(message_text: str) -> int | None:
    raw = (message_text or "").strip().lower()
    if not raw:
        return None
    m = re.search(r"\bop[cç][aã]o\s*([1-4])\b", raw)
    if m:
        return int(m.group(1))
    # Aceita respostas curtas ("1", "2.") após lista de horários.
    m = re.search(r"^\s*([1-4])(?:[)\].-]|\b)", raw)
    if m:
        return int(m.group(1))
    return None


def _last_booking_option_from_history(
    db: Session,
    *,
    tenant_id: int,
    client_whatsapp: str,
    option_number: int,
) -> dict[str, Any] | None:
    rows = db.execute(
        select(AIChatHistory)
        .where(
            AIChatHistory.tenant_id == tenant_id,
            AIChatHistory.client_whatsapp == client_whatsapp,
            AIChatHistory.used_tools_json.is_not(None),
        )
        .order_by(AIChatHistory.created_at.desc(), AIChatHistory.id.desc())
        .limit(20)
    ).scalars().all()
    now = datetime.now(timezone.utc)
    for row in rows:
        if row.created_at and (now - row.created_at) > timedelta(hours=24):
            continue
        raw = (row.used_tools_json or "").strip()
        if not raw:
            continue
        try:
            tool_rows = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(tool_rows, list):
            continue
        for item in tool_rows:
            if not isinstance(item, dict):
                continue
            if str(item.get("name") or "").strip() != "get_next_available_slots":
                continue
            output = item.get("output")
            if not isinstance(output, dict):
                continue
            options = output.get("booking_options")
            if not isinstance(options, list):
                continue
            for opt in options:
                if not isinstance(opt, dict):
                    continue
                if int(opt.get("option") or 0) == option_number:
                    return opt
    return None


def _resolve_client_id_for_wa(db: Session, tenant_id: int, digits: str) -> int | None:
    d = "".join(ch for ch in (digits or "") if ch.isdigit())
    if len(d) < 10:
        return None
    suffix11 = d[-11:] if len(d) >= 11 else d
    suffix10 = d[-10:]
    row = db.execute(
        select(Client.id).where(
            Client.tenant_id == tenant_id,
            or_(
                Client.whatsapp.like(f"%{suffix11}%"),
                Client.phone.like(f"%{suffix11}%"),
                Client.whatsapp.like(f"%{suffix10}%"),
                Client.phone.like(f"%{suffix10}%"),
            ),
        ).limit(1)
    ).scalar_one_or_none()
    return int(row) if row is not None else None


def _parse_iso_datetime(value: str) -> datetime | None:
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def _weekday_pt_br(day: date_type) -> str:
    names = (
        "segunda-feira",
        "terça-feira",
        "quarta-feira",
        "quinta-feira",
        "sexta-feira",
        "sábado",
        "domingo",
    )
    return names[day.weekday()]


def _parse_local_datetime_for_tenant(db: Session, tenant_id: int, value: str) -> datetime | None:
    """Interpreta data/hora no fuso do tenant.

    Strings *sem* offset (ex.: ``2026-05-08 08:30`` ou ``2026-05-08T08:30``) são horário local da empresa,
    não UTC — evita gravar 08:30 UTC quando o cliente quis 08:30 em America/Sao_Paulo.
    Use Z ou +00:00 / -03:00 apenas quando o instante vier explicitamente com fuso.
    """
    from app.whatsapp import _tenant_tz

    raw = (value or "").strip()
    if not raw:
        return None
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return _parse_iso_datetime(raw)
    tz = _tenant_tz(tenant)

    iso_raw = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
    try:
        dt = datetime.fromisoformat(iso_raw)
    except ValueError:
        dt = None

    if dt is not None:
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc)
        return dt.replace(tzinfo=tz).astimezone(timezone.utc)

    for fmt in ("%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M"):
        try:
            local = datetime.strptime(raw, fmt).replace(tzinfo=tz)
            return local.astimezone(timezone.utc)
        except ValueError:
            continue
    return None


def _schedule_id_from_wa_event_payload(payload_json: str | None) -> int | None:
    if not (payload_json or "").strip():
        return None
    try:
        data = json.loads(payload_json)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    raw = data.get("schedule_id")
    try:
        sid = int(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None
    return sid if sid and sid > 0 else None


def _whatsapp_recent_schedule_action_context(
    db: Session, *, tenant_id: int, client_whatsapp_key: str | None, within_minutes: int = 90
) -> str | None:
    """Última confirmação/remarcação via botões ou palavras-chave do WhatsApp (eventos reais), para não misturar com o histórico do chat."""
    from app.whatsapp import _tenant_tz

    if not client_whatsapp_key:
        return None
    cid = _resolve_client_id_for_wa(db, tenant_id, client_whatsapp_key)
    if cid is None:
        return None
    since = datetime.now(timezone.utc) - timedelta(minutes=max(15, int(within_minutes)))
    rows = db.execute(
        select(WhatsappMessageEvent)
        .where(
            WhatsappMessageEvent.tenant_id == tenant_id,
            WhatsappMessageEvent.event_type.in_(
                ("schedule_action_confirm_applied", "schedule_action_reschedule_pick_applied")
            ),
            WhatsappMessageEvent.created_at >= since,
        )
        .order_by(desc(WhatsappMessageEvent.id))
        .limit(40)
    ).scalars().all()
    for ev in rows:
        sid = _schedule_id_from_wa_event_payload(ev.payload_json)
        if sid is None:
            continue
        sched = db.execute(
            select(Schedule).where(Schedule.id == sid, Schedule.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if sched is None or int(sched.client_id) != int(cid):
            continue
        if sched.status == ScheduleStatus.CANCELLED:
            continue
        when = _format_datetime_local_br(db, tenant_id, sched.starts_at)
        tenant_row = db.get(Tenant, tenant_id)
        tz = _tenant_tz(tenant_row) if tenant_row is not None else timezone.utc
        wday = _weekday_pt_br(sched.starts_at.astimezone(tz).date())
        if "confirm" in ev.event_type:
            verb = "confirmou a visita"
        else:
            verb = "teve o horário atualizado (remarcação pelo WhatsApp)"
        return (
            f"<contexto_ultima_acao_whatsapp>\n"
            f"Registro automático do sistema: o cliente {verb} — agendamento #{sched.id} para *{when}* "
            f"({wday}).\n"
            f"Ao se despedir, mencionar o próximo encontro ou \"te vejo\", use SOMENTE esta data/hora (ou chame "
            f"list_my_appointments). Não use datas de mensagens antigas neste chat (ex.: outro agendamento ou opção "
            f"enviada antes) se conflitarem com este registro.\n"
            f"</contexto_ultima_acao_whatsapp>"
        )
    return None


def _format_datetime_local_br(db: Session, tenant_id: int, dt: datetime | None) -> str:
    """Exibe data/hora no fuso configurado do tenant (campo timezone em tenants)."""
    if dt is None:
        return "—"
    from app.whatsapp import _tenant_tz

    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return dt.astimezone(timezone.utc).strftime("%d/%m/%Y às %H:%M") + " (UTC)"
    tz = _tenant_tz(tenant)
    local = dt.astimezone(tz)
    base = local.strftime("%d/%m/%Y às %H:%M")
    abbr = local.tzname()
    if abbr:
        return f"{base} ({abbr})"
    return f"{base} ({tenant.timezone})"


def _collect_reschedule_slot_options(
    db: Session,
    *,
    tenant_id: int,
    schedule: Schedule,
    target_date: date_type,
) -> list[dict[str, Any]]:
    """Propõe horários para remarcação. Se a visita não tem técnico na OS, usa qualquer técnico ativo com encaixe."""
    from app.whatsapp import (
        _check_technician_conflict,
        _check_technician_work_rules,
        _ensure_inside_workday,
        _jump_to_end_of_conflicting_schedule,
        _tenant_tz,
    )

    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return []
    tenant_tz = _tenant_tz(tenant)
    duration_minutes = max(1, int((schedule.ends_at - schedule.starts_at).total_seconds() // 60))
    holidays = set(
        db.execute(select(TenantHoliday.holiday_date).where(TenantHoliday.tenant_id == tenant_id)).scalars().all()
    )
    assigned_ids = [item.technician_id for item in schedule.technicians]
    multi_tech_mode = len(assigned_ids) > 0
    if not assigned_ids:
        assigned_ids = [
            row.id
            for row in db.execute(
                select(User)
                .where(
                    User.tenant_id == tenant_id,
                    User.role == UserRole.TECHNICIAN,
                    User.is_active.is_(True),
                )
                .order_by(User.id.asc())
            ).scalars().all()
        ]
    if not assigned_ids:
        return []

    local_base = datetime.combine(target_date, time(8, 0), tzinfo=tenant_tz)
    local_limit = datetime.combine(target_date, time(18, 0), tzinfo=tenant_tz)
    probe_local = local_base
    morning: list[dict[str, Any]] = []
    afternoon: list[dict[str, Any]] = []

    while probe_local < local_limit and (len(morning) < 2 or len(afternoon) < 2):
        period = "morning" if probe_local.hour < 12 else "afternoon"
        if (period == "morning" and len(morning) >= 2) or (period == "afternoon" and len(afternoon) >= 2):
            probe_local += timedelta(minutes=15)
            continue
        start_utc = probe_local.astimezone(timezone.utc)
        end_utc = (probe_local + timedelta(minutes=duration_minutes)).astimezone(timezone.utc)
        try:
            _ensure_inside_workday(start_utc, end_utc, tenant=tenant, holidays=holidays)
        except HTTPException:
            probe_local += timedelta(minutes=15)
            continue

        chosen_technician: int | None = None
        if multi_tech_mode:
            try:
                for technician_id in assigned_ids:
                    _check_technician_conflict(
                        db=db,
                        tenant_id=tenant_id,
                        technician_id=technician_id,
                        starts_at=start_utc,
                        ends_at=end_utc,
                        ignore_schedule_id=schedule.id,
                    )
                    _check_technician_work_rules(
                        db=db,
                        tenant_id=tenant_id,
                        technician_id=technician_id,
                        starts_at=start_utc,
                        ends_at=end_utc,
                        tenant_tz=tenant_tz,
                    )
                chosen_technician = assigned_ids[0]
            except HTTPException:
                chosen_technician = None
        else:
            for technician_id in assigned_ids:
                try:
                    _check_technician_conflict(
                        db=db,
                        tenant_id=tenant_id,
                        technician_id=technician_id,
                        starts_at=start_utc,
                        ends_at=end_utc,
                        ignore_schedule_id=schedule.id,
                    )
                    _check_technician_work_rules(
                        db=db,
                        tenant_id=tenant_id,
                        technician_id=technician_id,
                        starts_at=start_utc,
                        ends_at=end_utc,
                        tenant_tz=tenant_tz,
                    )
                    chosen_technician = technician_id
                    break
                except HTTPException:
                    continue

        if chosen_technician is None:
            jump_probe = _jump_to_end_of_conflicting_schedule(
                db,
                tenant_id=tenant_id,
                technician_ids=assigned_ids,
                starts_at=start_utc,
                ends_at=end_utc,
                ignore_schedule_id=schedule.id,
            )
            if jump_probe is not None and jump_probe > start_utc:
                probe_local = jump_probe.astimezone(tenant_tz)
            else:
                probe_local += timedelta(minutes=15)
            continue

        item = {
            "starts_at_utc": start_utc.isoformat(),
            "ends_at_utc": end_utc.isoformat(),
            "starts_local": _format_datetime_local_br(db, tenant_id, start_utc),
            "ends_local": _format_datetime_local_br(db, tenant_id, end_utc),
            "local_label": probe_local.strftime("%d/%m/%Y %H:%M"),
            "technician_id": chosen_technician,
        }
        if period == "morning":
            morning.append(item)
        else:
            afternoon.append(item)
        probe_local += timedelta(minutes=15)

    return morning + afternoon


def _list_my_appointments_tool(
    db: Session, *, tenant_id: int, client_wa_digits: str | None
) -> dict[str, Any]:
    if not client_wa_digits:
        return {"ok": False, "message": "WhatsApp do cliente não identificado para listar visitas."}
    cid = _resolve_client_id_for_wa(db, tenant_id, client_wa_digits)
    if cid is None:
        return {"ok": False, "message": "Não encontrei cadastro com este número de WhatsApp."}
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(Schedule)
        .where(
            Schedule.tenant_id == tenant_id,
            Schedule.client_id == cid,
            Schedule.status.in_(
                [ScheduleStatus.PENDING, ScheduleStatus.CONFIRMED, ScheduleStatus.IN_PROGRESS]
            ),
            Schedule.starts_at >= now - timedelta(days=1),
        )
        .order_by(Schedule.starts_at.asc())
        .limit(15)
    ).scalars().all()
    items = [
        {
            "appointment_id": r.id,
            "starts_at_utc": r.starts_at.isoformat(),
            "ends_at_utc": r.ends_at.isoformat(),
            "starts_local": _format_datetime_local_br(db, tenant_id, r.starts_at),
            "ends_local": _format_datetime_local_br(db, tenant_id, r.ends_at),
            "status": r.status.value,
        }
        for r in rows
    ]
    return {"ok": True, "client_id": cid, "appointments": items}


def _get_my_client_profile_tool(
    db: Session,
    *,
    tenant_id: int,
    client_wa_digits: str | None,
) -> dict[str, Any]:
    if not client_wa_digits:
        return {"ok": False, "message": "WhatsApp não identificado neste chat."}
    cid = _resolve_client_id_for_wa(db, tenant_id, client_wa_digits)
    if cid is None:
        return {"ok": False, "message": "Não encontrei cadastro para este WhatsApp."}
    row = db.execute(
        select(Client).where(Client.tenant_id == tenant_id, Client.id == cid)
    ).scalar_one_or_none()
    if row is None:
        return {"ok": False, "message": "Cliente não encontrado."}
    address_parts = [
        (row.address_street or "").strip(),
        (row.address_number or "").strip(),
        (row.address_complement or "").strip(),
        (row.address_district or "").strip(),
        (row.address_city or "").strip(),
        (row.address_state or "").strip(),
    ]
    address = ", ".join([p for p in address_parts if p])
    profile = {
        "client_id": row.id,
        "name": (row.name or "").strip(),
        "phone": (row.phone or "").strip() or None,
        "whatsapp": (row.whatsapp or "").strip() or None,
        "email": (row.email or "").strip() or None,
        "address_full": address or None,
        "address_street": (row.address_street or "").strip() or None,
        "address_number": (row.address_number or "").strip() or None,
        "address_complement": (row.address_complement or "").strip() or None,
        "address_district": (row.address_district or "").strip() or None,
        "address_city": (row.address_city or "").strip() or None,
        "address_state": (row.address_state or "").strip() or None,
        "address_postal_code": (row.address_postal_code or "").strip() or None,
    }
    missing: list[str] = []
    if not profile["address_city"]:
        missing.append("cidade")
    if not profile["address_district"]:
        missing.append("bairro")
    if not profile["address_street"]:
        missing.append("rua")
    if not profile["address_number"]:
        missing.append("numero")
    return {
        "ok": True,
        "client": profile,
        "missing_fields": missing,
        "confirmation_hint": "Confirme os dados com o cliente antes de concluir o agendamento.",
    }


def _resolve_booking_duration_and_service(
    db: Session, tenant_id: int, service_id: int | None
) -> tuple[int, Service | None]:
    if service_id is not None:
        svc = db.execute(
            select(Service).where(
                Service.tenant_id == tenant_id, Service.id == int(service_id), Service.is_active.is_(True)
            )
        ).scalar_one_or_none()
        if svc is not None:
            return max(1, int(svc.duration_minutes or 60)), svc
    svc = db.execute(
        select(Service)
        .where(Service.tenant_id == tenant_id, Service.is_active.is_(True))
        .order_by(Service.id.asc())
        .limit(1)
    ).scalar_one_or_none()
    if svc is not None:
        return max(1, int(svc.duration_minutes or 60)), svc
    return 60, None


def _get_next_available_slots_tool(
    db: Session,
    *,
    tenant_id: int,
    days_ahead: int = 5,
    max_days_with_slots: int = 3,
    service_id: int | None = None,
) -> dict[str, Any]:
    from app.routers.service_orders import _tenant_tz, suggest_booking_slots

    _ = (days_ahead, max_days_with_slots)  # legado: mantidos na assinatura por compatibilidade

    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return {"ok": False, "message": "Empresa não encontrada."}
    tz = _tenant_tz(tenant)
    duration_minutes, svc = _resolve_booking_duration_and_service(db, tenant_id, service_id)
    if svc is None:
        return {"ok": False, "message": "Não há serviço ativo para calcular duração e sugerir horários."}

    raw = suggest_booking_slots(
        db,
        tenant=tenant,
        tenant_id=tenant_id,
        duration_minutes=duration_minutes,
        from_at=datetime.now(timezone.utc),
        technician_id=None,
        limit=4,
        allow_overtime=False,
    )
    if not raw:
        return {
            "ok": False,
            "message": (
                "Não há técnicos ativos ou encaixe livre no período (jornada, feriados ou conflitos). "
                "Peça um atendente humano ou ajuste cadastros de técnicos."
            ),
            "duration_minutes_used": duration_minutes,
            "service_id_used": svc.id,
        }
    booking_options: list[dict[str, Any]] = []
    for i, slot in enumerate(raw, start=1):
        local_date = slot.starts_at.astimezone(tz).date()
        period = "manhã" if slot.shift == "morning" else "tarde" if slot.shift == "afternoon" else ""
        starts_local_fmt = slot.starts_at.astimezone(tz).strftime("%Y-%m-%d %H:%M")
        booking_options.append(
            {
                "option": i,
                "period": period,
                "shift": slot.shift,
                "technician_id": slot.technician_id,
                "duration_minutes": duration_minutes,
                "service_id": svc.id,
                "starts_at_local_iso": starts_local_fmt,
                "ends_at_local_iso": slot.ends_at.astimezone(tz).strftime("%Y-%m-%d %H:%M"),
                "starts_local": _format_datetime_local_br(db, tenant_id, slot.starts_at),
                "ends_local": _format_datetime_local_br(db, tenant_id, slot.ends_at),
                "day_label": f"{local_date.strftime('%d/%m/%Y')} ({_weekday_pt_br(local_date)})",
                "starts_at_utc": slot.starts_at.isoformat(),
                "ends_at_utc": slot.ends_at.isoformat(),
            }
        )

    return {
        "ok": True,
        "timezone": str(tz),
        "duration_minutes_used": duration_minutes,
        "service_id_used": svc.id,
        "booking_options": booking_options,
        "note": (
            "Estas opções usam a mesma lógica do botão de sugestão da OS: até 4 horários, alternando manhã "
            "(até ~12h conforme cadastro) e tarde (a partir de 13h), com duração do serviço escolhido. "
            "Mostre as opções numeradas ao cliente. Só depois da escolha use create_appointment com starts_at_local "
            "igual a starts_at_local_iso da opção e technician_id correspondente."
        ),
    }


def _create_appointment_tool(
    db: Session,
    *,
    tenant_id: int,
    client_wa_digits: str | None,
    starts_at_local: str,
    service_id: int | None = None,
    technician_id: int | None = None,
    duration_minutes: int = 60,
    service_summary: str | None = None,
    client_name: str | None = None,
    address_street: str | None = None,
    address_number: str | None = None,
    address_district: str | None = None,
    address_city: str | None = None,
    address_state: str | None = None,
) -> dict[str, Any]:
    if not client_wa_digits:
        return {"ok": False, "message": "WhatsApp do cliente não identificado neste chat."}
    policy = _load_tool_policy(db, tenant_id)
    cid = _resolve_client_id_for_wa(db, tenant_id, client_wa_digits)
    created_client = False
    if cid is None and not policy.auto_client_create:
        return {
            "ok": False,
            "message": (
                "Cliente sem cadastro. Ative 'criar cadastro automático' nas configurações da IA "
                "ou peça os dados para um atendente concluir."
            ),
        }
    if cid is None:
        fallback_name = f"Cliente WhatsApp {client_wa_digits[-4:]}" if client_wa_digits else "Cliente WhatsApp"
        c = Client(
            tenant_id=tenant_id,
            name=(client_name or "").strip() or fallback_name,
            tax_id_kind="cpf",
            whatsapp=client_wa_digits,
            phone=client_wa_digits,
            address_street=(address_street or "").strip() or None,
            address_number=(address_number or "").strip() or None,
            address_district=(address_district or "").strip() or None,
            address_city=(address_city or "").strip() or None,
            address_state=((address_state or "").strip().upper()[:2] or None),
            address_country="Brasil",
        )
        db.add(c)
        db.flush()
        cid = c.id
        created_client = True
    else:
        c = db.execute(select(Client).where(Client.tenant_id == tenant_id, Client.id == cid)).scalar_one_or_none()
        if c is not None:
            if client_name and not (c.name or "").strip():
                c.name = client_name.strip()[:150]
            if not (c.whatsapp or "").strip():
                c.whatsapp = client_wa_digits
            if address_street and not c.address_street:
                c.address_street = address_street.strip()[:255]
            if address_number and not c.address_number:
                c.address_number = address_number.strip()[:20]
            if address_district and not c.address_district:
                c.address_district = address_district.strip()[:100]
            if address_city and not c.address_city:
                c.address_city = address_city.strip()[:100]
            if address_state and not c.address_state:
                c.address_state = address_state.strip().upper()[:2]

    start_utc = _parse_local_datetime_for_tenant(db, tenant_id, starts_at_local)
    if start_utc is None:
        return {"ok": False, "message": "Use starts_at_local no formato YYYY-MM-DD HH:MM (horário local da empresa)."}
    if start_utc < datetime.now(timezone.utc):
        return {"ok": False, "message": "Não posso agendar no passado."}

    # service_id é opcional: quando ausente, usa o primeiro serviço ativo do tenant.
    if service_id is not None:
        svc = db.execute(
            select(Service).where(Service.tenant_id == tenant_id, Service.id == int(service_id), Service.is_active.is_(True))
        ).scalar_one_or_none()
    else:
        svc = db.execute(
            select(Service).where(Service.tenant_id == tenant_id, Service.is_active.is_(True)).order_by(Service.id.asc()).limit(1)
        ).scalar_one_or_none()
    if svc is None:
        return {"ok": False, "message": "Não há serviço ativo cadastrado para abrir OS e agendar."}

    raw_dur = int(svc.duration_minutes or duration_minutes or 60)
    dur = max(15, min(max(1, raw_dur), 8 * 60))
    end_utc = start_utc + timedelta(minutes=dur)

    conflict = db.execute(
        select(Schedule.id).where(
            Schedule.tenant_id == tenant_id,
            Schedule.status.in_([ScheduleStatus.PENDING, ScheduleStatus.CONFIRMED, ScheduleStatus.IN_PROGRESS]),
            Schedule.starts_at < end_utc,
            Schedule.ends_at > start_utc,
        )
    ).scalar_one_or_none()
    if conflict is not None:
        return {"ok": False, "message": "Este horário já está ocupado na agenda. Use get_next_available_slots e ofereça outras opções."}

    tenant_row = db.get(Tenant, tenant_id)
    if technician_id is not None and tenant_row is not None:
        from app.routers.service_orders import _check_technician_conflict, _check_technician_work_rules, _tenant_tz

        tid = int(technician_id)
        tech = db.execute(
            select(User).where(
                User.id == tid,
                User.tenant_id == tenant_id,
                User.role == UserRole.TECHNICIAN,
                User.is_active.is_(True),
            )
        ).scalar_one_or_none()
        if tech is None:
            return {"ok": False, "message": "Técnico inválido ou inativo para este agendamento."}
        ttz = _tenant_tz(tenant_row)
        try:
            _check_technician_conflict(
                db,
                tenant_id=tenant_id,
                technician_id=tid,
                starts_at=start_utc,
                ends_at=end_utc,
            )
            _check_technician_work_rules(
                db,
                tenant_id=tenant_id,
                technician_id=tid,
                starts_at=start_utc,
                ends_at=end_utc,
                tenant_tz=ttz,
            )
        except HTTPException as exc:
            detail = exc.detail
            msg = detail if isinstance(detail, str) else "Conflito de agenda do técnico."
            return {"ok": False, "message": msg}

    order_title = f"Agendamento WhatsApp - {svc.name}"
    order = ServiceOrder(
        tenant_id=tenant_id,
        client_id=int(cid),
        title=order_title[:200],
        description=(service_summary or "").strip()[:4000] or None,
        discount_amount=0.0,
        status=OrderStatus.OPEN,
    )
    db.add(order)
    db.flush()
    db.add(
        ServiceOrderServiceItem(
            service_order_id=order.id,
            service_id=svc.id,
            quantity=1,
            unit_price=float(svc.price or 0),
            duration_minutes=max(1, int(dur)),
        )
    )

    schedule = Schedule(
        tenant_id=tenant_id,
        client_id=int(cid),
        service_order_id=order.id,
        starts_at=start_utc,
        ends_at=end_utc,
        status=ScheduleStatus.PENDING,
        notes=(service_summary or "").strip()[:2000] or None,
    )
    db.add(schedule)
    db.flush()
    if technician_id is not None:
        db.add(ScheduleTechnician(schedule_id=schedule.id, technician_id=int(technician_id)))
    order.status = OrderStatus.SCHEDULED
    db.commit()
    db.refresh(schedule)
    return {
        "ok": True,
        "service_order_id": order.id,
        "appointment_id": schedule.id,
        "client_id": int(cid),
        "starts_at_utc": schedule.starts_at.isoformat(),
        "ends_at_utc": schedule.ends_at.isoformat(),
        "starts_local": _format_datetime_local_br(db, tenant_id, schedule.starts_at),
        "ends_local": _format_datetime_local_br(db, tenant_id, schedule.ends_at),
        "technician_id": int(technician_id) if technician_id is not None else None,
        "duration_minutes": dur,
        "created_client": created_client,
    }


def _find_reschedule_slots_tool(
    db: Session,
    *,
    tenant_id: int,
    client_wa_digits: str | None,
    appointment_id: int,
    target_date: str,
) -> dict[str, Any]:
    if not client_wa_digits:
        return {"ok": False, "message": "WhatsApp não identificado."}
    cid = _resolve_client_id_for_wa(db, tenant_id, client_wa_digits)
    if cid is None:
        return {"ok": False, "message": "Cadastro não encontrado para este WhatsApp."}
    sched = db.execute(
        select(Schedule)
        .where(Schedule.tenant_id == tenant_id, Schedule.id == int(appointment_id))
        .options(selectinload(Schedule.technicians))
    ).scalar_one_or_none()
    if sched is None or sched.client_id != cid:
        return {"ok": False, "message": "Esse agendamento não pertence a este contato."}
    try:
        td = date_type.fromisoformat((target_date or "").strip()[:10])
    except ValueError:
        return {"ok": False, "message": "Use target_date no formato YYYY-MM-DD."}
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return {"ok": False, "message": "Empresa não encontrada."}
    from app.whatsapp import _tenant_tz

    today_local = datetime.now(_tenant_tz(tenant)).date()
    if td < today_local:
        return {"ok": False, "message": "Não posso sugerir remarcação para data passada. Informe uma data futura."}
    options = _collect_reschedule_slot_options(db, tenant_id=tenant_id, schedule=sched, target_date=td)
    note: str | None = None
    if not options:
        if not sched.technicians:
            note = (
                "Nenhum encaixe neste dia (feriado, fora da jornada ou todos os técnicos ocupados) "
                "ou não há técnicos ativos no cadastro. Tente outra data ou peça suporte humano."
            )
        else:
            note = "Nenhum encaixe neste dia para o(s) técnico(s) da OS; tente outra data."
    elif not sched.technicians:
        note = (
            "A OS não tinha técnico: cada opção inclui technician_id. Ao chamar reschedule_appointment, "
            "use o mesmo technician_id da opção escolhida."
        )
    return {
        "ok": True,
        "appointment_id": sched.id,
        "target_date": td.isoformat(),
        "duration_minutes": max(1, int((sched.ends_at - sched.starts_at).total_seconds() // 60)),
        "timezone_hint": "Use starts_local / ends_local ao falar com o cliente; ISO é só referência técnica.",
        "options": options,
        **({"note": note} if note else {}),
    }


def _reschedule_appointment_tool(
    db: Session,
    *,
    tenant_id: int,
    client_wa_digits: str | None,
    appointment_id: int,
    new_starts_at_utc: str,
    technician_id: int | None = None,
) -> dict[str, Any]:
    from app.whatsapp import (
        _check_technician_conflict,
        _check_technician_work_rules,
        _ensure_inside_workday,
        _tenant_tz,
    )

    if not client_wa_digits:
        return {"ok": False, "message": "WhatsApp não identificado."}
    cid = _resolve_client_id_for_wa(db, tenant_id, client_wa_digits)
    if cid is None:
        return {"ok": False, "message": "Cadastro não encontrado."}
    sched = db.execute(
        select(Schedule)
        .where(Schedule.tenant_id == tenant_id, Schedule.id == int(appointment_id))
        .options(selectinload(Schedule.technicians))
    ).scalar_one_or_none()
    if sched is None or sched.client_id != cid:
        return {"ok": False, "message": "Agendamento não encontrado para este contato."}
    new_start = _parse_iso_datetime(new_starts_at_utc)
    if new_start is None:
        return {"ok": False, "message": "new_starts_at_utc inválido (use ISO 8601 com fuso, ex.: ...T14:00:00-03:00 ou ...Z)."}
    if new_start <= datetime.now(timezone.utc):
        return {"ok": False, "message": "Não posso remarcar para horário no passado. Escolha um horário futuro."}
    duration = sched.ends_at - sched.starts_at
    new_end = new_start + duration
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return {"ok": False, "message": "Empresa não encontrada."}
    holidays = set(
        db.execute(select(TenantHoliday.holiday_date).where(TenantHoliday.tenant_id == tenant_id)).scalars().all()
    )
    tenant_tz = _tenant_tz(tenant)

    tech_ids: list[int] = [st.technician_id for st in sched.technicians]
    assign_technician_id: int | None = None
    if not tech_ids:
        if technician_id is None:
            return {
                "ok": False,
                "message": (
                    "Este agendamento ainda não tem técnico na OS. Use find_reschedule_slots e, ao remarcar, "
                    "passe o mesmo technician_id retornado na opção escolhida, além de new_starts_at_utc."
                ),
            }
        tid_new = int(technician_id)
        tech_row = db.execute(
            select(User).where(
                User.id == tid_new,
                User.tenant_id == tenant_id,
                User.role == UserRole.TECHNICIAN,
                User.is_active.is_(True),
            )
        ).scalar_one_or_none()
        if tech_row is None:
            return {"ok": False, "message": "technician_id inválido ou técnico inativo."}
        tech_ids = [tid_new]
        assign_technician_id = tid_new

    try:
        _ensure_inside_workday(new_start, new_end, tenant=tenant, holidays=holidays)
        for tid in tech_ids:
            _check_technician_conflict(
                db=db,
                tenant_id=tenant_id,
                technician_id=tid,
                starts_at=new_start,
                ends_at=new_end,
                ignore_schedule_id=sched.id,
            )
            _check_technician_work_rules(
                db=db,
                tenant_id=tenant_id,
                technician_id=tid,
                starts_at=new_start,
                ends_at=new_end,
                tenant_tz=tenant_tz,
            )
    except HTTPException as exc:
        d = exc.detail
        if isinstance(d, str):
            detail = d
        elif isinstance(d, list):
            detail = json.dumps(d, ensure_ascii=False)
        else:
            detail = str(d)
        return {"ok": False, "message": detail}

    note = f"[WhatsApp IA] Remarcado automaticamente em {datetime.now(timezone.utc).isoformat()}."
    sched.starts_at = new_start
    sched.ends_at = new_end
    sched.notes = f"{sched.notes or ''}\n{note}".strip()
    db.add(sched)
    if assign_technician_id is not None:
        db.add(ScheduleTechnician(schedule_id=sched.id, technician_id=assign_technician_id))
    db.commit()
    return {
        "ok": True,
        "appointment_id": sched.id,
        "new_starts_at_utc": new_start.isoformat(),
        "new_ends_at_utc": new_end.isoformat(),
        "technician_id_assigned": assign_technician_id,
    }


def _build_system_prompt(
    context: CompanyContext,
    *,
    client_identified: bool,
    client_display_name: str | None,
) -> str:
    services_json = json.dumps(context.services, ensure_ascii=False)
    prices_json = json.dumps(context.prices, ensure_ascii=False)
    products_json = json.dumps(context.products, ensure_ascii=False)
    rules = _safe_text(context.cancellation_rules)
    instructions = _safe_text(context.custom_instructions)
    clar = _safe_text(context.clarification_instructions)

    visibility_notes: list[str] = []
    if not context.context_services_catalog_enabled:
        visibility_notes.append(
            "Catálogo de serviços (nomes/descrições/durações) não está incluído neste assistente — não liste nem invente serviços do cadastro."
        )
    if not context.context_service_prices_enabled:
        visibility_notes.append(
            "Preços de serviços não estão incluídos — não informe valores de serviços do sistema; um humano confirma orçamentos."
        )
    if not context.context_products_enabled:
        visibility_notes.append(
            "Produtos/estoque não estão incluídos — não detalhe SKU, preço ou quantidade de produtos; encaminhe para um atendente."
        )

    tool_notes: list[str] = []
    if not context.tool_agenda_read_enabled:
        tool_notes.append("Não consulte agenda (lista de visitas ou horários livres) por ferramentas — ofereça contato humano.")
    if not context.tool_reschedule_enabled:
        tool_notes.append("Não remarque visitas por ferramentas.")
    if not context.tool_cancel_enabled:
        tool_notes.append("Não cancele visitas por ferramentas.")
    if not context.tool_billing_enabled:
        tool_notes.append(
            "Não gere links de pagamento nem finalize serviços pelo assistente; cobrança é apenas com equipe humana."
        )

    restr_extra = ""
    if visibility_notes or tool_notes:
        restr_extra = (
            "\nRestrições configuradas pela empresa (obrigatório):\n"
            + "\n".join(f"- {line}" for line in visibility_notes + tool_notes)
            + "\n"
        )

    clar_block = ""
    if clar:
        clar_block = f"""
<perguntas_e_esclarecimentos>
Antes de concluir respostas sobre temas sensíveis, valores, agenda ou cobrança, siga estas regras adicionais da empresa.
Faça as perguntas necessárias ao cliente quando precisar de dados que não estão no contexto:
{clar}
</perguntas_e_esclarecimentos>
"""
    priority_client_rules = ""
    if instructions:
        priority_client_rules = f"""
<regras_prioritarias_do_cliente>
Estas regras foram escritas pelo dono da empresa e têm prioridade alta.
Siga de forma consistente em todas as respostas, salvo conflito com segurança/política do sistema:
{instructions}
</regras_prioritarias_do_cliente>
"""

    cliente_bloco = ""
    if client_identified:
        nome = _safe_text(client_display_name) or "cliente identificado pelo WhatsApp"
        remarcacao_linha = (
            "Para remarcar: primeiro list_my_appointments, depois find_reschedule_slots com o appointment_id e data desejada; "
            "só então reschedule_appointment com o horário escolhido (o sistema pedirá confirmação SIM ao cliente)."
            if context.tool_agenda_read_enabled and context.tool_reschedule_enabled
            else "Para alterar horários de visitas, encaminhe para um atendente humano (ferramentas de agenda não estão disponíveis neste assistente)."
        )
        novo_agendamento_linha = (
            "Para novo agendamento com agendamento direto: primeiro get_next_available_slots (com service_id se já souber o serviço); "
            "mostre até 4 opções numeradas (manhã/tarde). Só depois que o cliente escolher uma opção, use create_appointment com "
            "starts_at_local igual ao starts_at_local_iso da opção e o mesmo technician_id."
            if context.allow_direct_schedule
            else "Para novo agendamento, colete dados e peça confirmação humana antes de efetivar na agenda."
        )
        cliente_bloco = f"""
<cliente_atual>
O número deste chat está associado ao cadastro: {nome}.
Use SOMENTE list_my_appointments e dados desse cliente para falar de visitas agendadas — nunca misture com outros clientes.
Para novo agendamento, primeiro use get_my_client_profile para reaproveitar dados do cadastro (nome/endereço) e peça apenas confirmação/complemento.
Para sugerir horários, use get_next_available_slots (não invente horários): ele retorna as mesmas sugestões inteligentes do botão da OS.
{novo_agendamento_linha}
{remarcacao_linha}
</cliente_atual>
"""
    else:
        missing_client_line = (
            "Se o cliente quiser agendar e ainda não tiver cadastro, use create_appointment com os dados informados para criar cadastro e agendar."
            if (context.allow_direct_schedule and context.allow_auto_client_create)
            else "Sem cadastro identificado, colete nome/endereço e encaminhe para confirmação humana antes de agendar."
        )
        cliente_bloco = f"""
<cliente_atual>
WhatsApp ainda não foi associado a um cadastro de cliente neste sistema. Não afirme dados de agendamentos específicos; ofereça preços gerais da empresa e encaminhe para identificar o cadastro se precisar de visitas.
{missing_client_line}
</cliente_atual>
"""

    sens_line = (
        "cancel_appointment, finalize_service e reschedule_appointment só são aplicados depois que o cliente confirma por escrito (SIM) "
        "— ao chamar reschedule_appointment o sistema pode enviar pedido de confirmação automático. "
        "create_appointment só pode ser usado se a empresa habilitar agendamento direto."
        if (context.tool_cancel_enabled or context.tool_reschedule_enabled or context.tool_billing_enabled)
        else "Alterações em visitas ou cobrança devem ser tratadas por um atendente humano."
    )

    if context.context_services_catalog_enabled and context.services:
        serv_line = (
            "Se o cliente perguntar por serviços, pelo catálogo ou 'o que vocês fazem', liste os serviços do contexto "
            "em formato profissional: item em lista com nome, benefício principal, duração estimada e (quando existir) valor inicial. "
            "Antes de recomendar, filtre por compatibilidade técnica usando equipment_type_tags, btu_min, btu_max, "
            "applies_residential/applies_commercial e service_category quando o cliente informar tipo, BTU ou se é residencial/comercial. "
            "Se o cliente disser o tipo de equipamento e existirem serviços com tags no cadastro, priorize só os compatíveis; "
            "itens sem tags são genéricos — use-os só quando não houver opção marcada ou após confirmar com o cliente. "
            "Evite responder apenas com uma frase genérica de boas-vindas.\n"
        )
    elif context.context_services_catalog_enabled and not context.services:
        serv_line = (
            "No contexto não há serviços cadastrados; diga isso e ofereça um atendente humano para o catálogo.\n"
        )
    else:
        serv_line = (
            "O catálogo de serviços não está liberado neste assistente (configuração da empresa); não invente lista de serviços.\n"
        )

    return f"""
<contexto_da_empresa>
Nome: {context.company_name}
Serviços (cadastro): {services_json}
Preços base dos serviços (R$): {prices_json}
Produtos em estoque (amostra): {products_json}
Políticas / observações: {rules}
</contexto_da_empresa>
{cliente_bloco}
{clar_block}
{priority_client_rules}
<instrucoes_de_agente>
Você é {context.agent_name}, assistente da empresa acima (climatização / HVAC).
Tom de voz: {context.tone_of_voice}
{serv_line}Use apenas informações do contexto da empresa e dos resultados das ferramentas (tools). Não invente preços, produtos ou horários.
Nunca diga que está em "simulação" ou modo de teste; você consulta dados reais do sistema quando as ferramentas são usadas.
Ao informar horários ao cliente, prefira sempre os campos *local* (starts_local, ends_local, available_slots_local) ao invés de só UTC.
Quando houver day_label nas ferramentas de agenda, use exatamente esse texto para o dia da semana (não calcule por conta própria).
Transmite valores em reais (R$) de forma clara. Se não houver preço cadastrado, diga que um humano confirma.
Converse como uma atendente humana: acolha, faça 1-2 perguntas curtas de descoberta e avance em etapas.
Quando a pergunta for ampla (ex.: "serviços", "preciso de ajuda", "quanto custa"), não despeje tudo de uma vez:
1) valide a necessidade do cliente,
2) faça perguntas-chave (equipamento, problema, bairro/cidade, urgência),
3) só então recomende o serviço e, se possível, ofereça agendamento.
Prefira mensagens curtas, com linguagem natural e finalizando com uma pergunta objetiva para manter o diálogo.
Se houver conflito entre estilo padrão e regras prioritárias do cliente, priorize as regras do cliente.
{sens_line}
{restr_extra}
</instrucoes_de_agente>
""".strip()


def _normalize_client_whatsapp_key(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = "".join(ch for ch in raw.strip() if ch.isdigit())
    if not digits:
        return None
    if len(digits) > 20:
        digits = digits[-20:]
    return digits


def _strip_accents_lower(value: str) -> str:
    raw = (value or "").strip().lower()
    return "".join(
        ch for ch in unicodedata.normalize("NFD", raw) if unicodedata.category(ch) != "Mn"
    )


def _user_message_confirms(value: str) -> bool:
    t = _strip_accents_lower(value)
    if not t:
        return False
    tokens = frozenset(t.replace(",", " ").split())
    if t in ("sim", "s", "ok", "pode", "confirmo", "isso", "certo", "blz", "beleza", "fechado", "manda", "gera"):
        return True
    return bool(tokens & {"sim", "confirmo", "pode", "ok", "certo", "blz", "beleza", "manda", "gera"})


def _user_message_denies(value: str) -> bool:
    t = _strip_accents_lower(value)
    if not t:
        return False
    if t.startswith("nao") or t.startswith("não") or t in ("n", "no"):
        return True
    return any(
        t.startswith(p)
        for p in ("nao ", "não ", "negativo", "cancela", "esquece", "pare", "melhor nao", "melhor não")
    )


def _get_pending_confirmation(
    db: Session, *, tenant_id: int, client_whatsapp: str
) -> AIPendingToolConfirmation | None:
    return db.execute(
        select(AIPendingToolConfirmation).where(
            AIPendingToolConfirmation.tenant_id == tenant_id,
            AIPendingToolConfirmation.client_whatsapp == client_whatsapp,
        )
    ).scalar_one_or_none()


def _clear_pending_confirmation(db: Session, *, tenant_id: int, client_whatsapp: str) -> None:
    db.execute(
        delete(AIPendingToolConfirmation).where(
            AIPendingToolConfirmation.tenant_id == tenant_id,
            AIPendingToolConfirmation.client_whatsapp == client_whatsapp,
        )
    )
    db.commit()


def _store_pending_confirmation(
    db: Session,
    *,
    tenant_id: int,
    client_whatsapp: str,
    tool_name: str,
    arguments: dict[str, Any],
    confirmation_prompt: str,
) -> None:
    _clear_pending_confirmation(db, tenant_id=tenant_id, client_whatsapp=client_whatsapp)
    row = AIPendingToolConfirmation(
        tenant_id=tenant_id,
        client_whatsapp=client_whatsapp,
        tool_name=tool_name,
        arguments_json=json.dumps(arguments, ensure_ascii=False),
        confirmation_prompt=confirmation_prompt,
        expires_at=datetime.now(timezone.utc) + PENDING_CONFIRMATION_TTL,
    )
    db.add(row)
    db.commit()


def _build_sensitive_confirmation_prompt(
    db: Session, *, tenant_id: int, tool_name: str, arguments: dict[str, Any]
) -> str:
    if tool_name == "cancel_appointment":
        aid = arguments.get("appointment_id")
        try:
            aid_int = int(aid) if aid is not None else None
        except (TypeError, ValueError):
            aid_int = None
        if aid_int is None:
            return (
                "Você confirma o cancelamento desta visita? "
                "Responda *SIM* para confirmar ou *NÃO* para deixar como está."
            )
        sched = db.execute(
            select(Schedule).where(Schedule.tenant_id == tenant_id, Schedule.id == aid_int)
        ).scalar_one_or_none()
        if sched is None:
            return (
                "Não encontrei esse agendamento. Confirma mesmo assim o cancelamento (ação pode falhar)? "
                "Responda *SIM* ou *NÃO*."
            )
        when = _format_datetime_local_br(db, tenant_id, sched.starts_at)
        return (
            f"Você confirma o cancelamento da visita agendada para *{when}*? "
            "Responda *SIM* para confirmar ou *NÃO* para manter o agendamento."
        )
    if tool_name == "finalize_service":
        try:
            amount = float(arguments.get("amount") or 0)
        except (TypeError, ValueError):
            amount = 0.0
        desc = str(arguments.get("description") or "serviço").strip() or "serviço"
        return (
            f"Posso gerar o link de pagamento no valor de *R$ {amount:.2f}* referente a: {desc}? "
            "Responda *SIM* para confirmar ou *NÃO* para não gerar agora."
        )
    if tool_name == "reschedule_appointment":
        aid = arguments.get("appointment_id")
        raw_new = str(arguments.get("new_starts_at_utc") or "").strip()
        try:
            aid_int = int(aid) if aid is not None else None
        except (TypeError, ValueError):
            aid_int = None
        new_dt = _parse_iso_datetime(raw_new)
        new_human = _format_datetime_local_br(db, tenant_id, new_dt) if new_dt else raw_new or "—"
        if aid_int is None:
            return "Confirma remarcar esta visita para o novo horário indicado? Responda *SIM* ou *NÃO*."
        sched = db.execute(
            select(Schedule).where(Schedule.tenant_id == tenant_id, Schedule.id == aid_int)
        ).scalar_one_or_none()
        old_human = _format_datetime_local_br(db, tenant_id, sched.starts_at) if sched is not None else "—"
        return (
            f"Confirma remarcar a visita (agendamento *{aid_int}*) de *{old_human}* para *{new_human}*? "
            "Responda *SIM* para aplicar ou *NÃO* para manter o horário atual."
        )
    return "Confirma esta ação? Responda *SIM* ou *NÃO*."


def _reply_after_confirmed_tool(
    db: Session,
    tenant_id: int,
    tool_name: str,
    result: dict[str, Any],
) -> str:
    if result.get("ok") is False:
        return str(result.get("message") or "Não foi possível concluir a ação. Tente de novo ou fale com um atendente.")
    if tool_name == "cancel_appointment":
        return "Pronto! O agendamento foi cancelado conforme solicitado."
    if tool_name == "finalize_service":
        pay = result.get("payment") if isinstance(result.get("payment"), dict) else {}
        url = str(pay.get("payment_url") or "").strip()
        if url:
            return (
                "Tudo certo! Segue o link de pagamento. "
                f"{url}\n"
                "(A emissão da NF seguirá o fluxo configurado na empresa.)"
            )
        return "Tudo certo! O fechamento foi registrado; em instantes envio o link de pagamento se ainda não apareceu acima."
    if tool_name == "reschedule_appointment":
        raw_start = result.get("new_starts_at_utc") or result.get("new_starts_at")
        parsed = _parse_iso_datetime(str(raw_start)) if raw_start else None
        local_txt = _format_datetime_local_br(db, tenant_id, parsed) if parsed else str(raw_start or "").strip()
        return (
            "Pronto! Remarcamos sua visita. "
            f"Novo horário de início: *{local_txt}*. "
            "Se precisar ajustar de novo, é só avisar."
        )
    return "Ação concluída."


def _save_chat_history(
    db: Session,
    *,
    tenant_id: int,
    client_whatsapp: str | None,
    user_message: str,
    assistant_response: str,
    used_model: str | None,
    used_tools: list[dict[str, Any]],
    system_prompt_xml: str,
    is_mock: bool,
) -> None:
    try:
        row = AIChatHistory(
            tenant_id=tenant_id,
            client_whatsapp=(client_whatsapp or None),
            user_message=user_message,
            assistant_response=assistant_response,
            used_model=used_model,
            used_tools_json=json.dumps(used_tools, ensure_ascii=False) if used_tools else None,
            system_prompt_xml=system_prompt_xml,
            is_mock=is_mock,
        )
        db.add(row)
        db.commit()
    except SQLAlchemyError:
        logger.exception(
            "Falha ao gravar ai_chat_history (tenant_id=%s). Resposta ao cliente não será bloqueada.",
            tenant_id,
        )
        db.rollback()


def _recent_conversation_messages(
    db: Session,
    *,
    tenant_id: int,
    client_whatsapp: str | None,
    max_pairs: int = 4,
) -> list[dict[str, str]]:
    """Retorna últimas trocas (usuário/assistente) para manter contexto no Claude."""
    if not client_whatsapp:
        return []
    rows = db.execute(
        select(AIChatHistory)
        .where(
            AIChatHistory.tenant_id == tenant_id,
            AIChatHistory.client_whatsapp == client_whatsapp,
        )
        .order_by(AIChatHistory.created_at.desc(), AIChatHistory.id.desc())
        .limit(max_pairs)
    ).scalars().all()
    if not rows:
        return []
    out: list[dict[str, str]] = []
    for row in reversed(rows):
        user_text = (row.user_message or "").strip()
        if user_text:
            out.append({"role": "user", "content": user_text[:1200]})
        assistant_text = (row.assistant_response or "").strip()
        if assistant_text:
            out.append({"role": "assistant", "content": assistant_text[:1200]})
    return out[-(max_pairs * 2) :]


def _parse_tag_set(raw: Any) -> set[str]:
    text = _strip_accents_lower(str(raw or ""))
    if not text:
        return set()
    return {tok for tok in re.split(r"[\s,;/|]+", text) if tok}


def _infer_equipment_context(text: str) -> tuple[str | None, int | None]:
    normalized = _strip_accents_lower(text)
    eq_type: str | None = None
    mapping: list[tuple[str, tuple[str, ...]]] = [
        ("split", (" split", "hi-wall", "hiwall")),
        ("cassete", ("cassete", "cassette")),
        ("piso teto", ("piso teto", "piso-teto")),
        ("climatizador", ("climatizador",)),
        ("janela", ("janela",)),
        ("fancoil", ("fancoil", "fan coil")),
    ]
    for canonical, keys in mapping:
        if any(k in normalized for k in keys):
            eq_type = canonical
            break
    match = re.search(r"(\d{4,6})\s*(?:btu|btus)?", normalized)
    btu = int(match.group(1)) if match else None
    return eq_type, btu


def _infer_installation_scope(text: str) -> str | None:
    """residential | commercial quando o cliente deixa claro o tipo de local."""
    n = _strip_accents_lower(text)
    if any(k in n for k in ("comercial", "loja", "empresa", "escritorio", "escritório", "galpao", "galpão")):
        return "commercial"
    if any(k in n for k in ("residencial", "casa", "apartamento", "apt ", "condominio", "condomínio")):
        return "residential"
    return None


def _as_int_opt(raw: Any) -> int | None:
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _service_matches_equipment(
    svc: dict[str, Any], eq_type: str | None, btu: int | None, scope: str | None = None
) -> bool:
    tags = _parse_tag_set(svc.get("equipment_type_tags"))
    if eq_type and tags and eq_type not in tags:
        return False
    btu_min = _as_int_opt(svc.get("btu_min"))
    btu_max = _as_int_opt(svc.get("btu_max"))
    if btu is not None:
        if btu_min is not None and btu < btu_min:
            return False
        if btu_max is not None and btu > btu_max:
            return False
    if scope == "residential" and not bool(svc.get("applies_residential", True)):
        return False
    if scope == "commercial" and not bool(svc.get("applies_commercial", True)):
        return False
    return True


def _product_matches_equipment(
    prod: dict[str, Any], eq_type: str | None, btu: int | None, scope: str | None = None
) -> bool:
    tags = _parse_tag_set(prod.get("compatible_equipment_tags"))
    if eq_type and tags and eq_type not in tags:
        return False
    app_scope = str(prod.get("application_scope") or "").strip().lower()
    if scope == "residential" and app_scope == "commercial":
        return False
    if scope == "commercial" and app_scope == "residential":
        return False
    btu_min = _as_int_opt(prod.get("btu_min"))
    btu_max = _as_int_opt(prod.get("btu_max"))
    if btu is not None:
        if btu_min is not None and btu < btu_min:
            return False
        if btu_max is not None and btu > btu_max:
            return False
    return True


def _fallback_local_reply(
    db: Session,
    *,
    tenant_id: int,
    message_text: str,
    client_name: str | None,
    context: CompanyContext,
) -> dict[str, str]:
    """Resposta local quando não há Claude ou resposta vazia — sem mencionar 'simulação'."""
    del db, tenant_id
    text = (message_text or "").strip().lower()
    text_fold = _strip_accents_lower(message_text)
    name = (client_name or "cliente").strip()
    eq_type, btu = _infer_equipment_context(message_text or "")
    install_scope = _infer_installation_scope(message_text or "")
    asks_price = any(
        k in text for k in ("orcamento", "orçamento", "valor", "preco", "preço", "quanto custa")
    )
    # Perguntas só de catálogo ("Serviços", "o que vocês fazem") — depois de preço para não roubar "valor dos serviços"
    asks_catalog_services = (
        ("serviço" in text or "servico" in text_fold)
        or any(p in text for p in ("o que vocês fazem", "o que vcs fazem", "quais serv"))
        or any(p in text_fold for p in ("o que voces fazem", "quais servicos"))
    )

    def _format_services_showcase() -> str:
        lines: list[str] = []
        for svc in context.services[:10]:
            nm = str(svc.get("name") or "Serviço").strip()
            desc = str(svc.get("description") or "").strip()
            try:
                dur = int(svc.get("estimated_duration_minutes") or 0)
            except (TypeError, ValueError):
                dur = 0
            duration = f"{dur} min" if dur > 0 else "sob avaliação técnica"
            base_price = ""
            if context.context_service_prices_enabled:
                hit = next(
                    (p for p in context.prices if str(p.get("service_name") or "").strip().lower() == nm.lower()),
                    None,
                )
                if hit is not None:
                    try:
                        amount = float(hit.get("base_price_brl") or 0)
                        if amount > 0:
                            base_price = f" | Valor inicial: R$ {amount:.2f}"
                    except (TypeError, ValueError):
                        base_price = ""
            benefit = desc if desc else "Indicado para manutenção, correção e melhoria de performance."
            lines.append(f"• *{nm}* ({duration})\n  {benefit}{base_price}")
        return "\n".join(lines)

    def _format_products_showcase(product_rows: list[dict[str, Any]] | None = None) -> str:
        lines: list[str] = []
        rows = product_rows if product_rows is not None else context.products
        for p in rows[:8]:
            name = str(p.get("name") or "Produto").strip()
            sku = str(p.get("sku") or "").strip()
            sku_part = f" | SKU: {sku}" if sku else ""
            try:
                sale = float(p.get("sale_price_brl") or 0)
            except (TypeError, ValueError):
                sale = 0.0
            price_part = f" | R$ {sale:.2f}" if sale > 0 else " | Preço sob consulta"
            try:
                stock = float(p.get("stock") or 0)
            except (TypeError, ValueError):
                stock = 0.0
            stock_part = " | Disponível" if stock > 0 else " | Estoque sob confirmação"
            lines.append(f"• *{name}*{sku_part}{price_part}{stock_part}")
        return "\n".join(lines)
    if asks_price:
        filtered_prices = context.prices
        if eq_type or btu is not None or install_scope:
            allowed_names = {
                str(s.get("name") or "").strip().lower()
                for s in context.services
                if _service_matches_equipment(s, eq_type, btu, install_scope)
            }
            if allowed_names:
                filtered_prices = [
                    p
                    for p in context.prices
                    if str(p.get("service_name") or "").strip().lower() in allowed_names
                ]
        if filtered_prices:
            lines = [
                f"{p.get('service_name', 'Serviço')}: R$ {float(p.get('base_price_brl', 0)):.2f}"
                for p in filtered_prices[:12]
            ]
            body = "\n".join(lines)
            equip_hint = ""
            if eq_type:
                equip_hint += f" para *{eq_type}*"
            if btu is not None:
                equip_hint += f" de *{btu} BTU*"
            return {
                "intent": "fallback_preco_servico",
                "reply_text": (
                    f"Oi {name}! Na {context.company_name}, os valores base cadastrados{equip_hint} são:\n{body}\n"
                    "Quer agendar ou falar com um atendente?"
                ),
            }
        return {
            "intent": "fallback_preco_servico",
            "reply_text": (
                f"Oi {name}! Ainda não há preços de serviços cadastrados para esta empresa no sistema. "
                "Posso encaminhar você para um atendente humano."
            ),
        }
    if asks_catalog_services:
        if not context.context_services_catalog_enabled:
            return {
                "intent": "fallback_servicos_policy",
                "reply_text": (
                    f"Oi {name}! Para te passar o catálogo completo de serviços da {context.company_name}, "
                    "vou pedir para um atendente humano continuar por aqui — assim você recebe detalhes e condições certinhas."
                ),
            }
        filtered_services = context.services
        if eq_type or btu is not None or install_scope:
            filtered_services = [
                s for s in context.services if _service_matches_equipment(s, eq_type, btu, install_scope)
            ]
        if filtered_services:
            top_names = [
                str(s.get("name") or "").strip()
                for s in filtered_services[:4]
                if str(s.get("name") or "").strip()
            ]
            showcase = ""
            if top_names:
                showcase = "As opções mais procuradas aqui são: " + ", ".join(f"*{n}*" for n in top_names) + "."
            price_hint = (
                " Também posso te passar os valores iniciais."
                if context.context_service_prices_enabled and context.prices
                else " Valores finais podem variar conforme o cenário e a equipe confirma com você."
            )
            return {
                "intent": "fallback_servicos",
                "reply_text": (
                    f"Perfeito, {name}! Vou te ajudar como atendimento da *{context.company_name}*.\n"
                    f"{showcase} {price_hint}\n\n"
                    "Para eu te indicar o serviço certo, me diz rapidinho:\n"
                    "1) É instalação, manutenção/limpeza ou reparo?\n"
                    "2) Qual modelo ou potência do aparelho (se souber)?\n"
                    "3) É residencial ou comercial?"
                ),
            }
        if eq_type or btu is not None or install_scope:
            eq_label = eq_type or "esse equipamento"
            btu_label = f" de {btu} BTU" if btu is not None else ""
            return {
                "intent": "fallback_servicos_sem_match",
                "reply_text": (
                    f"Entendi, {name}. Não encontrei serviço cadastrado específico para *{eq_label}{btu_label}*.\n"
                    "Posso te mostrar opções próximas ou chamar um atendente para validar o serviço ideal. "
                    "Quer que eu acione a equipe?"
                ),
            }
        return {
            "intent": "fallback_servicos_vazio",
            "reply_text": (
                f"Oi {name}! Ainda não há serviços cadastrados no sistema para eu listar aqui. "
                "Um atendente da equipe pode te passar o que fazemos e valores."
            ),
        }
    if any(k in text for k in ("produto", "estoque", "comprar")) and context.products:
        prod_rows = context.products
        if eq_type or btu is not None or install_scope:
            prod_rows = [p for p in context.products if _product_matches_equipment(p, eq_type, btu, install_scope)]
        if not prod_rows:
            return {
                "intent": "fallback_produto_sem_match",
                "reply_text": (
                    f"Entendi, {name}. Não encontrei produto cadastrado que combine com o que você descreveu.\n"
                    "Quer que eu chame um atendente para confirmar peça/modelo certo?"
                ),
            }
        body = _format_products_showcase(prod_rows)
        return {
            "intent": "fallback_produto",
            "reply_text": (
                f"Perfeito, {name}! Estes são alguns produtos disponíveis na *{context.company_name}*:\n\n{body}\n\n"
                "Se me disser o modelo do equipamento/ambiente, eu te indico a opção mais adequada."
            ),
        }
    if any(k in text for k in ("status", "andamento", "aprovado", "reprovado")) and "orc" in text:
        return {
            "intent": "fallback_status_orcamento",
            "reply_text": (
                f"Perfeito, {name}. Para consultar o status do orçamento, envie o número do orçamento "
                "ou CPF/CNPJ do titular."
            ),
        }
    if any(k in text for k in ("atendente", "humano", "pessoa")):
        return {
            "intent": "fallback_falar_atendente",
            "reply_text": "Tudo bem! Encaminho seu atendimento para nossa equipe humana.",
        }
    return {
        "intent": "fallback_generico",
        "reply_text": (
            f"Oi! Sou a assistente da {context.company_name} e vou te ajudar agora.\n"
            "Você precisa de instalação, manutenção/limpeza, reparo ou orçamento de produto?"
        ),
    }


def _get_available_slots(db: Session, *, tenant_id: int, date_str: str) -> dict[str, Any]:
    from app.whatsapp import _tenant_tz

    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return {"ok": False, "message": "Empresa não encontrada."}
    try:
        target = date_type.fromisoformat((date_str or "").strip()[:10])
    except ValueError:
        return {"ok": False, "message": "Use date no formato YYYY-MM-DD."}
    tz = _tenant_tz(tenant)
    day_start_local = datetime.combine(target, time.min).replace(tzinfo=tz)
    day_end_local = datetime.combine(target, time(23, 59, 59)).replace(tzinfo=tz)
    start_utc = day_start_local.astimezone(timezone.utc)
    end_utc = day_end_local.astimezone(timezone.utc)
    overlapping = db.execute(
        select(Schedule).where(
            Schedule.tenant_id == tenant_id,
            Schedule.status.in_([ScheduleStatus.PENDING, ScheduleStatus.CONFIRMED, ScheduleStatus.IN_PROGRESS]),
            Schedule.starts_at < end_utc,
            Schedule.ends_at > start_utc,
        )
    ).scalars().all()
    busy_ranges = [(s.starts_at, s.ends_at) for s in overlapping]
    slots_out: list[str] = []
    slots_local: list[str] = []
    probe_local = datetime.combine(target, time(8, 0), tzinfo=tz)
    day_cap = datetime.combine(target, time(17, 30), tzinfo=tz)
    while probe_local <= day_cap:
        slot_end_local = probe_local + timedelta(hours=1)
        su = probe_local.astimezone(timezone.utc)
        eu = slot_end_local.astimezone(timezone.utc)
        conflict = any(bs < eu and be > su for bs, be in busy_ranges)
        if not conflict:
            slots_out.append(su.isoformat())
            slots_local.append(_format_datetime_local_br(db, tenant_id, su))
        probe_local += timedelta(minutes=30)
        if len(slots_out) >= 14:
            break
    return {
        "ok": True,
        "date": target.isoformat(),
        "day_label": f"{target.strftime('%d/%m/%Y')} ({_weekday_pt_br(target)})",
        "timezone": str(tz),
        "available_slots_utc": slots_out,
        "available_slots_local": slots_local,
        "note": (
            "Prefira day_label + available_slots_local ao cliente. "
            "Para remarcar visita existente use find_reschedule_slots."
        ),
    }


def _cancel_appointment(db: Session, *, tenant_id: int, appointment_id: int) -> dict[str, Any]:
    sched = db.execute(
        select(Schedule).where(Schedule.tenant_id == tenant_id, Schedule.id == int(appointment_id))
    ).scalar_one_or_none()
    if sched is None:
        return {"ok": False, "message": "Agendamento não encontrado."}
    sched.status = ScheduleStatus.CANCELLED
    db.add(sched)
    db.commit()
    return {"ok": True, "appointment_id": sched.id, "status": sched.status.value}


def _generate_payment_link(*, amount: float, description: str) -> dict[str, Any]:
    token = f"sim-{int(datetime.now(timezone.utc).timestamp())}"
    return {
        "ok": True,
        "amount": float(amount),
        "description": (description or "Pagamento de serviço")[:120],
        "payment_url": f"https://pay.climaris.local/checkout/{token}",
    }


def _finalize_service(db: Session, *, tenant_id: int, appointment_id: int | None, amount: float, description: str) -> dict[str, Any]:
    if appointment_id is not None:
        try:
            aid = int(appointment_id)
        except (TypeError, ValueError):
            return {
                "ok": False,
                "message": "Não encontrei esse agendamento no sistema.",
            }
        sched = db.execute(
            select(Schedule).where(Schedule.tenant_id == tenant_id, Schedule.id == aid)
        ).scalar_one_or_none()
        if sched is None:
            return {
                "ok": False,
                "message": "Não encontrei esse agendamento no sistema.",
            }
        sched.status = ScheduleStatus.COMPLETED
        db.add(sched)
        db.commit()
        out: dict[str, Any] = {
            "ok": True,
            "appointment_status": sched.status.value,
            "appointment_id": sched.id,
        }
    else:
        out = {"ok": True}
    out["payment"] = _generate_payment_link(amount=amount, description=description)
    out["nf_status"] = "pending_external_invoice_integration"
    return out


def _all_tool_definitions() -> list[dict[str, Any]]:
    return [
        {
            "name": "list_my_appointments",
            "description": (
                "Lista visitas agendadas deste cliente no WhatsApp atual (usa o número da conversa). "
                "Chame antes de falar de remarcação ou cancelamento do próprio cliente."
            ),
            "input_schema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "get_my_client_profile",
            "description": (
                "Lê o cadastro do cliente identificado por este WhatsApp (nome, contato e endereço) "
                "para reaproveitar dados no orçamento/agendamento e pedir somente confirmação ou complemento."
            ),
            "input_schema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "get_available_slots",
            "description": (
                "Visão grosseira de gaps de 1h em um dia (sem duração de serviço nem técnicos). "
                "Para novo agendamento com horários reais, prefira get_next_available_slots. "
                "Para remarcar visita existente, use find_reschedule_slots."
            ),
            "input_schema": {
                "type": "object",
                "properties": {"date": {"type": "string", "description": "Data ISO (YYYY-MM-DD)."}},
                "required": ["date"],
            },
        },
        {
            "name": "get_next_available_slots",
            "description": (
                "OBRIGATÓRIO antes de agendar: retorna até 4 horários sugeridos (mesma lógica do botão da OS), "
                "alternando manhã e tarde, usando a duração real do serviço e a disponibilidade dos técnicos. "
                "Inclui technician_id e starts_at_local_iso em cada opção."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "days_ahead": {"type": "integer", "description": "Legado; ignorado."},
                    "max_days_with_slots": {"type": "integer", "description": "Legado; ignorado."},
                    "service_id": {
                        "type": "integer",
                        "description": "ID do serviço para calcular duração; se omitido, usa o primeiro serviço ativo.",
                    },
                },
                "required": [],
            },
        },
        {
            "name": "create_appointment",
            "description": (
                "Abre uma OS e cria o agendamento vinculado para o cliente do WhatsApp atual. "
                "Só use após o cliente escolher uma opção retornada por get_next_available_slots; "
                "repasse technician_id e starts_at_local exatamente como na opção. "
                "Se permitido na configuração, pode criar cadastro automaticamente quando não existir."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "starts_at_local": {"type": "string", "description": "YYYY-MM-DD HH:MM (horário local da empresa)."},
                    "service_id": {"type": "integer", "description": "ID do serviço (opcional). Se ausente, usa o primeiro serviço ativo."},
                    "technician_id": {"type": "integer", "description": "ID do técnico da opção escolhida (recomendado)."},
                    "duration_minutes": {"type": "integer"},
                    "service_summary": {"type": "string"},
                    "client_name": {"type": "string"},
                    "address_street": {"type": "string"},
                    "address_number": {"type": "string"},
                    "address_district": {"type": "string"},
                    "address_city": {"type": "string"},
                    "address_state": {"type": "string"},
                },
                "required": ["starts_at_local"],
            },
        },
        {
            "name": "find_reschedule_slots",
            "description": (
                "Propõe horários válidos para remarcar uma visita (appointment_id) em uma data alvo (YYYY-MM-DD), "
                "respeitando jornada e conflitos. Se a OS não tiver técnico, as opções trazem technician_id "
                "do encaixe — repasse-o em reschedule_appointment."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "appointment_id": {"type": "integer"},
                    "target_date": {"type": "string", "description": "YYYY-MM-DD"},
                },
                "required": ["appointment_id", "target_date"],
            },
        },
        {
            "name": "reschedule_appointment",
            "description": (
                "Aplica remarcação para um novo horário (new_starts_at_utc ISO, igual a uma opção de find_reschedule_slots). "
                "Se a visita não tinha técnico na OS, obrigatório informar technician_id da opção escolhida. "
                "Exige confirmação SIM do cliente após esta chamada — não executa antes."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "appointment_id": {"type": "integer"},
                    "new_starts_at_utc": {
                        "type": "string",
                        "description": "Início novo em ISO 8601 (UTC ou com offset), igual a uma opção retornada por find_reschedule_slots.",
                    },
                    "technician_id": {
                        "type": "integer",
                        "description": "Obrigatório se a OS não tinha técnico: mesmo technician_id da opção escolhida.",
                    },
                },
                "required": ["appointment_id", "new_starts_at_utc"],
            },
        },
        {
            "name": "cancel_appointment",
            "description": "Cancelar agendamento existente pelo id.",
            "input_schema": {
                "type": "object",
                "properties": {"appointment_id": {"type": "integer"}},
                "required": ["appointment_id"],
            },
        },
        {
            "name": "generate_payment_link",
            "description": "Gerar link de pagamento para o cliente.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "amount": {"type": "number"},
                    "description": {"type": "string"},
                },
                "required": ["amount", "description"],
            },
        },
        {
            "name": "finalize_service",
            "description": "Finaliza serviço, prepara NF e link de pagamento.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "appointment_id": {"type": "integer"},
                    "amount": {"type": "number"},
                    "description": {"type": "string"},
                },
                "required": ["amount", "description"],
            },
        },
    ]


def available_ai_tools(db: Session, *, tenant_id: int) -> list[dict[str, Any]]:
    policy = _load_tool_policy(db, tenant_id)
    return _filter_tool_definitions(policy)


def _execute_tool(
    db: Session,
    *,
    tenant_id: int,
    name: str,
    args: dict[str, Any],
    client_wa_digits: str | None = None,
) -> dict[str, Any]:
    policy = _load_tool_policy(db, tenant_id)
    if not _tool_name_allowed(policy, name):
        return _policy_denied_result()
    if name == "list_my_appointments":
        return _list_my_appointments_tool(db, tenant_id=tenant_id, client_wa_digits=client_wa_digits)
    if name == "get_my_client_profile":
        return _get_my_client_profile_tool(db, tenant_id=tenant_id, client_wa_digits=client_wa_digits)
    if name == "get_available_slots":
        return _get_available_slots(db, tenant_id=tenant_id, date_str=str(args.get("date")))
    if name == "get_next_available_slots":
        sid = args.get("service_id")
        return _get_next_available_slots_tool(
            db,
            tenant_id=tenant_id,
            days_ahead=int(args.get("days_ahead") or 5),
            max_days_with_slots=int(args.get("max_days_with_slots") or 3),
            service_id=(int(sid) if sid is not None else None),
        )
    if name == "create_appointment":
        tid_raw = args.get("technician_id")
        return _create_appointment_tool(
            db,
            tenant_id=tenant_id,
            client_wa_digits=client_wa_digits,
            starts_at_local=str(args.get("starts_at_local") or ""),
            service_id=(int(args["service_id"]) if args.get("service_id") is not None else None),
            technician_id=(int(tid_raw) if tid_raw is not None else None),
            duration_minutes=int(args.get("duration_minutes") or 60),
            service_summary=str(args.get("service_summary") or ""),
            client_name=str(args.get("client_name") or ""),
            address_street=str(args.get("address_street") or ""),
            address_number=str(args.get("address_number") or ""),
            address_district=str(args.get("address_district") or ""),
            address_city=str(args.get("address_city") or ""),
            address_state=str(args.get("address_state") or ""),
        )
    if name == "find_reschedule_slots":
        return _find_reschedule_slots_tool(
            db,
            tenant_id=tenant_id,
            client_wa_digits=client_wa_digits,
            appointment_id=int(args.get("appointment_id")),
            target_date=str(args.get("target_date")),
        )
    if name == "reschedule_appointment":
        tr = args.get("technician_id")
        return _reschedule_appointment_tool(
            db,
            tenant_id=tenant_id,
            client_wa_digits=client_wa_digits,
            appointment_id=int(args.get("appointment_id")),
            new_starts_at_utc=str(args.get("new_starts_at_utc")),
            technician_id=(int(tr) if tr is not None else None),
        )
    if name == "cancel_appointment":
        return _cancel_appointment(db, tenant_id=tenant_id, appointment_id=int(args.get("appointment_id")))
    if name == "generate_payment_link":
        return _generate_payment_link(
            amount=float(args.get("amount") or 0),
            description=str(args.get("description") or "Pagamento"),
        )
    if name == "finalize_service":
        return _finalize_service(
            db,
            tenant_id=tenant_id,
            appointment_id=(int(args["appointment_id"]) if args.get("appointment_id") is not None else None),
            amount=float(args.get("amount") or 0),
            description=str(args.get("description") or "Fechamento de serviço"),
        )
    return {"ok": False, "message": f"Tool não implementada: {name}"}


def execute_ai_tool_sandbox(
    db: Session,
    *,
    tenant_id: int,
    tool_name: str,
    arguments: dict[str, Any] | None = None,
) -> dict[str, Any]:
    name = (tool_name or "").strip()
    args = arguments or {}
    policy = _load_tool_policy(db, tenant_id)
    allowed = {item["name"] for item in _filter_tool_definitions(policy)}
    if name not in allowed:
        return {
            "ok": False,
            "message": f"Tool inválida para sandbox: {name}.",
            "allowed_tools": sorted(allowed),
        }
    try:
        return _execute_tool(db, tenant_id=tenant_id, name=name, args=args, client_wa_digits=None)
    except Exception as exc:
        return {"ok": False, "message": f"Falha na execução da tool: {type(exc).__name__}: {exc}"}


def _anthropic_request(body: dict[str, Any]) -> tuple[dict[str, Any] | None, bool]:
    payload = {
        "model": body["model"],
        "max_tokens": body.get("max_tokens", 700),
        "temperature": body.get("temperature", 0),
        "system": body["system"],
        "messages": body["messages"],
        "tools": body.get("tools", []),
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": CLAUDE_API_KEY,
            "anthropic-version": "2023-06-01",
        },
    )
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
        data = json.loads(raw) if raw.strip() else {}
        if isinstance(data, dict):
            return data, False
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            return None, True
        try:
            detail = exc.read().decode("utf-8")
        except Exception:
            detail = ""
        logger.warning(
            "Anthropic HTTPError status=%s detail=%s",
            exc.code,
            (detail[:400] if detail else "<sem corpo>"),
        )
    except Exception:
        logger.exception("Falha inesperada ao chamar Anthropic.")
        return None, False
    return None, False


def _call_claude_with_tools(
    db: Session,
    *,
    tenant_id: int,
    model: str,
    system_prompt: str,
    user_message: str,
    client_wa_digits: str | None,
    policy: ToolPolicy,
    conversation_messages: list[dict[str, str]] | None = None,
) -> tuple[str, list[dict[str, Any]], bool, tuple[str, dict[str, Any]] | None]:
    """Retorna (texto, tools_usadas, chave_inválida, pendência_tool_sensível)."""
    tools_used: list[dict[str, Any]] = []
    messages: list[dict[str, Any]] = []
    for msg in conversation_messages or []:
        role = str(msg.get("role") or "").strip()
        content = str(msg.get("content") or "").strip()
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_message})
    tools = _filter_tool_definitions(policy)
    for _ in range(5):
        data, key_invalid = _anthropic_request(
            {
                "model": model,
                "system": system_prompt,
                "messages": messages,
                "tools": tools,
                "temperature": 0,
                "max_tokens": 1400,
            }
        )
        if key_invalid:
            return "", [], True, None
        if not data:
            return "", tools_used, False, None
        content = data.get("content")
        if not isinstance(content, list):
            return "", tools_used, False, None
        text_parts: list[str] = []
        tool_results: list[dict[str, Any]] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "tool_use":
                tool_name = str(block.get("name") or "").strip()
                if _defer_sensitive_confirmation(policy, tool_name):
                    tool_input = block.get("input") if isinstance(block.get("input"), dict) else {}
                    return "", tools_used, False, (tool_name, tool_input)
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text":
                text = str(block.get("text") or "").strip()
                if text:
                    text_parts.append(text)
            if block.get("type") == "tool_use":
                tool_name = str(block.get("name") or "").strip()
                tool_input = block.get("input") if isinstance(block.get("input"), dict) else {}
                tool_id = str(block.get("id") or "").strip()
                result = _execute_tool(
                    db,
                    tenant_id=tenant_id,
                    name=tool_name,
                    args=tool_input,
                    client_wa_digits=client_wa_digits,
                )
                tools_used.append({"name": tool_name, "input": tool_input, "output": result})
                if tool_id:
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": json.dumps(result, ensure_ascii=False),
                        }
                    )
        if tool_results:
            messages.append({"role": "assistant", "content": content})
            messages.append({"role": "user", "content": tool_results})
            continue
        if text_parts:
            return "\n".join(text_parts).strip(), tools_used, False, None
    return "", tools_used, False, None


def generate_ai_response(
    db: Session,
    *,
    message_text: str,
    tenant_id: int,
    client_name: str | None = None,
    client_whatsapp: str | None = None,
) -> dict[str, str]:
    if not (message_text or "").strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Mensagem vazia.")
    if not _is_ai_enabled(db, tenant_id):
        # Sem texto: o webhook WhatsApp não envia mensagem — assistente permanece “desligado”.
        return {"intent": "ai_disabled", "reply_text": ""}
    tool_policy = _load_tool_policy(db, tenant_id)
    context = CompanyContext.from_db(db, tenant_id)
    wa_key = _normalize_client_whatsapp_key(client_whatsapp)
    client_identified = bool(wa_key and _resolve_client_id_for_wa(db, tenant_id, wa_key) is not None)
    system_prompt = _build_system_prompt(
        context,
        client_identified=client_identified,
        client_display_name=client_name,
    )
    wa_action_ctx = _whatsapp_recent_schedule_action_context(db, tenant_id=tenant_id, client_whatsapp_key=wa_key)
    if wa_action_ctx:
        system_prompt = f"{system_prompt}\n\n{wa_action_ctx}"
    logger.debug("AI system prompt tenant_id=%s (len=%s)", tenant_id, len(system_prompt))
    model = context.model_slug or CLAUDE_MODEL
    recent_messages = _recent_conversation_messages(
        db,
        tenant_id=tenant_id,
        client_whatsapp=wa_key,
    )

    if wa_key:
        pending = _get_pending_confirmation(db, tenant_id=tenant_id, client_whatsapp=wa_key)
        if pending is not None and pending.expires_at < datetime.now(timezone.utc):
            _clear_pending_confirmation(db, tenant_id=tenant_id, client_whatsapp=wa_key)
            pending = None
        if pending is not None:
            if _user_message_denies(message_text):
                _clear_pending_confirmation(db, tenant_id=tenant_id, client_whatsapp=wa_key)
                reply = "Tudo bem, não farei essa alteração. Se precisar de outra coisa, é só dizer."
                _save_chat_history(
                    db,
                    tenant_id=tenant_id,
                    client_whatsapp=client_whatsapp,
                    user_message=message_text,
                    assistant_response=reply,
                    used_model=model,
                    used_tools=[],
                    system_prompt_xml=system_prompt,
                    is_mock=False,
                )
                return {"intent": "sensitive_tool_declined", "reply_text": reply}
            if _user_message_confirms(message_text):
                try:
                    args = json.loads(pending.arguments_json)
                    if not isinstance(args, dict):
                        args = {}
                except json.JSONDecodeError:
                    args = {}
                tool_name = pending.tool_name
                result = _execute_tool(
                    db,
                    tenant_id=tenant_id,
                    name=tool_name,
                    args=args,
                    client_wa_digits=wa_key,
                )
                _clear_pending_confirmation(db, tenant_id=tenant_id, client_whatsapp=wa_key)
                reply = _reply_after_confirmed_tool(db, tenant_id, tool_name, result)
                _save_chat_history(
                    db,
                    tenant_id=tenant_id,
                    client_whatsapp=client_whatsapp,
                    user_message=message_text,
                    assistant_response=reply,
                    used_model=model,
                    used_tools=[{"name": tool_name, "input": args, "output": result, "after_user_confirm": True}],
                    system_prompt_xml=system_prompt,
                    is_mock=False,
                )
                return {"intent": "sensitive_tool_executed", "reply_text": reply}
            reminder = (
                f"{pending.confirmation_prompt}\n\n"
                "(Ainda aguardando: responda *SIM* para confirmar ou *NÃO* para cancelar.)"
            )
            _save_chat_history(
                db,
                tenant_id=tenant_id,
                client_whatsapp=client_whatsapp,
                user_message=message_text,
                assistant_response=reminder,
                used_model=model,
                used_tools=[],
                system_prompt_xml=system_prompt,
                is_mock=False,
            )
            return {"intent": "awaiting_sensitive_confirmation", "reply_text": reminder}

    # Proteção anti-hallucination: se o cliente escolher "opção N" após lista de horários,
    # efetiva o agendamento de forma determinística no backend.
    option_choice = _extract_option_choice(message_text)
    if option_choice is not None and context.allow_direct_schedule and wa_key:
        picked = _last_booking_option_from_history(
            db,
            tenant_id=tenant_id,
            client_whatsapp=wa_key,
            option_number=option_choice,
        )
        if picked is not None:
            result = _create_appointment_tool(
                db,
                tenant_id=tenant_id,
                client_wa_digits=wa_key,
                starts_at_local=str(picked.get("starts_at_local_iso") or ""),
                service_id=(int(picked["service_id"]) if picked.get("service_id") is not None else None),
                technician_id=(int(picked["technician_id"]) if picked.get("technician_id") is not None else None),
                duration_minutes=int(picked.get("duration_minutes") or 60),
                client_name=client_name,
            )
            if bool(result.get("ok")):
                appt_id = result.get("appointment_id")
                so_id = result.get("service_order_id")
                starts_local = str(result.get("starts_local") or "")
                reply = (
                    "Perfeito! Seu agendamento foi confirmado com sucesso.\n\n"
                    f"Data e horário: {starts_local}\n"
                    f"Agendamento #{appt_id} | OS #{so_id}"
                )
            else:
                reply = str(result.get("message") or "Não consegui concluir o agendamento agora.")
            _save_chat_history(
                db,
                tenant_id=tenant_id,
                client_whatsapp=client_whatsapp,
                user_message=message_text,
                assistant_response=reply,
                used_model=model,
                used_tools=[{"name": "create_appointment", "input": {"option": option_choice}, "output": result}],
                system_prompt_xml=system_prompt,
                is_mock=False,
            )
            return {"intent": "appointment_from_option", "reply_text": reply}

    if not CLAUDE_API_KEY:
        mocked = _fallback_local_reply(
            db,
            tenant_id=tenant_id,
            message_text=message_text,
            client_name=client_name,
            context=context,
        )
        _save_chat_history(
            db,
            tenant_id=tenant_id,
            client_whatsapp=client_whatsapp,
            user_message=message_text,
            assistant_response=mocked["reply_text"],
            used_model=context.model_slug,
            used_tools=[],
            system_prompt_xml=system_prompt,
            is_mock=True,
        )
        return mocked

    selected_model = model
    answer = ""
    tools_used: list[dict[str, Any]] = []
    invalid_key = False
    sensitive: tuple[str, dict[str, Any]] | None = None
    for candidate_model in _candidate_models(model):
        selected_model = candidate_model
        answer, tools_used, invalid_key, sensitive = _call_claude_with_tools(
            db,
            tenant_id=tenant_id,
            model=candidate_model,
            system_prompt=system_prompt,
            user_message=message_text,
            client_wa_digits=wa_key,
            policy=tool_policy,
            conversation_messages=recent_messages,
        )
        if invalid_key or sensitive is not None or answer:
            break
        logger.warning(
            "Modelo Claude sem resposta útil (tenant_id=%s, model=%s). Tentando próximo fallback.",
            tenant_id,
            candidate_model,
        )
    if sensitive is not None:
        sens_name, sens_args = sensitive
        if not wa_key:
            reply = (
                "Para sua segurança, preciso confirmar essa ação em um canal identificado (WhatsApp). "
                "Abra o atendimento pelo número cadastrado ou peça ao painel para informar o telefone da conversa."
            )
            _save_chat_history(
                db,
                tenant_id=tenant_id,
                client_whatsapp=client_whatsapp,
                user_message=message_text,
                assistant_response=reply,
                used_model=selected_model,
                used_tools=[{"name": sens_name, "input": sens_args, "deferred": True, "reason": "missing_client_whatsapp"}],
                system_prompt_xml=system_prompt,
                is_mock=False,
            )
            return {"intent": "sensitive_tool_needs_channel", "reply_text": reply}
        confirmation = _build_sensitive_confirmation_prompt(db, tenant_id=tenant_id, tool_name=sens_name, arguments=sens_args)
        _store_pending_confirmation(
            db,
            tenant_id=tenant_id,
            client_whatsapp=wa_key,
            tool_name=sens_name,
            arguments=sens_args,
            confirmation_prompt=confirmation,
        )
        _save_chat_history(
            db,
            tenant_id=tenant_id,
            client_whatsapp=client_whatsapp,
            user_message=message_text,
            assistant_response=confirmation,
            used_model=selected_model,
            used_tools=[{"name": sens_name, "input": sens_args, "deferred": True, "awaiting_confirm": True}],
            system_prompt_xml=system_prompt,
            is_mock=False,
        )
        return {"intent": "awaiting_sensitive_confirmation", "reply_text": confirmation}

    if invalid_key:
        mocked = _fallback_local_reply(
            db,
            tenant_id=tenant_id,
            message_text=message_text,
            client_name=client_name,
            context=context,
        )
        _save_chat_history(
            db,
            tenant_id=tenant_id,
            client_whatsapp=client_whatsapp,
            user_message=message_text,
            assistant_response=mocked["reply_text"],
            used_model=selected_model,
            used_tools=[],
            system_prompt_xml=system_prompt,
            is_mock=True,
        )
        return mocked
    if answer:
        _save_chat_history(
            db,
            tenant_id=tenant_id,
            client_whatsapp=client_whatsapp,
            user_message=message_text,
            assistant_response=answer,
            used_model=selected_model,
            used_tools=tools_used,
            system_prompt_xml=system_prompt,
            is_mock=False,
        )
        return {"intent": "ai_response", "reply_text": answer}
    logger.warning(
        "Claude retornou texto vazio (tenant_id=%s, model=%s); usando resposta local. tools_used=%s",
        tenant_id,
        selected_model,
        len(tools_used),
    )
    mocked = _fallback_local_reply(
        db,
        tenant_id=tenant_id,
        message_text=message_text,
        client_name=client_name,
        context=context,
    )
    _save_chat_history(
        db,
        tenant_id=tenant_id,
        client_whatsapp=client_whatsapp,
        user_message=message_text,
        assistant_response=mocked["reply_text"],
        used_model=selected_model,
        used_tools=tools_used,
        system_prompt_xml=system_prompt,
        is_mock=True,
    )
    return mocked
