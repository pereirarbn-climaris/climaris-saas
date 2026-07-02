"""Limites de produtos efetivos por plano + preferências do tenant."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.saas_plan_effective import plan_allows_product_inventory, plan_allows_product_purchases, plan_products_max_images
from models import Tenant


def tenant_inventory_enabled(db: Session, tenant_id: int) -> bool:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return False
    if not plan_allows_product_inventory(db, tenant):
        return False
    return bool(tenant.inventory_enabled)


def tenant_purchases_enabled(db: Session, tenant_id: int) -> bool:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return False
    return plan_allows_product_purchases(db, tenant)


def tenant_products_max_images(db: Session, tenant_id: int) -> int | None:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return 0
    return plan_products_max_images(db, tenant)
