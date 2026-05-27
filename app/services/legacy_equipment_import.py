"""Importa equipamentos legados (tabela `equipments`) para `client_equipments`."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import ClientEquipment, Equipment


def import_orphan_legacy_equipments_for_client(
    db: Session,
    *,
    tenant_id: int,
    client_id: int,
) -> int:
    """
    Cria registros em client_equipments para equipamentos legados sem vínculo no catálogo.
    Idempotente: não duplica instalações já importadas.
    """
    linked_ids = {
        row
        for row in db.execute(
            select(ClientEquipment.legacy_equipment_id).where(
                ClientEquipment.client_id == client_id,
                ClientEquipment.tenant_id == tenant_id,
                ClientEquipment.legacy_equipment_id.isnot(None),
            )
        )
        .scalars()
        .all()
        if row is not None
    }

    orphans_query = select(Equipment).where(Equipment.client_id == client_id)
    if linked_ids:
        orphans_query = orphans_query.where(Equipment.id.not_in(linked_ids))
    orphans = db.execute(orphans_query).scalars().all()

    created = 0
    for equipment in orphans:
        db.add(
            ClientEquipment(
                tenant_id=tenant_id,
                client_id=client_id,
                client_site_id=equipment.client_site_id,
                tag=equipment.identificacao.strip() or f"Equipamento #{equipment.id}",
                installation_reference=equipment.installation_reference,
                is_active=equipment.ativo,
                legacy_equipment_id=equipment.id,
            )
        )
        created += 1

    if created:
        db.commit()

    return created
