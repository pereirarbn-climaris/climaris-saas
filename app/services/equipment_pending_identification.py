"""Equipamento "a identificar" — cadastro rápido sem marca/modelo conhecidos.

Quando o atendente não sabe a marca/modelo do aparelho no momento do cadastro
(ex.: cliente novo, agendamento por telefone), o equipamento pode ser criado
vinculado a um item de catálogo *placeholder* ("Marca não identificada").
Isso permite já cadastrar serviços/OS para esse equipamento; a identificação
real (marca, modelo, série) é feita depois — tipicamente pelo técnico, em
campo — via `PATCH /clients/equipments/{id}/identify`.

O placeholder reaproveita exatamente o mesmo fallback já usado pelo fluxo de
leitura de etiqueta por IA quando a foto não permite identificar o aparelho
(`find_or_create_catalog_from_label` com `extraction={}`), garantindo que
haja apenas UM registro de catálogo por categoria/tenant para esse propósito
(dedup via `find_catalog_duplicate`).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.equipment_label_catalog_resolve import find_or_create_catalog_from_label
from models import Equipment, EquipmentCatalog

# Textos exatos usados pelo fallback de `find_or_create_catalog_from_label`
# quando a extração da etiqueta vem vazia. Mantidos aqui como constantes
# únicas para evitar duplicação/drift entre os dois usos.
PENDING_IDENTIFICATION_BRAND = "Marca não identificada"
PENDING_IDENTIFICATION_MODEL_FALLBACK = "Não identificado na etiqueta"


def is_pending_identification_catalog(catalog: EquipmentCatalog | None) -> bool:
    if catalog is None:
        return False
    return (catalog.brand or "").strip() == PENDING_IDENTIFICATION_BRAND


def is_pending_identification_equipment(equipment: Equipment | None) -> bool:
    """Usa o espelho legado (`Equipment.fabricante`), sempre sincronizado a
    partir do catálogo do componente principal — evita joins extras."""
    if equipment is None:
        return False
    return (equipment.fabricante or "").strip() == PENDING_IDENTIFICATION_BRAND


def get_or_create_pending_identification_catalog(
    db: Session,
    *,
    tenant_id: int,
    equipment_kind: str,
) -> tuple[EquipmentCatalog, bool]:
    """Retorna (catalog, created) do item placeholder da categoria informada."""
    kind = "climatizador" if (equipment_kind or "").strip().lower() == "climatizador" else "ar_condicionado"
    catalog, _category, created = find_or_create_catalog_from_label(
        db,
        tenant_id=tenant_id,
        equipment_kind=kind,
        extraction={},
    )
    return catalog, created
