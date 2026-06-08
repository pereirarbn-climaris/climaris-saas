"""Preferências de controle de estoque por tenant."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Tenant


def tenant_inventory_enabled(db: Session, tenant_id: int) -> bool:
    enabled = db.scalar(select(Tenant.inventory_enabled).where(Tenant.id == tenant_id))
    if enabled is None:
        return True
    return bool(enabled)
