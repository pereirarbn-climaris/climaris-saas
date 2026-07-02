"""Testes para equipamentos de lembrete preventivo (não aparecem no cadastro do cliente)."""

from __future__ import annotations

from unittest.mock import MagicMock

from app.equipment_preventive_reminder import equipment_is_preventive_reminder_only


def _equipment(**kwargs):
    defaults = {
        "identificacao": "Split sala",
        "fabricante": None,
        "modelo": None,
        "serial": None,
        "capacidade_btu": None,
        "preventive_reminder_only": False,
    }
    defaults.update(kwargs)
    return MagicMock(**defaults)


def test_flagged_equipment_is_preventive_reminder_only():
    assert equipment_is_preventive_reminder_only(_equipment(preventive_reminder_only=True)) is True


def test_full_registration_equipment_is_not_preventive_reminder_only():
    assert (
        equipment_is_preventive_reminder_only(
            _equipment(
                identificacao="Split sala",
                fabricante="LG",
                modelo="S12",
                serial="ABC123",
            )
        )
        is False
    )


def test_legacy_heuristic_minimal_equipment_is_preventive_reminder_only():
    assert equipment_is_preventive_reminder_only(_equipment(identificacao="ar-condicionado")) is True


def test_legacy_heuristic_cadastro_temporario_label():
    assert equipment_is_preventive_reminder_only(_equipment(identificacao="Aparelho (cadastro temporário)")) is True
