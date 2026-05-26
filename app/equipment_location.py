"""Formatação de rótulos de localização de equipamentos."""

from __future__ import annotations


def format_equipment_location_label(
    *,
    identificacao: str | None,
    local_instalacao: str | None = None,
    installation_reference: str | None = None,
    equipment_id: int | None = None,
) -> str:
    base = (identificacao or "").strip() or (
        f"Equipamento #{equipment_id}" if equipment_id is not None else "Equipamento"
    )
    parts: list[str] = []
    local = (local_instalacao or "").strip()
    if local and local.lower() != base.lower():
        parts.append(local)
    reference = (installation_reference or "").strip()
    if reference:
        parts.append(reference)
    return f"{base} ({' · '.join(parts)})" if parts else base
