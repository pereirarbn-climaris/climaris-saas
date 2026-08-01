"""Gestão preventiva por equipamento + serviço (prazos persistidos na ficha)."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.equipment_preventive_reminder import equipment_is_preventive_reminder_only
from app.equipment_preventive_rules import compute_next_due_datetime, get_tenant_equipment
from app.preventive_maintenance import (
    client_site_header_label,
    preventive_whatsapp_destination,
    tenant_local_date,
)
from app.services.service_preventive_config import preventive_config_from_service
from models import (
    Client,
    ClientSite,
    Equipment,
    EquipmentServicePreventiveOverride,
    EquipmentServicePreventiveSchedule,
    HistoricoServico,
    OrderStatus,
    Service,
    ServiceOrder,
    ServiceOrderEquipmentService,
    Tenant,
    WhatsappMessageJob,
    WhatsappMessageStatus,
)


def _order_completion_at(order: ServiceOrder) -> datetime | None:
    for raw in (order.closed_at, order.completed_at, order.finished_at, order.stock_consumed_at):
        if raw is not None:
            return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    sched = order.schedule
    if sched is not None and sched.ends_at is not None:
        ends = sched.ends_at
        return ends if ends.tzinfo else ends.replace(tzinfo=timezone.utc)
    if sched is not None and sched.starts_at is not None:
        starts = sched.starts_at
        return starts if starts.tzinfo else starts.replace(tzinfo=timezone.utc)
    return None


def _compute_next_due(last_performed: datetime, interval_value: int, interval_type: str) -> datetime:
    value = max(1, int(interval_value))
    kind = str(interval_type).strip().lower()
    if kind == "years":
        return compute_next_due_datetime(
            last_performed,
            interval_value=value * 12,
            interval_type="months",
        )
    if kind == "days":
        return compute_next_due_datetime(
            last_performed,
            interval_value=value,
            interval_type="days",
        )
    return compute_next_due_datetime(
        last_performed,
        interval_value=value,
        interval_type="months",
    )


def _service_default_interval(service: Service) -> tuple[int, str]:
    cfg = preventive_config_from_service(service)
    if not cfg.get("preventive_enabled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Serviço sem gestão preventiva ativa.",
        )
    interval_type = str(cfg.get("preventive_interval_type") or "months")
    interval_value = int(cfg.get("preventive_interval_value") or 6)
    return interval_value, interval_type


def _load_overrides(
    db: Session,
    *,
    equipment_id: int,
    service_ids: list[int] | None = None,
) -> dict[int, EquipmentServicePreventiveOverride]:
    query = select(EquipmentServicePreventiveOverride).where(
        EquipmentServicePreventiveOverride.equipment_id == equipment_id,
        EquipmentServicePreventiveOverride.is_active.is_(True),
    )
    if service_ids:
        query = query.where(EquipmentServicePreventiveOverride.service_id.in_(service_ids))
    return {row.service_id: row for row in db.execute(query).scalars().all()}


def _effective_interval(
    service: Service,
    override: EquipmentServicePreventiveOverride | None,
) -> tuple[int, str]:
    default_value, default_type = _service_default_interval(service)
    if override and override.is_active:
        return override.interval_value, override.interval_type
    return default_value, default_type


def _schedule_row_to_dict(
    schedule: EquipmentServicePreventiveSchedule,
    *,
    service: Service,
    override: EquipmentServicePreventiveOverride | None,
) -> dict[str, Any]:
    default_value, default_type = _service_default_interval(service)
    return {
        "service_id": schedule.service_id,
        "service_name": service.name,
        "service_description": service.description,
        "default_interval_value": default_value,
        "default_interval_type": default_type,
        "override_interval_value": override.interval_value if override else None,
        "override_interval_type": override.interval_type if override else None,
        "effective_interval_value": schedule.interval_value,
        "effective_interval_type": schedule.interval_type,
        "last_performed_at": schedule.last_performed_at,
        "next_due_at": schedule.next_due_at,
        "last_service_order_id": schedule.last_service_order_id,
        "pending_service_order_id": None,
        "awaiting_completion": False,
        "has_override": override is not None and override.is_active,
        "is_active": bool(schedule.is_active),
    }


def _get_or_create_schedule(
    db: Session,
    *,
    equipment_id: int,
    service: Service,
    override: EquipmentServicePreventiveOverride | None = None,
) -> EquipmentServicePreventiveSchedule:
    schedule = db.execute(
        select(EquipmentServicePreventiveSchedule).where(
            EquipmentServicePreventiveSchedule.equipment_id == equipment_id,
            EquipmentServicePreventiveSchedule.service_id == service.id,
        )
    ).scalar_one_or_none()
    effective_value, effective_type = _effective_interval(service, override)
    if schedule is None:
        schedule = EquipmentServicePreventiveSchedule(
            equipment_id=equipment_id,
            service_id=service.id,
            interval_value=effective_value,
            interval_type=effective_type,
            is_active=True,
        )
        db.add(schedule)
        db.flush()
        return schedule

    schedule.interval_value = effective_value
    schedule.interval_type = effective_type
    schedule.is_active = True
    if schedule.last_performed_at is not None:
        schedule.next_due_at = _compute_next_due(
            schedule.last_performed_at,
            schedule.interval_value,
            schedule.interval_type,
        )
    return schedule


def _performed_date_to_utc(performed_date: date) -> datetime:
    return datetime(
        performed_date.year,
        performed_date.month,
        performed_date.day,
        12,
        0,
        0,
        tzinfo=timezone.utc,
    )


def create_temporary_equipment_for_preventive(
    db: Session,
    *,
    tenant_id: int,
    client_id: int,
    label: str,
) -> Equipment:
    """Equipamento mínimo para lembrete preventivo de clientes pré-sistema."""
    client = db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")
    ident = label.strip()[:120] or "Aparelho (cadastro temporário)"
    equipment = Equipment(
        client_id=client_id,
        identificacao=ident,
        ativo=True,
        preventive_reminder_only=True,
        public_token=str(uuid4()),
    )
    db.add(equipment)
    db.flush()
    return equipment


def record_manual_preventive_schedule(
    db: Session,
    *,
    tenant_id: int,
    equipment_id: int,
    service_id: int,
    performed_date: date,
    service_order_id: int | None = None,
    message_template_kind: str | None = None,
) -> EquipmentServicePreventiveSchedule:
    """Registra última realização manual na gestão preventiva da ficha (aparece na listagem mensal)."""
    get_tenant_equipment(db, tenant_id=tenant_id, equipment_id=equipment_id)
    service = db.execute(
        select(Service).where(Service.id == service_id, Service.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Serviço não encontrado.")

    cfg = preventive_config_from_service(service)
    if not cfg.get("preventive_enabled") and service.periodicidade_meses is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Serviço sem gestão preventiva ativa (ative em Serviços ou defina periodicidade).",
        )

    override = db.execute(
        select(EquipmentServicePreventiveOverride).where(
            EquipmentServicePreventiveOverride.equipment_id == equipment_id,
            EquipmentServicePreventiveOverride.service_id == service_id,
            EquipmentServicePreventiveOverride.is_active.is_(True),
        )
    ).scalar_one_or_none()

    performed_at = _performed_date_to_utc(performed_date)
    schedule = _get_or_create_schedule(
        db,
        equipment_id=equipment_id,
        service=service,
        override=override,
    )
    schedule.last_performed_at = performed_at
    schedule.last_service_order_id = service_order_id
    schedule.next_due_at = _compute_next_due(
        performed_at,
        schedule.interval_value,
        schedule.interval_type,
    )
    schedule.is_active = True
    if message_template_kind is not None:
        kind = str(message_template_kind).strip().lower()[:16]
        schedule.message_template_kind = kind or None
    db.add(schedule)
    db.flush()
    return schedule


def sync_service_preventive_schedules_on_order_closure(
    db: Session,
    *,
    order: ServiceOrder,
    closed_at: datetime,
) -> list[EquipmentServicePreventiveSchedule]:
    """Atualiza prazos persistidos na ficha quando uma OS é concluída."""
    if closed_at.tzinfo is None:
        closed_at = closed_at.replace(tzinfo=timezone.utc)

    updated: list[EquipmentServicePreventiveSchedule] = []
    seen: set[tuple[int, int]] = set()

    for item in order.service_items:
        if item.equipment_id is None:
            continue
        service = item.service
        if service is None or not service.preventive_enabled:
            continue
        key = (int(item.equipment_id), int(service.id))
        if key in seen:
            continue
        seen.add(key)

        equipment_id = int(item.equipment_id)
        override = db.execute(
            select(EquipmentServicePreventiveOverride).where(
                EquipmentServicePreventiveOverride.equipment_id == equipment_id,
                EquipmentServicePreventiveOverride.service_id == service.id,
                EquipmentServicePreventiveOverride.is_active.is_(True),
            )
        ).scalar_one_or_none()

        schedule = _get_or_create_schedule(
            db,
            equipment_id=equipment_id,
            service=service,
            override=override,
        )
        schedule.last_performed_at = closed_at
        schedule.last_service_order_id = order.id
        schedule.next_due_at = _compute_next_due(
            closed_at,
            schedule.interval_value,
            schedule.interval_type,
        )
        db.add(schedule)
        updated.append(schedule)

    if updated:
        db.flush()
    return updated


def _collect_last_performed_by_service(
    db: Session,
    *,
    tenant_id: int,
    client_id: int,
    equipment_id: int,
) -> dict[int, dict[str, Any]]:
    """Usado apenas para backfill inicial a partir de OS concluídas."""
    orders = (
        db.execute(
            select(ServiceOrder)
            .where(
                ServiceOrder.tenant_id == tenant_id,
                ServiceOrder.client_id == client_id,
                ServiceOrder.status == OrderStatus.DONE,
            )
            .options(
                joinedload(ServiceOrder.service_items).joinedload(ServiceOrderEquipmentService.service),
                joinedload(ServiceOrder.schedules),
            )
        )
        .unique()
        .scalars()
        .all()
    )

    by_service: dict[int, dict[str, Any]] = {}
    for order in orders:
        completed_at = _order_completion_at(order)
        if completed_at is None:
            continue
        for item in order.service_items:
            if item.equipment_id != equipment_id:
                continue
            service = item.service
            if service is None or not service.preventive_enabled:
                continue
            prev = by_service.get(service.id)
            if prev is None or completed_at > prev["last_performed_at"]:
                by_service[service.id] = {
                    "service": service,
                    "last_performed_at": completed_at,
                    "last_service_order_id": order.id,
                }
    return by_service


def backfill_service_preventive_schedules_for_tenant(
    db: Session,
    *,
    tenant_id: int,
) -> int:
    """Importa prazos a partir de OS concluídas quando ainda não há registro persistido."""
    equipments = (
        db.execute(
            select(Equipment)
            .join(Client, Client.id == Equipment.client_id)
            .where(Client.tenant_id == tenant_id, Equipment.ativo.is_(True))
        )
        .scalars()
        .all()
    )
    created = 0
    for equipment in equipments:
        performed = _collect_last_performed_by_service(
            db,
            tenant_id=tenant_id,
            client_id=equipment.client_id,
            equipment_id=equipment.id,
        )
        if not performed:
            continue
        overrides = _load_overrides(db, equipment_id=equipment.id, service_ids=list(performed.keys()))
        for service_id, row in performed.items():
            exists = db.execute(
                select(EquipmentServicePreventiveSchedule.id).where(
                    EquipmentServicePreventiveSchedule.equipment_id == equipment.id,
                    EquipmentServicePreventiveSchedule.service_id == service_id,
                )
            ).scalar_one_or_none()
            if exists is not None:
                continue
            service: Service = row["service"]
            override = overrides.get(service_id)
            last_at: datetime = row["last_performed_at"]
            effective_value, effective_type = _effective_interval(service, override)
            schedule = EquipmentServicePreventiveSchedule(
                equipment_id=equipment.id,
                service_id=service_id,
                interval_value=effective_value,
                interval_type=effective_type,
                last_performed_at=last_at,
                last_service_order_id=row["last_service_order_id"],
                next_due_at=_compute_next_due(last_at, effective_value, effective_type),
                is_active=True,
            )
            db.add(schedule)
            created += 1
    if created:
        db.commit()
    return created


def _pending_schedules_from_open_orders(
    db: Session,
    *,
    tenant_id: int,
    equipment: Equipment,
    existing_service_ids: set[int],
) -> list[dict[str, Any]]:
    """Serviços preventivos em OS abertas vinculadas ao equipamento (ainda sem prazo registrado)."""
    orders = (
        db.execute(
            select(ServiceOrder)
            .where(
                ServiceOrder.tenant_id == tenant_id,
                ServiceOrder.client_id == equipment.client_id,
                ServiceOrder.status.in_(
                    (OrderStatus.SCHEDULED, OrderStatus.APPROVED, OrderStatus.IN_PROGRESS),
                ),
            )
            .options(
                joinedload(ServiceOrder.service_items).joinedload(ServiceOrderEquipmentService.service),
            )
        )
        .unique()
        .scalars()
        .all()
    )

    overrides = _load_overrides(db, equipment_id=equipment.id)
    pending: dict[int, dict[str, Any]] = {}
    for order in orders:
        for item in order.service_items:
            if item.equipment_id != equipment.id:
                continue
            service = item.service
            if service is None or not service.preventive_enabled:
                continue
            if service.id in existing_service_ids or service.id in pending:
                continue
            override = overrides.get(service.id)
            default_value, default_type = _service_default_interval(service)
            effective_value, effective_type = _effective_interval(service, override)
            pending[service.id] = {
                "service_id": service.id,
                "service_name": service.name,
                "service_description": service.description,
                "default_interval_value": default_value,
                "default_interval_type": default_type,
                "override_interval_value": override.interval_value if override else None,
                "override_interval_type": override.interval_type if override else None,
                "effective_interval_value": effective_value,
                "effective_interval_type": effective_type,
                "last_performed_at": None,
                "next_due_at": None,
                "last_service_order_id": None,
                "pending_service_order_id": order.id,
                "awaiting_completion": True,
                "has_override": override is not None and override.is_active,
                "is_active": True,
            }
    return list(pending.values())


def list_equipment_service_preventive_schedules(
    db: Session,
    *,
    tenant_id: int,
    equipment_id: int,
) -> list[dict[str, Any]]:
    equipment = get_tenant_equipment(db, tenant_id=tenant_id, equipment_id=equipment_id)
    backfill_service_preventive_schedules_for_tenant(db, tenant_id=tenant_id)

    schedules = (
        db.execute(
            select(EquipmentServicePreventiveSchedule)
            .where(
                EquipmentServicePreventiveSchedule.equipment_id == equipment_id,
                EquipmentServicePreventiveSchedule.next_due_at.isnot(None),
            )
            .options(joinedload(EquipmentServicePreventiveSchedule.service))
        )
        .scalars()
        .all()
    )
    if not schedules:
        return []

    service_ids = [row.service_id for row in schedules]
    overrides = _load_overrides(db, equipment_id=equipment_id, service_ids=service_ids)

    out: list[dict[str, Any]] = []
    for schedule in schedules:
        service = schedule.service
        if service is None or not service.preventive_enabled:
            continue
        override = overrides.get(schedule.service_id)
        out.append(_schedule_row_to_dict(schedule, service=service, override=override))

    existing_service_ids = {row["service_id"] for row in out}
    out.extend(
        _pending_schedules_from_open_orders(
            db,
            tenant_id=tenant_id,
            equipment=equipment,
            existing_service_ids=existing_service_ids,
        )
    )

    out.sort(key=lambda item: item["service_name"].lower())
    return out


def set_equipment_service_preventive_active(
    db: Session,
    *,
    tenant_id: int,
    equipment_id: int,
    service_id: int,
    is_active: bool,
) -> dict[str, Any]:
    get_tenant_equipment(db, tenant_id=tenant_id, equipment_id=equipment_id)
    service = db.execute(
        select(Service).where(Service.id == service_id, Service.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Serviço não encontrado.")
    if not service.preventive_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ative a gestão preventiva no cadastro do serviço antes de usar este controle.",
        )

    override = db.execute(
        select(EquipmentServicePreventiveOverride).where(
            EquipmentServicePreventiveOverride.equipment_id == equipment_id,
            EquipmentServicePreventiveOverride.service_id == service_id,
            EquipmentServicePreventiveOverride.is_active.is_(True),
        )
    ).scalar_one_or_none()
    schedule = db.execute(
        select(EquipmentServicePreventiveSchedule).where(
            EquipmentServicePreventiveSchedule.equipment_id == equipment_id,
            EquipmentServicePreventiveSchedule.service_id == service_id,
        )
    ).scalar_one_or_none()
    if schedule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agenda preventiva não encontrada. Conclua uma OS deste serviço para habilitar o controle.",
        )

    schedule.is_active = bool(is_active)
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return _schedule_row_to_dict(schedule, service=service, override=override)


def upsert_equipment_service_preventive_override(
    db: Session,
    *,
    tenant_id: int,
    equipment_id: int,
    service_id: int,
    interval_value: int,
    interval_type: str,
) -> dict[str, Any]:
    equipment = get_tenant_equipment(db, tenant_id=tenant_id, equipment_id=equipment_id)
    del equipment
    service = db.execute(
        select(Service).where(Service.id == service_id, Service.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Serviço não encontrado.")
    if not service.preventive_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ative a gestão preventiva no cadastro do serviço antes de customizar.",
        )

    kind = str(interval_type).strip().lower()
    if kind not in ("days", "months", "years"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de intervalo inválido.")
    value = max(1, int(interval_value))
    if kind in ("months", "years") and value > 12:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Para meses ou anos, use valor entre 1 e 12.")

    override = db.execute(
        select(EquipmentServicePreventiveOverride).where(
            EquipmentServicePreventiveOverride.equipment_id == equipment_id,
            EquipmentServicePreventiveOverride.service_id == service_id,
        )
    ).scalar_one_or_none()

    if override is None:
        override = EquipmentServicePreventiveOverride(
            equipment_id=equipment_id,
            service_id=service_id,
            interval_value=value,
            interval_type=kind,
            is_active=True,
        )
        db.add(override)
    else:
        override.interval_value = value
        override.interval_type = kind
        override.is_active = True

    schedule = _get_or_create_schedule(
        db,
        equipment_id=equipment_id,
        service=service,
        override=override,
    )
    db.commit()
    db.refresh(schedule)

    return _schedule_row_to_dict(schedule, service=service, override=override)


def reset_equipment_service_preventive_override(
    db: Session,
    *,
    tenant_id: int,
    equipment_id: int,
    service_id: int,
) -> dict[str, Any]:
    get_tenant_equipment(db, tenant_id=tenant_id, equipment_id=equipment_id)
    service = db.execute(select(Service).where(Service.id == service_id)).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Serviço não encontrado.")

    override = db.execute(
        select(EquipmentServicePreventiveOverride).where(
            EquipmentServicePreventiveOverride.equipment_id == equipment_id,
            EquipmentServicePreventiveOverride.service_id == service_id,
        )
    ).scalar_one_or_none()
    if override is not None:
        db.delete(override)

    schedule = db.execute(
        select(EquipmentServicePreventiveSchedule).where(
            EquipmentServicePreventiveSchedule.equipment_id == equipment_id,
            EquipmentServicePreventiveSchedule.service_id == service_id,
        )
    ).scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agenda não encontrada.")

    default_value, default_type = _service_default_interval(service)
    schedule.interval_value = default_value
    schedule.interval_type = default_type
    if schedule.last_performed_at is not None:
        schedule.next_due_at = _compute_next_due(
            schedule.last_performed_at,
            schedule.interval_value,
            schedule.interval_type,
        )
    db.commit()
    db.refresh(schedule)
    return _schedule_row_to_dict(schedule, service=service, override=None)


def _interval_to_periodicidade_meses(interval_value: int, interval_type: str) -> int:
    kind = str(interval_type).strip().lower()
    value = max(1, int(interval_value))
    if kind == "years":
        return value * 12
    if kind == "days":
        return max(1, round(value / 30))
    return value


def _schedule_to_preventive_item(
    *,
    equipment: Equipment,
    client: Client,
    schedule: EquipmentServicePreventiveSchedule,
    service: Service,
    today: date,
    site: ClientSite | None = None,
) -> dict[str, Any]:
    next_due = schedule.next_due_at
    if next_due is None:
        raise ValueError("schedule without next_due_at")
    if next_due.tzinfo is None:
        next_due = next_due.replace(tzinfo=timezone.utc)
    due_date = next_due.date()

    last_at = schedule.last_performed_at
    if last_at is None:
        last_date = due_date
    else:
        if last_at.tzinfo is None:
            last_at = last_at.replace(tzinfo=timezone.utc)
        last_date = last_at.date()

    resolved_site = site
    if resolved_site is None and getattr(equipment, "client_site", None) is not None:
        resolved_site = equipment.client_site
    ok_wa, dest = preventive_whatsapp_destination(client, resolved_site)
    ident = (equipment.identificacao or equipment.local_instalacao or equipment.ambiente_nome or "").strip()
    tipo = equipment.tipo.value if equipment.tipo is not None else None
    site_id = int(resolved_site.id) if resolved_site is not None else (
        int(equipment.client_site_id) if equipment.client_site_id else None
    )
    site_name = (resolved_site.name or "").strip() if resolved_site is not None else None
    site_type = (resolved_site.site_type or "").strip().lower() if resolved_site is not None else None
    site_label = client_site_header_label(resolved_site)

    return {
        "historico_servico_id": 0,
        "rule_id": None,
        "preventive_schedule_id": int(schedule.id),
        "is_manual_reminder": _schedule_is_manual_reminder(schedule),
        "client_id": client.id,
        "client_name": client.name,
        "client_site_id": site_id,
        "client_site_name": site_name or None,
        "client_site_type": site_type or None,
        "client_site_label": site_label,
        "service_id": int(service.id),
        "service_name": str(service.name),
        "equipment_id": equipment.id,
        "equipment_identificacao": ident or None,
        "equipment_tipo": tipo,
        "interval_value": int(schedule.interval_value),
        "interval_type": str(schedule.interval_type),
        "periodicidade_meses": _interval_to_periodicidade_meses(
            int(schedule.interval_value),
            str(schedule.interval_type),
        ),
        "data_ultima_realizacao": last_date,
        "data_proximo_vencimento": due_date,
        "dias_ate_vencimento": (due_date - today).days,
        "whatsapp_valido": ok_wa,
        "whatsapp_destino": dest,
        "ultimo_whatsapp_status": None,
        "ultimo_whatsapp_erro": None,
        "ultimo_whatsapp_em": None,
        "message_template_kind": (
            str(schedule.message_template_kind).strip().lower()
            if schedule.message_template_kind
            else None
        ),
    }


def _schedule_is_manual_reminder(schedule: EquipmentServicePreventiveSchedule) -> bool:
    """Lembrete cadastrado manualmente (Nova Preventiva), sem vínculo com OS concluída."""
    return schedule.last_service_order_id is None and schedule.last_performed_at is not None


def _load_manual_schedule(
    db: Session,
    *,
    tenant_id: int,
    schedule_id: int,
) -> tuple[EquipmentServicePreventiveSchedule, Equipment, Client, Service]:
    row = db.execute(
        select(EquipmentServicePreventiveSchedule, Equipment, Client, Service)
        .join(Equipment, Equipment.id == EquipmentServicePreventiveSchedule.equipment_id)
        .join(Client, Client.id == Equipment.client_id)
        .join(Service, Service.id == EquipmentServicePreventiveSchedule.service_id)
        .where(
            EquipmentServicePreventiveSchedule.id == schedule_id,
            Client.tenant_id == tenant_id,
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lembrete não encontrado.")
    schedule, equipment, client, service = row
    if not _schedule_is_manual_reminder(schedule):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Este registro foi gerado por ordem de serviço e não pode ser editado aqui.",
        )
    return schedule, equipment, client, service


def _performed_date_from_schedule(schedule: EquipmentServicePreventiveSchedule) -> date | None:
    last_at = schedule.last_performed_at
    if last_at is None:
        return None
    if last_at.tzinfo is None:
        last_at = last_at.replace(tzinfo=timezone.utc)
    return last_at.date()


def _find_manual_historico_for_schedule(
    db: Session,
    *,
    tenant_id: int,
    client_id: int,
    service_id: int,
    performed_date: date | None,
) -> HistoricoServico | None:
    if performed_date is None:
        return None
    return db.execute(
        select(HistoricoServico)
        .where(
            HistoricoServico.tenant_id == tenant_id,
            HistoricoServico.client_id == client_id,
            HistoricoServico.service_id == service_id,
            HistoricoServico.service_order_id.is_(None),
            HistoricoServico.data_realizacao == performed_date,
        )
        .order_by(HistoricoServico.id.desc())
        .limit(1)
    ).scalar_one_or_none()


def _cancel_queued_preventive_jobs_for_historico(
    db: Session,
    *,
    tenant_id: int,
    historico_id: int,
) -> None:
    jobs = db.execute(
        select(WhatsappMessageJob).where(
            WhatsappMessageJob.tenant_id == tenant_id,
            WhatsappMessageJob.reference_type == "preventive_historico",
            WhatsappMessageJob.reference_id == historico_id,
            WhatsappMessageJob.status == WhatsappMessageStatus.QUEUED,
        )
    ).scalars().all()
    for job in jobs:
        job.status = WhatsappMessageStatus.FAILED
        job.failed_at = datetime.now(timezone.utc)
        job.error_message = "Lembrete removido ou alterado."


def _equipment_is_temporary_preventive(equipment: Equipment) -> bool:
    return equipment_is_preventive_reminder_only(equipment)


def get_manual_preventive_reminder(
    db: Session,
    *,
    tenant_id: int,
    schedule_id: int,
) -> dict[str, Any]:
    schedule, equipment, client, service = _load_manual_schedule(
        db, tenant_id=tenant_id, schedule_id=schedule_id
    )
    performed = _performed_date_from_schedule(schedule)
    hist = _find_manual_historico_for_schedule(
        db,
        tenant_id=tenant_id,
        client_id=client.id,
        service_id=service.id,
        performed_date=performed,
    )
    pending_job = None
    if hist is not None:
        pending_job = db.execute(
            select(WhatsappMessageJob)
            .where(
                WhatsappMessageJob.tenant_id == tenant_id,
                WhatsappMessageJob.reference_type == "preventive_historico",
                WhatsappMessageJob.reference_id == hist.id,
                WhatsappMessageJob.status == WhatsappMessageStatus.QUEUED,
                WhatsappMessageJob.scheduled_for.isnot(None),
            )
            .order_by(WhatsappMessageJob.id.desc())
            .limit(1)
        ).scalar_one_or_none()

    return {
        "preventive_schedule_id": schedule.id,
        "client_id": client.id,
        "client_name": client.name,
        "service_id": service.id,
        "equipment_id": equipment.id,
        "equipment_label": (equipment.identificacao or "").strip(),
        "data_realizacao": performed,
        "notes": hist.notes if hist else None,
        "historico_servico_id": hist.id if hist else None,
        "reminder_send": "scheduled" if pending_job and pending_job.scheduled_for else "none",
        "reminder_local_date": None,
        "reminder_local_time": None,
        "is_temporary_equipment": _equipment_is_temporary_preventive(equipment),
        "message_template_kind": (
            str(schedule.message_template_kind).strip().lower()
            if schedule.message_template_kind
            else None
        ),
    }


def update_manual_preventive_reminder(
    db: Session,
    *,
    tenant_id: int,
    schedule_id: int,
    service_id: int,
    data_realizacao: date,
    equipment_label: str | None = None,
    notes: str | None = None,
    message_template_kind: str | None = None,
) -> EquipmentServicePreventiveSchedule:
    schedule, equipment, client, service = _load_manual_schedule(
        db, tenant_id=tenant_id, schedule_id=schedule_id
    )
    old_performed = _performed_date_from_schedule(schedule)
    hist = _find_manual_historico_for_schedule(
        db,
        tenant_id=tenant_id,
        client_id=client.id,
        service_id=service.id,
        performed_date=old_performed,
    )

    new_service = db.execute(
        select(Service).where(Service.id == service_id, Service.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if new_service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Serviço não encontrado.")

    if int(new_service.id) != int(schedule.service_id):
        duplicate = db.execute(
            select(EquipmentServicePreventiveSchedule).where(
                EquipmentServicePreventiveSchedule.equipment_id == equipment.id,
                EquipmentServicePreventiveSchedule.service_id == new_service.id,
                EquipmentServicePreventiveSchedule.id != schedule.id,
            )
        ).scalar_one_or_none()
        if duplicate is not None:
            duplicate.is_active = False
            db.add(duplicate)

    label = (equipment_label or "").strip()
    if label and _equipment_is_temporary_preventive(equipment):
        equipment.identificacao = label[:120]

    performed_at = _performed_date_to_utc(data_realizacao)
    schedule.service_id = new_service.id
    schedule.last_performed_at = performed_at
    schedule.last_service_order_id = None
    override = db.execute(
        select(EquipmentServicePreventiveOverride).where(
            EquipmentServicePreventiveOverride.equipment_id == equipment.id,
            EquipmentServicePreventiveOverride.service_id == new_service.id,
            EquipmentServicePreventiveOverride.is_active.is_(True),
        )
    ).scalar_one_or_none()
    schedule.interval_value, schedule.interval_type = _effective_interval(new_service, override)
    schedule.next_due_at = _compute_next_due(
        performed_at,
        schedule.interval_value,
        schedule.interval_type,
    )
    schedule.is_active = True
    if message_template_kind is not None:
        kind = str(message_template_kind).strip().lower()[:16]
        schedule.message_template_kind = kind or None
    db.add(schedule)

    if hist is not None:
        if hist.id and old_performed != data_realizacao:
            _cancel_queued_preventive_jobs_for_historico(db, tenant_id=tenant_id, historico_id=hist.id)
        hist.service_id = new_service.id
        hist.data_realizacao = data_realizacao
        if notes is not None:
            hist.notes = notes
        db.add(hist)
    elif notes:
        db.add(
            HistoricoServico(
                tenant_id=tenant_id,
                client_id=client.id,
                service_id=new_service.id,
                data_realizacao=data_realizacao,
                service_order_id=None,
                notes=notes,
            )
        )

    db.commit()
    db.refresh(schedule)
    return schedule


def delete_manual_preventive_reminder(
    db: Session,
    *,
    tenant_id: int,
    schedule_id: int,
) -> None:
    schedule, equipment, client, service = _load_manual_schedule(
        db, tenant_id=tenant_id, schedule_id=schedule_id
    )
    performed = _performed_date_from_schedule(schedule)
    hist = _find_manual_historico_for_schedule(
        db,
        tenant_id=tenant_id,
        client_id=client.id,
        service_id=service.id,
        performed_date=performed,
    )
    if hist is not None:
        _cancel_queued_preventive_jobs_for_historico(db, tenant_id=tenant_id, historico_id=hist.id)
        # Remove lembretes antes do histórico (FK NOT NULL; evita UPDATE null no flush do ORM).
        for lembrete in list(hist.lembretes):
            db.delete(lembrete)
        db.delete(hist)

    schedule.is_active = False
    db.add(schedule)

    other_active = db.execute(
        select(func.count())
        .select_from(EquipmentServicePreventiveSchedule)
        .where(
            EquipmentServicePreventiveSchedule.equipment_id == equipment.id,
            EquipmentServicePreventiveSchedule.is_active.is_(True),
            EquipmentServicePreventiveSchedule.id != schedule.id,
        )
    ).scalar_one()
    if int(other_active or 0) == 0 and _equipment_is_temporary_preventive(equipment):
        equipment.ativo = False
        db.add(equipment)

    db.commit()


def list_preventive_items_by_equipment_month(
    db: Session,
    *,
    tenant_id: int,
    year: int,
    month: int,
) -> dict[str, Any]:
    """Lista vencimentos com base nos prazos persistidos na gestão preventiva de cada equipamento."""
    if month < 1 or month > 12:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Mês inválido.")

    backfill_service_preventive_schedules_for_tenant(db, tenant_id=tenant_id)

    tenant = db.get(Tenant, tenant_id)
    tz_name = tenant.timezone if tenant and tenant.timezone else "America/Sao_Paulo"
    today = tenant_local_date(datetime.now(timezone.utc), tz_name)

    month_start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        month_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        month_end = datetime(year, month + 1, 1, tzinfo=timezone.utc)

    rows = db.execute(
        select(EquipmentServicePreventiveSchedule, Equipment, Client, Service, ClientSite)
        .join(Equipment, Equipment.id == EquipmentServicePreventiveSchedule.equipment_id)
        .join(Client, Client.id == Equipment.client_id)
        .join(Service, Service.id == EquipmentServicePreventiveSchedule.service_id)
        .outerjoin(ClientSite, ClientSite.id == Equipment.client_site_id)
        .where(
            Client.tenant_id == tenant_id,
            Equipment.ativo.is_(True),
            Client.is_active.is_(True),
            Client.preventive_campaign_opt_out.is_(False),
            EquipmentServicePreventiveSchedule.is_active.is_(True),
            EquipmentServicePreventiveSchedule.next_due_at.isnot(None),
            EquipmentServicePreventiveSchedule.next_due_at >= month_start,
            EquipmentServicePreventiveSchedule.next_due_at < month_end,
            Service.preventive_enabled.is_(True),
        )
    ).all()

    flat: list[dict[str, Any]] = []
    for schedule, equipment, client, service, site in rows:
        if bool(client.preventive_campaign_opt_out):
            continue
        flat.append(
            _schedule_to_preventive_item(
                equipment=equipment,
                client=client,
                schedule=schedule,
                service=service,
                today=today,
                site=site,
            )
        )

    from app.preventive_maintenance import enrich_preventive_items_campaign_status

    tenant_row = db.get(Tenant, tenant_id)
    enrich_preventive_items_campaign_status(
        db,
        tenant_id=tenant_id,
        items=flat,
        advance_days=int(tenant_row.preventive_auto_remind_days_before or 0) if tenant_row else 0,
        tenant_tz=(tenant_row.timezone if tenant_row and tenant_row.timezone else "UTC"),
    )

    flat.sort(
        key=lambda row: (
            row["dias_ate_vencimento"],
            row["client_name"].lower(),
            str(row.get("equipment_identificacao") or ""),
            row["service_name"].lower(),
        )
    )

    legacy_by_client: dict[tuple[int, int | None], dict[str, Any]] = {}
    for row in flat:
        cid = int(row["client_id"])
        site_id = int(row["client_site_id"]) if row.get("client_site_id") else None
        key = (cid, site_id)
        if key not in legacy_by_client:
            legacy_by_client[key] = {
                "client_id": cid,
                "client_name": row["client_name"],
                "client_site_id": site_id,
                "client_site_name": row.get("client_site_name"),
                "client_site_type": row.get("client_site_type"),
                "client_site_label": row.get("client_site_label"),
                "whatsapp_valido": row["whatsapp_valido"],
                "whatsapp_destino": row.get("whatsapp_destino"),
                "equipments": [],
            }
        legacy_by_client[key]["equipments"].append(row)

    clients = sorted(
        legacy_by_client.values(),
        key=lambda g: (
            g["client_name"].lower(),
            0 if (g.get("client_site_type") or "").lower() == "matriz" else (1 if g.get("client_site_id") else 2),
            str(g.get("client_site_name") or "").lower(),
            g["equipments"][0]["dias_ate_vencimento"] if g["equipments"] else 999,
        ),
    )

    return {
        "year": year,
        "month": month,
        "clients": clients,
        "items": flat,
    }


def list_schedule_preventive_items_in_window(
    db: Session,
    *,
    tenant_id: int,
    window_days: int,
) -> list[dict[str, Any]]:
    """Itens da gestão preventiva por equipamento dentro da janela (inclui vencidos)."""
    from datetime import timedelta

    backfill_service_preventive_schedules_for_tenant(db, tenant_id=tenant_id)

    tenant = db.get(Tenant, tenant_id)
    tz_name = tenant.timezone if tenant and tenant.timezone else "America/Sao_Paulo"
    today = tenant_local_date(datetime.now(timezone.utc), tz_name)
    deadline = today + timedelta(days=max(0, window_days))

    rows = db.execute(
        select(EquipmentServicePreventiveSchedule, Equipment, Client, Service, ClientSite)
        .join(Equipment, Equipment.id == EquipmentServicePreventiveSchedule.equipment_id)
        .join(Client, Client.id == Equipment.client_id)
        .join(Service, Service.id == EquipmentServicePreventiveSchedule.service_id)
        .outerjoin(ClientSite, ClientSite.id == Equipment.client_site_id)
        .where(
            Client.tenant_id == tenant_id,
            Equipment.ativo.is_(True),
            Client.is_active.is_(True),
            Client.preventive_campaign_opt_out.is_(False),
            EquipmentServicePreventiveSchedule.is_active.is_(True),
            EquipmentServicePreventiveSchedule.next_due_at.isnot(None),
            Service.preventive_enabled.is_(True),
        )
    ).all()

    flat: list[dict[str, Any]] = []
    for schedule, equipment, client, service, site in rows:
        if bool(client.preventive_campaign_opt_out):
            continue
        next_due = schedule.next_due_at
        if next_due is None:
            continue
        if next_due.tzinfo is None:
            next_due = next_due.replace(tzinfo=timezone.utc)
        due_date = tenant_local_date(next_due, tz_name)
        if due_date > deadline:
            continue
        flat.append(
            _schedule_to_preventive_item(
                equipment=equipment,
                client=client,
                schedule=schedule,
                service=service,
                today=today,
                site=site,
            )
        )

    from app.preventive_maintenance import enrich_preventive_items_campaign_status

    tenant_row = db.get(Tenant, tenant_id)
    enrich_preventive_items_campaign_status(
        db,
        tenant_id=tenant_id,
        items=flat,
        advance_days=int(tenant_row.preventive_auto_remind_days_before or 0) if tenant_row else 0,
        tenant_tz=(tenant_row.timezone if tenant_row and tenant_row.timezone else "UTC"),
    )

    flat.sort(
        key=lambda row: (
            row["dias_ate_vencimento"],
            row["client_name"].lower(),
            str(row.get("equipment_identificacao") or ""),
            row["service_name"].lower(),
        )
    )
    return flat


def find_preventive_group_for_client_month(
    db: Session,
    *,
    tenant_id: int,
    client_id: int,
    year: int,
    month: int,
    client_site_id: int | None = None,
) -> dict[str, Any] | None:
    """Grupo de envio WhatsApp para um cliente (e filial, se informada) no mês da Gestão Preventiva."""
    payload = list_preventive_items_by_equipment_month(
        db,
        tenant_id=tenant_id,
        year=year,
        month=month,
    )
    wanted_site = int(client_site_id) if client_site_id is not None else None
    client_group = next(
        (
            g
            for g in payload.get("clients", [])
            if int(g["client_id"]) == int(client_id)
            and (
                (g.get("client_site_id") is None and wanted_site is None)
                or (
                    g.get("client_site_id") is not None
                    and wanted_site is not None
                    and int(g["client_site_id"]) == wanted_site
                )
            )
        ),
        None,
    )
    if client_group is None and wanted_site is None:
        # Compat: se a UI antiga não envia filial, usa o primeiro grupo do cliente.
        client_group = next(
            (g for g in payload.get("clients", []) if int(g["client_id"]) == int(client_id)),
            None,
        )
    if client_group is None:
        return None
    items = [row for row in client_group.get("equipments", []) if row.get("whatsapp_valido")]
    if not items:
        return None
    due = items[0]["data_proximo_vencimento"]
    if isinstance(due, datetime):
        due = due.date()
    return {
        "client_id": int(client_id),
        "client_name": str(client_group["client_name"]),
        "client_site_id": client_group.get("client_site_id"),
        "client_site_name": client_group.get("client_site_name"),
        "client_site_type": client_group.get("client_site_type"),
        "client_site_label": client_group.get("client_site_label"),
        "due_year": int(due.year),
        "due_month": int(due.month),
        "whatsapp_valido": True,
        "whatsapp_destino": client_group.get("whatsapp_destino"),
        "items": items,
    }
