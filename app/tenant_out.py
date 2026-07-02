"""Serialização de `Tenant` com rótulo de plano para a UI do cliente."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.saas_plan_effective import effective_plan_label_and_max_users, effective_plan_products_settings
from app.schemas import TenantOut
from app.tenant_subscription import subscription_snapshot
from models import Tenant


def tenant_out_enriched(db: Session, tenant: Tenant) -> TenantOut:
    label, _max_users = effective_plan_label_and_max_users(db, tenant)
    products = effective_plan_products_settings(db, tenant)
    snap = subscription_snapshot(tenant)
    base = TenantOut.model_validate(tenant)
    inventory_effective = bool(tenant.inventory_enabled) and products.inventory_enabled
    return base.model_copy(
        update={
            "active_plan_label": label,
            "products_inventory_allowed": products.inventory_enabled,
            "products_purchases_enabled": products.purchases_enabled,
            "products_max_images": products.max_images,
            "inventory_enabled": inventory_effective,
            "trial_ends_at": snap.trial_ends_at,
            "trial_days_remaining": snap.trial_days_remaining,
            "is_on_free_trial": snap.is_on_free_trial,
            "is_trial_expired": snap.is_trial_expired,
            "has_paid_access": snap.has_paid_access,
            "subscription_access_blocked": snap.subscription_access_blocked,
            "has_active_stripe_subscription": snap.has_active_stripe_subscription,
        }
    )
