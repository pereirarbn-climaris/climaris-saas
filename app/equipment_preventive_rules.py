"""Regras de preventiva customizada por equipamento e sincronização pós-fechamento de OS."""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import TYPE_CHECKING, Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.preventive_maintenance import add_calendar_months, client_whatsapp_destination, tenant_local_date
from models import (
    Client,
    Equipment,
    EquipmentPreventiveRule,
    PreventiveIntervalType,
    ServiceOrder,
)

if TYPE_CHECKING:
    pass

logger = logging.getLogger("erp.equipment_preventive")


def compute_next_due_datetime(
    last_performed: datetime,
    *,
    interval_value: int,
    interval_type: PreventiveIntervalType | str,
) -> datetime:
    """Soma interval_value em meses ou dias à data/hora da última manutenção."""
    if last_performed.tzinfo is None:
        last_performed = last_performed.replace(tzinfo=timezone.utc)
    value = max(1, int(interval_value))
    kind = interval_type.value if isinstance(interval_type, PreventiveIntervalType) else str(interval_type)
    if kind == PreventiveIntervalType.DAYS.value:
        return last_performed + timedelta(days=value)
    local_day = last_performed.date()
    next_day = add_calendar_months(local_day, value)
    return datetime.combine(
        next_day,
        last_performed.timetz().replace(tzinfo=last_performed.tzinfo),
        tzinfo=last_performed.tzinfo,
    )


def collect_order_equipment_ids(order: ServiceOrder) -> set[int]:
    """Equipamentos distintos vinculados aos serviços executados na OS."""
    ids: set[int] = set()
    for item in order.service_items:
        if item.equipment_id is not None:
            ids.add(int(item.equipment_id))
    return ids


def sync_preventive_rules_on_order_closure(
    db: Session,
    *,
    order: ServiceOrder,
    closed_at: datetime,
) -> list[EquipmentPreventiveRule]:
    """Atualiza last_performed_date e recalcula next_due_date para regras ativas dos equipamentos da OS."""
    if closed_at.tzinfo is None:
        closed_at = closed_at.replace(tzinfo=timezone.utc)

    equipment_ids = collect_order_equipment_ids(order)
    if not equipment_ids:
        return []

    rules = (
        db.execute(
            select(EquipmentPreventiveRule)
            .where(
                EquipmentPreventiveRule.equipment_id.in_(equipment_ids),
                EquipmentPreventiveRule.is_active.is_(True),
            )
            .options(joinedload(EquipmentPreventiveRule.equipment))
        )
        .scalars()
        .all()
    )

    updated: list[EquipmentPreventiveRule] = []
    for rule in rules:
        rule.last_performed_date = closed_at
        rule.next_due_date = compute_next_due_datetime(
            closed_at,
            interval_value=rule.interval_value,
            interval_type=rule.interval_type,
        )
        db.add(rule)
        updated.append(rule)

    if updated:
        db.flush()
        logger.info(
            "Preventive rules updated on OS closure order_id=%s equipment_count=%s",
            order.id,
            len(updated),
        )
    return updated


def list_equipment_preventive_due(
    db: Session,
    *,
    tenant_id: int,
    window_days: int,
    reference_utc: datetime | None = None,
) -> list[dict[str, Any]]:
    """
    Equipamentos com regra ativa e next_due_date vencida ou dentro da janela (agrupável por cliente).
  """
    from models import Tenant

    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return []

    now = reference_utc or datetime.now(timezone.utc)
    today = tenant_local_date(now, tenant.timezone)
    deadline = today + timedelta(days=max(0, window_days))

    rows = db.execute(
        select(EquipmentPreventiveRule, Equipment, Client)
        .join(Equipment, Equipment.id == EquipmentPreventiveRule.equipment_id)
        .join(Client, Client.id == Equipment.client_id)
        .where(
            Client.tenant_id == tenant_id,
            EquipmentPreventiveRule.is_active.is_(True),
            Equipment.ativo.is_(True),
            Client.is_active.is_(True),
            Client.preventive_campaign_opt_out.is_(False),
            EquipmentPreventiveRule.next_due_date.isnot(None),
        )
    ).all()

    items: list[dict[str, Any]] = []
    for rule, equipment, client in rows:
        if bool(client.preventive_campaign_opt_out):
            continue
        due_dt = rule.next_due_date
        if due_dt is None:
            continue
        due_date = tenant_local_date(due_dt, tenant.timezone)
        if due_date > deadline:
            continue
        dias = (due_date - today).days
        ok_wa, dest = client_whatsapp_destination(client)
        last_date: date | None = None
        if rule.last_performed_date is not None:
            last_date = tenant_local_date(rule.last_performed_date, tenant.timezone)
        interval_type = (
            rule.interval_type.value
            if isinstance(rule.interval_type, PreventiveIntervalType)
            else str(rule.interval_type)
        )
        items.append(
            {
                "rule_id": rule.id,
                "equipment_id": equipment.id,
                "equipment_identificacao": equipment.identificacao,
                "equipment_tipo": equipment.tipo.value if hasattr(equipment.tipo, "value") else str(equipment.tipo),
                "equipment_fabricante": equipment.fabricante,
                "equipment_modelo": equipment.modelo,
                "equipment_modelo_evaporadora": equipment.modelo_evaporadora,
                "equipment_modelo_condensadora": equipment.modelo_condensadora,
                "equipment_local": (equipment.ambiente_nome or equipment.local_instalacao or "").strip() or None,
                "client_id": client.id,
                "client_name": client.name,
                "interval_value": rule.interval_value,
                "interval_type": interval_type,
                "last_performed_date": last_date,
                "next_due_date": due_date,
                "next_due_at": due_dt,
                "dias_ate_vencimento": dias,
                "whatsapp_valido": ok_wa,
                "whatsapp_destino": dest,
            }
        )

    items.sort(key=lambda r: (r["dias_ate_vencimento"], r["client_name"], r["equipment_identificacao"]))
    return items


def equipment_due_row_to_preventive_item(row: dict[str, Any]) -> dict[str, Any]:
    """Normaliza linha de regra por equipamento para o schema PreventiveItemOut."""
    return {
        "historico_servico_id": 0,
        "rule_id": row["rule_id"],
        "client_id": row["client_id"],
        "client_name": row["client_name"],
        "service_id": 0,
        "service_name": f"Preventiva — {row['equipment_identificacao']}",
        "equipment_id": row["equipment_id"],
        "equipment_identificacao": row["equipment_identificacao"],
        "equipment_tipo": row.get("equipment_tipo"),
        "equipment_fabricante": row.get("equipment_fabricante"),
        "equipment_modelo": row.get("equipment_modelo"),
        "equipment_modelo_evaporadora": row.get("equipment_modelo_evaporadora"),
        "equipment_modelo_condensadora": row.get("equipment_modelo_condensadora"),
        "equipment_local": row.get("equipment_local"),
        "interval_value": row["interval_value"],
        "interval_type": row["interval_type"],
        "periodicidade_meses": row["interval_value"] if row["interval_type"] == "months" else 0,
        "data_ultima_realizacao": row["last_performed_date"] or row["next_due_date"],
        "data_proximo_vencimento": row["next_due_date"],
        "dias_ate_vencimento": row["dias_ate_vencimento"],
        "whatsapp_valido": row["whatsapp_valido"],
        "whatsapp_destino": row["whatsapp_destino"],
        "ultimo_whatsapp_status": None,
        "ultimo_whatsapp_erro": None,
        "ultimo_whatsapp_em": None,
    }


def group_preventive_items_by_client(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Agrupa itens de preventiva por cliente."""
    by_client: dict[int, dict[str, Any]] = {}
    for row in items:
        cid = int(row["client_id"])
        if cid not in by_client:
            by_client[cid] = {
                "client_id": cid,
                "client_name": row["client_name"],
                "whatsapp_valido": bool(row.get("whatsapp_valido")),
                "whatsapp_destino": row.get("whatsapp_destino"),
                "equipments": [],
            }
        by_client[cid]["equipments"].append(row)
    return sorted(by_client.values(), key=lambda g: (g["equipments"][0]["dias_ate_vencimento"] if g["equipments"] else 999, g["client_name"]))


def _parse_interval_type(value: PreventiveIntervalType | str) -> PreventiveIntervalType:
    if isinstance(value, PreventiveIntervalType):
        return value
    raw = str(value).strip().lower()
    if raw == PreventiveIntervalType.DAYS.value:
        return PreventiveIntervalType.DAYS
    if raw == PreventiveIntervalType.MONTHS.value:
        return PreventiveIntervalType.MONTHS
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="interval_type must be 'months' or 'days'.",
    )


def refresh_rule_next_due_date(
    rule: EquipmentPreventiveRule,
    *,
    reference: datetime | None = None,
) -> None:
    """Recalcula next_due_date via ``EquipmentPreventiveRule.compute_next_due_date``."""
    ref = reference or datetime.now(timezone.utc)
    if ref.tzinfo is None:
        ref = ref.replace(tzinfo=timezone.utc)
    if rule.last_performed_date is not None:
        rule.next_due_date = rule.compute_next_due_date()
    else:
        rule.next_due_date = rule.compute_next_due_date(from_dt=ref)


def get_tenant_equipment(
    db: Session,
    *,
    tenant_id: int,
    equipment_id: int,
) -> Equipment:
    equipment = db.execute(
        select(Equipment)
        .join(Client, Client.id == Equipment.client_id)
        .where(
            Equipment.id == equipment_id,
            Client.tenant_id == tenant_id,
            Equipment.ativo.is_(True),
        )
    ).scalar_one_or_none()
    if equipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado.")
    return equipment


def get_rule_for_tenant(
    db: Session,
    *,
    tenant_id: int,
    rule_id: int,
) -> EquipmentPreventiveRule:
    rule = db.execute(
        select(EquipmentPreventiveRule)
        .join(Equipment, Equipment.id == EquipmentPreventiveRule.equipment_id)
        .join(Client, Client.id == Equipment.client_id)
        .where(
            EquipmentPreventiveRule.id == rule_id,
            Client.tenant_id == tenant_id,
        )
        .options(joinedload(EquipmentPreventiveRule.equipment).joinedload(Equipment.client))
    ).scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regra preventiva não encontrada.")
    return rule


def rule_to_dict(rule: EquipmentPreventiveRule) -> dict[str, Any]:
    equipment = rule.equipment
    interval_type = (
        rule.interval_type.value
        if isinstance(rule.interval_type, PreventiveIntervalType)
        else str(rule.interval_type)
    )
    return {
        "id": rule.id,
        "equipment_id": rule.equipment_id,
        "is_active": rule.is_active,
        "interval_value": rule.interval_value,
        "interval_type": interval_type,
        "last_performed_date": rule.last_performed_date,
        "next_due_date": rule.next_due_date,
        "created_at": rule.created_at,
        "updated_at": rule.updated_at,
        "equipment_identificacao": equipment.identificacao if equipment is not None else None,
        "client_id": equipment.client_id if equipment is not None else None,
    }


def upsert_equipment_preventive_rule(
    db: Session,
    *,
    tenant_id: int,
    equipment_id: int,
    interval_value: int,
    interval_type: str,
    is_active: bool,
) -> EquipmentPreventiveRule:
    get_tenant_equipment(db, tenant_id=tenant_id, equipment_id=equipment_id)
    parsed_type = _parse_interval_type(interval_type)

    rule = db.execute(
        select(EquipmentPreventiveRule)
        .join(Equipment, Equipment.id == EquipmentPreventiveRule.equipment_id)
        .join(Client, Client.id == Equipment.client_id)
        .where(
            EquipmentPreventiveRule.equipment_id == equipment_id,
            Client.tenant_id == tenant_id,
        )
        .options(joinedload(EquipmentPreventiveRule.equipment).joinedload(Equipment.client))
    ).scalar_one_or_none()

    if rule is None:
        rule = EquipmentPreventiveRule(
            equipment_id=equipment_id,
            interval_value=max(1, int(interval_value)),
            interval_type=parsed_type,
            is_active=bool(is_active),
        )
        db.add(rule)
        db.flush()
    else:
        rule.interval_value = max(1, int(interval_value))
        rule.interval_type = parsed_type
        rule.is_active = bool(is_active)

    refresh_rule_next_due_date(rule)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def record_manual_equipment_preventive(
    db: Session,
    *,
    tenant_id: int,
    equipment_id: int,
    interval_value: int,
    interval_type: str = "months",
    performed_date: date,
) -> EquipmentPreventiveRule:
    """Vincula equipamento à preventiva manual (Nova Preventiva) com última realização e próximo vencimento."""
    get_tenant_equipment(db, tenant_id=tenant_id, equipment_id=equipment_id)
    parsed_type = _parse_interval_type(interval_type)
    performed_at = datetime.combine(performed_date, time(hour=12, minute=0), tzinfo=timezone.utc)

    rule = db.execute(
        select(EquipmentPreventiveRule)
        .join(Equipment, Equipment.id == EquipmentPreventiveRule.equipment_id)
        .join(Client, Client.id == Equipment.client_id)
        .where(
            EquipmentPreventiveRule.equipment_id == equipment_id,
            Client.tenant_id == tenant_id,
        )
        .options(joinedload(EquipmentPreventiveRule.equipment).joinedload(Equipment.client))
    ).scalar_one_or_none()

    if rule is None:
        rule = EquipmentPreventiveRule(
            equipment_id=equipment_id,
            interval_value=max(1, int(interval_value)),
            interval_type=parsed_type,
            is_active=True,
        )
        db.add(rule)
        db.flush()
    else:
        rule.interval_value = max(1, int(interval_value))
        rule.interval_type = parsed_type
        rule.is_active = True

    rule.last_performed_date = performed_at
    rule.next_due_date = compute_next_due_datetime(
        performed_at,
        interval_value=rule.interval_value,
        interval_type=rule.interval_type,
    )
    db.add(rule)
    db.flush()
    return rule


def get_equipment_preventive_rule(
    db: Session,
    *,
    tenant_id: int,
    equipment_id: int,
) -> EquipmentPreventiveRule | None:
    get_tenant_equipment(db, tenant_id=tenant_id, equipment_id=equipment_id)
    return db.execute(
        select(EquipmentPreventiveRule)
        .join(Equipment, Equipment.id == EquipmentPreventiveRule.equipment_id)
        .join(Client, Client.id == Equipment.client_id)
        .where(
            EquipmentPreventiveRule.equipment_id == equipment_id,
            Client.tenant_id == tenant_id,
        )
        .options(joinedload(EquipmentPreventiveRule.equipment).joinedload(Equipment.client))
    ).scalar_one_or_none()


def update_equipment_preventive_rule(
    db: Session,
    *,
    tenant_id: int,
    rule_id: int,
    interval_value: int | None = None,
    interval_type: str | None = None,
    is_active: bool | None = None,
) -> EquipmentPreventiveRule:
    rule = get_rule_for_tenant(db, tenant_id=tenant_id, rule_id=rule_id)
    if interval_value is not None:
        rule.interval_value = max(1, int(interval_value))
    if interval_type is not None:
        rule.interval_type = _parse_interval_type(interval_type)
    if is_active is not None:
        rule.is_active = bool(is_active)

    refresh_rule_next_due_date(rule)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def delete_equipment_preventive_rule(
    db: Session,
    *,
    tenant_id: int,
    rule_id: int,
) -> None:
    rule = get_rule_for_tenant(db, tenant_id=tenant_id, rule_id=rule_id)
    db.delete(rule)
    db.commit()
