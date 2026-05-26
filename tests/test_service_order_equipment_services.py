"""Testes do vínculo equipamento ↔ serviço e duração total da OS."""

from __future__ import annotations

from types import SimpleNamespace

from app.service_order_ops import assert_unique_equipment_service, build_equipment_cards, get_total_duration_minutes


class _FakeSession:
    def __init__(self, existing_id: int | None = None) -> None:
        self.existing_id = existing_id

    def execute(self, _query):
        return SimpleNamespace(scalar_one_or_none=lambda: self.existing_id)


def test_get_total_duration_sums_services_only():
    order = SimpleNamespace(
        service_items=[
            SimpleNamespace(quantity=2, duration_minutes=30),
            SimpleNamespace(quantity=1, duration_minutes=45),
        ]
    )
    assert get_total_duration_minutes(order) == 105


def test_build_equipment_cards_groups_by_equipment():
    eq_a = SimpleNamespace(identificacao="Sala 1", tipo="AR", modelo="X")
    eq_b = SimpleNamespace(identificacao="Sala 2", tipo="AR", modelo="Y")
    svc = SimpleNamespace(name="Limpeza", periodicidade_meses=6)
    order = SimpleNamespace(
        service_items=[
            SimpleNamespace(
                id=1,
                equipment_id=10,
                equipment=eq_a,
                service_id=5,
                service=svc,
                quantity=1,
                unit_price=100,
                duration_minutes=60,
            ),
            SimpleNamespace(
                id=2,
                equipment_id=10,
                equipment=eq_a,
                service_id=6,
                service=SimpleNamespace(name="Gás", periodicidade_meses=None),
                quantity=1,
                unit_price=80,
                duration_minutes=30,
            ),
            SimpleNamespace(
                id=3,
                equipment_id=20,
                equipment=eq_b,
                service_id=5,
                service=svc,
                quantity=2,
                unit_price=100,
                duration_minutes=60,
            ),
        ]
    )
    cards = build_equipment_cards(order)
    assert len(cards) == 2
    by_eq = {c["equipment_id"]: c for c in cards}
    assert len(by_eq[10]["services"]) == 2
    assert by_eq[10]["total_duration_minutes"] == 90
    assert by_eq[20]["total_duration_minutes"] == 120


def test_assert_unique_raises_on_duplicate():
    from fastapi import HTTPException

    db = _FakeSession(existing_id=99)
    try:
        assert_unique_equipment_service(
            db,
            service_order_id=1,
            service_id=5,
            equipment_id=10,
        )
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 409
