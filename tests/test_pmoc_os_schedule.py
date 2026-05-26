"""Testes do cruzamento PMOC → O.S. por equipamento."""

from types import SimpleNamespace

from app.pmoc_os_schedule import build_checklist_from_matrix, build_equipment_activity_matrix
from models import PmocActivityFrequency


def _act(aid: int, title: str, *, equipment_id=None, service_id=10, freq=PmocActivityFrequency.MONTHLY):
    return SimpleNamespace(
        id=aid,
        title=title,
        equipment_id=equipment_id,
        service_id=service_id,
        frequency=freq,
    )


def test_build_equipment_activity_matrix_global_and_specific():
    activities = [
        _act(1, "Limpeza filtros"),
        _act(2, "Troca gás", equipment_id=102),
    ]
    services = {10: SimpleNamespace(id=10, name="Higienização de Filtros")}
    cells = build_equipment_activity_matrix(
        selected_equipment_ids=[101, 102],
        equipment_labels={101: "SALA 01", 102: "SALA 02"},
        activities=activities,
        breakdown_activity_ids={1, 2},
        services=services,
        month=3,
    )
    assert len(cells) == 3
    assert sum(1 for c in cells if c.equipment_id == 101 and c.service_name == "Higienização de Filtros") == 1
    assert any(c.equipment_id == 102 and c.activity_id == 2 for c in cells)


def test_build_checklist_from_matrix_format():
    cells = build_equipment_activity_matrix(
        selected_equipment_ids=[101],
        equipment_labels={101: "SALA 01"},
        activities=[_act(1, "Limpeza filtros")],
        breakdown_activity_ids={1},
        services={10: SimpleNamespace(id=10, name="Limpeza de Filtros")},
        month=5,
    )
    checklist = build_checklist_from_matrix(cells)
    assert checklist[0]["descricao"] == "Limpeza de Filtros → SALA 01"
