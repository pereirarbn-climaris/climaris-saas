"""Efeitos colaterais ao desativar equipamento do cliente (fora da ficha do cliente)."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.pmoc_service import refresh_pmoc_computed_fields
from models import (
    ClientEquipment,
    Equipment,
    EquipmentServicePreventiveSchedule,
    OrderStatus,
    PmocPlan,
    PmocPlanEquipment,
    ServiceOrder,
    ServiceOrderEquipmentService,
)

_OPEN_ORDER_STATUSES = (
    OrderStatus.OPEN,
    OrderStatus.APPROVED,
    OrderStatus.SCHEDULED,
    OrderStatus.IN_PROGRESS,
)


def remove_equipment_from_open_service_orders(
    db: Session,
    *,
    legacy_equipment_id: int,
) -> None:
    """Remove linhas de serviço do equipamento em OS ainda abertas (mantém em concluídas/canceladas)."""
    item_ids = list(
        db.execute(
            select(ServiceOrderEquipmentService.id)
            .join(ServiceOrder, ServiceOrder.id == ServiceOrderEquipmentService.service_order_id)
            .where(
                ServiceOrderEquipmentService.equipment_id == legacy_equipment_id,
                ServiceOrder.status.in_(_OPEN_ORDER_STATUSES),
            )
        ).scalars().all()
    )
    if item_ids:
        db.execute(
            delete(ServiceOrderEquipmentService).where(
                ServiceOrderEquipmentService.id.in_(item_ids)
            )
        )


def apply_client_equipment_deactivated(
    db: Session,
    *,
    tenant_id: int,
    legacy_equipment_id: int | None,
) -> None:
    """
    Remove o aparelho de PMOC, OS abertas e desativa cronogramas preventivos.
    Usa o ID legado (tabela equipments), referenciado em OS/PMOC.
    """
    if legacy_equipment_id is None:
        return

    remove_equipment_from_open_service_orders(db, legacy_equipment_id=legacy_equipment_id)

    pmoc_ids = list(
        db.execute(
            select(PmocPlanEquipment.pmoc_id).where(
                PmocPlanEquipment.equipment_id == legacy_equipment_id
            )
        ).scalars().all()
    )
    if pmoc_ids:
        db.execute(
            delete(PmocPlanEquipment).where(
                PmocPlanEquipment.equipment_id == legacy_equipment_id
            )
        )

    schedules = db.execute(
        select(EquipmentServicePreventiveSchedule).where(
            EquipmentServicePreventiveSchedule.equipment_id == legacy_equipment_id,
            EquipmentServicePreventiveSchedule.is_active.is_(True),
        )
    ).scalars().all()
    for schedule in schedules:
        schedule.is_active = False
        db.add(schedule)

    for pmoc_id in dict.fromkeys(pmoc_ids):
        plan = db.execute(
            select(PmocPlan).where(PmocPlan.id == pmoc_id, PmocPlan.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if plan is not None:
            refresh_pmoc_computed_fields(db, plan)


def deactivate_installation(
    db: Session,
    installation: ClientEquipment,
    *,
    tenant_id: int,
    is_active: bool,
) -> None:
    """Sincroniza instalação (catálogo v2) + legado e aplica efeitos ao desativar."""
    installation.is_active = is_active
    legacy: Equipment | None = installation.legacy_equipment
    if legacy is not None:
        legacy.ativo = is_active
        db.add(legacy)
    db.add(installation)
    if not is_active:
        apply_client_equipment_deactivated(
            db,
            tenant_id=tenant_id,
            legacy_equipment_id=installation.legacy_equipment_id,
        )


def deactivate_legacy_equipment_row(
    db: Session,
    equipment: Equipment,
    *,
    tenant_id: int,
) -> None:
    """Desativa linha legada e instalação v2 vinculada, se existir."""
    equipment.ativo = False
    db.add(equipment)
    installation = db.execute(
        select(ClientEquipment).where(
            ClientEquipment.legacy_equipment_id == equipment.id,
            ClientEquipment.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if installation is not None:
        installation.is_active = False
        db.add(installation)
    apply_client_equipment_deactivated(
        db,
        tenant_id=tenant_id,
        legacy_equipment_id=equipment.id,
    )


def assert_equipment_active_for_operations(equipment: Equipment | None) -> None:
    from fastapi import HTTPException, status

    if equipment is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Equipamento inválido para este cliente.",
        )
    if not equipment.ativo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Equipamento desativado não pode ser usado em OS, PMOC ou preventiva.",
        )
