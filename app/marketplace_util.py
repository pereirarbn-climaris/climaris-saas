"""Helpers para verificar contratação de apps da loja (integrações pagas)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import MarketplaceApp, MarketplaceEntitlementStatus, TenantMarketplaceEntitlement


def tenant_has_marketplace_app(db: Session, tenant_id: int, app_slug: str) -> bool:
    """True se o tenant tem entitlement **active** para o slug informado."""
    row = db.execute(
        select(TenantMarketplaceEntitlement.id)
        .join(MarketplaceApp, TenantMarketplaceEntitlement.marketplace_app_id == MarketplaceApp.id)
        .where(
            TenantMarketplaceEntitlement.tenant_id == tenant_id,
            MarketplaceApp.slug == app_slug,
            TenantMarketplaceEntitlement.status == MarketplaceEntitlementStatus.ACTIVE,
        )
        .limit(1)
    ).scalar_one_or_none()
    return row is not None


def tenant_entitlement_status_for_slug(
    db: Session, tenant_id: int, app_slug: str
) -> MarketplaceEntitlementStatus | None:
    """Status atual do entitlement do tenant para o app, ou None se não existir."""
    row = db.execute(
        select(TenantMarketplaceEntitlement.status)
        .join(MarketplaceApp, TenantMarketplaceEntitlement.marketplace_app_id == MarketplaceApp.id)
        .where(
            TenantMarketplaceEntitlement.tenant_id == tenant_id,
            MarketplaceApp.slug == app_slug,
        )
        .limit(1)
    ).scalar_one_or_none()
    return row
