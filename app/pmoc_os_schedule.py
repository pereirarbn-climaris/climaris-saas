"""Cruzamento PMOC → O.S.: atividades por equipamento e checklist detalhado."""

from __future__ import annotations

from dataclasses import dataclass

from app.pmoc_schedule import activity_due_in_month
from models import PmocScheduledActivity, Service


@dataclass
class EquipmentActivityCell:
    equipment_id: int
    equipment_label: str
    activity_id: int
    activity_title: str
    service_id: int
    service_name: str


def _equipment_label(equipment_id: int, labels: dict[int, str]) -> str:
    return labels.get(equipment_id) or f"Equipamento #{equipment_id}"


def build_equipment_activity_matrix(
    *,
    selected_equipment_ids: list[int],
    equipment_labels: dict[int, str],
    activities: list[PmocScheduledActivity],
    breakdown_activity_ids: set[int],
    services: dict[int, Service],
    month: int,
) -> list[EquipmentActivityCell]:
    """Para cada equipamento selecionado, lista atividades globais ou específicas do mês."""
    cells: list[EquipmentActivityCell] = []
    for equipment_id in selected_equipment_ids:
        label = _equipment_label(equipment_id, equipment_labels)
        for act in activities:
            if act.id not in breakdown_activity_ids:
                continue
            if not activity_due_in_month(act.frequency, month):
                continue
            if act.equipment_id is not None and act.equipment_id != equipment_id:
                continue
            if act.service_id is None:
                continue
            svc = services.get(act.service_id)
            if svc is None:
                continue
            cells.append(
                EquipmentActivityCell(
                    equipment_id=equipment_id,
                    equipment_label=label,
                    activity_id=act.id,
                    activity_title=act.title,
                    service_id=svc.id,
                    service_name=svc.name,
                )
            )
    return cells


def build_checklist_from_matrix(cells: list[EquipmentActivityCell]) -> list[dict[str, str]]:
    """Checklist no formato [Serviço X] → [Máquina Y]."""
    items: list[dict[str, str]] = []
    for idx, cell in enumerate(cells):
        items.append(
            {
                "id": f"pmoc_{cell.activity_id}_{cell.equipment_id}_{idx}",
                "descricao": f"{cell.service_name} → {cell.equipment_label}",
                "status": "na",
            }
        )
    return items
