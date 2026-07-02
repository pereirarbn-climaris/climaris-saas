"""Equipamentos criados só para lembretes na Gestão preventiva — ocultos do cadastro do cliente."""

from __future__ import annotations

from models import Equipment


def _legacy_heuristic_temporary_preventive(equipment: Equipment) -> bool:
    ident = (equipment.identificacao or "").strip().lower()
    if "cadastro temporário" in ident or "cadastro temporario" in ident:
        return True
    return (
        not (equipment.fabricante or "").strip()
        and not (equipment.modelo or "").strip()
        and not (equipment.serial or "").strip()
        and not (equipment.capacidade_btu or 0)
    )


def equipment_is_preventive_reminder_only(equipment: Equipment) -> bool:
    """True quando o aparelho existe apenas para lembretes da gestão preventiva."""
    if bool(getattr(equipment, "preventive_reminder_only", False)):
        return True
    return _legacy_heuristic_temporary_preventive(equipment)
