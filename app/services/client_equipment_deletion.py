"""Regras para exclusão de instalações do cliente (client_equipments)."""

from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from models import (
    ClientEquipment,
    Equipment,
    EquipmentDocument,
    PmocExecution,
    PmocPlanEquipment,
    PmocScheduledActivity,
    ServiceOrderServiceItem,
    ServiceOrderServiceItemEquipmentAudit,
)


def _count_legacy_links(db: Session, equipment_id: int) -> list[str]:
    """Retorna rótulos dos vínculos que impedem apagar o registro legado em equipments."""
    blocks: list[str] = []

    if db.scalar(
        select(func.count()).select_from(EquipmentDocument).where(EquipmentDocument.equipment_id == equipment_id)
    ):
        blocks.append("documentos técnicos")

    if db.scalar(
        select(func.count()).select_from(PmocPlanEquipment).where(PmocPlanEquipment.equipment_id == equipment_id)
    ):
        blocks.append("PMOC")

    if db.scalar(
        select(func.count())
        .select_from(PmocScheduledActivity)
        .where(PmocScheduledActivity.equipment_id == equipment_id)
    ):
        blocks.append("atividades PMOC")

    if db.scalar(
        select(func.count()).select_from(PmocExecution).where(PmocExecution.equipment_id == equipment_id)
    ):
        blocks.append("execuções PMOC")

    if db.scalar(
        select(func.count())
        .select_from(ServiceOrderServiceItem)
        .where(ServiceOrderServiceItem.equipment_id == equipment_id)
    ):
        blocks.append("ordens de serviço")

    if db.scalar(
        select(func.count())
        .select_from(ServiceOrderServiceItemEquipmentAudit)
        .where(
            or_(
                ServiceOrderServiceItemEquipmentAudit.previous_equipment_id == equipment_id,
                ServiceOrderServiceItemEquipmentAudit.new_equipment_id == equipment_id,
            )
        )
    ):
        blocks.append("histórico de OS")

    return blocks


def can_delete_client_equipment(db: Session, installation: ClientEquipment) -> tuple[bool, str | None]:
    """
    Pode excluir quando não há vínculos de negócio no registro legado (equipments).
    Instalações novas sem legacy_equipment_id sempre podem ser removidas.
    """
    legacy_id = installation.legacy_equipment_id
    if legacy_id is None:
        return True, None

    blocks = _count_legacy_links(db, legacy_id)
    if blocks:
        joined = ", ".join(blocks)
        return (
            False,
            f"Este equipamento está vinculado a {joined}. Remova os vínculos ou mantenha apenas desativado.",
        )
    return True, None


def delete_client_equipment(db: Session, installation: ClientEquipment) -> None:
    allowed, reason = can_delete_client_equipment(db, installation)
    if not allowed:
        raise ValueError(reason or "Não é possível excluir este equipamento.")

    legacy_id = installation.legacy_equipment_id
    db.delete(installation)
    db.flush()

    if legacy_id is None:
        return

    other_installations = db.scalar(
        select(func.count())
        .select_from(ClientEquipment)
        .where(ClientEquipment.legacy_equipment_id == legacy_id)
    )
    if other_installations:
        return

    legacy = db.get(Equipment, legacy_id)
    if legacy is not None:
        db.delete(legacy)
