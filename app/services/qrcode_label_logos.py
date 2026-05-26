"""Logo da empresa (tenant) para impressão de etiquetas QR."""

from __future__ import annotations

from sqlalchemy.orm import Session

from models import Client, Equipment, QrCode, Tenant


def tenant_has_logo(tenant: Tenant) -> bool:
    return bool(tenant.logo_s3_key or (tenant.logo_url or "").strip())


def resolve_qrcode_label_context(
    db: Session,
    *,
    tenant: Tenant,
    row: QrCode,
) -> tuple[int | None, bool]:
    """Retorna (client_id do equipamento vinculado, tenant_has_logo)."""
    has_logo = tenant_has_logo(tenant)
    equipment_id = row.linked_to_equipment_id
    if equipment_id is None:
        return None, has_logo

    equipment = db.get(Equipment, equipment_id)
    if equipment is None:
        return None, has_logo

    client = db.get(Client, equipment.client_id)
    if client is None or client.tenant_id != tenant.id:
        return None, has_logo

    return equipment.client_id, has_logo
