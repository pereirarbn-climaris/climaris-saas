"""Add-ons da loja como itens de assinatura Stripe."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

import stripe
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.stripe_billing import (
    STRIPE_TENANT_METADATA_KEY,
    _configure_stripe,
    _existing_stripe_price_matches,
    _money_to_cents,
    _stripe_field,
    get_or_create_stripe_customer,
)
from app.stripe_credentials import StripeCredentials
from app.tenant_subscription import has_active_stripe_subscription
from models import MarketplaceApp, MarketplaceEntitlementStatus, Tenant, TenantMarketplaceEntitlement, User

STRIPE_MARKETPLACE_METADATA_KEY = "climaris_marketplace_slug"


def sync_marketplace_app_to_stripe(db: Session, creds: StripeCredentials, app: MarketplaceApp) -> MarketplaceApp:
    if float(app.monthly_price_brl or 0) <= 0:
        raise HTTPException(status_code=400, detail="Defina preço mensal maior que zero antes de sincronizar com Stripe.")

    _configure_stripe(creds)
    metadata = {STRIPE_MARKETPLACE_METADATA_KEY: app.slug}

    if app.stripe_product_id:
        stripe.Product.modify(
            app.stripe_product_id,
            name=app.display_name,
            description=(app.short_description or "")[:500] or None,
            metadata=metadata,
            active=True,
        )
    else:
        product = stripe.Product.create(
            name=app.display_name,
            description=(app.short_description or "")[:500] or None,
            metadata=metadata,
        )
        app.stripe_product_id = product.id

    unit_amount = _money_to_cents(app.monthly_price_brl)
    if app.stripe_price_id:
        existing = stripe.Price.retrieve(app.stripe_price_id)
        if _existing_stripe_price_matches(
            existing,
            unit_amount=unit_amount,
            product_id=app.stripe_product_id or "",
        ):
            db.add(app)
            db.flush()
            return app
        stripe.Price.modify(app.stripe_price_id, active=False)

    price = stripe.Price.create(
        product=app.stripe_product_id,
        unit_amount=unit_amount,
        currency="brl",
        recurring={"interval": "month"},
        metadata=metadata,
    )
    app.stripe_price_id = price.id
    db.add(app)
    db.flush()
    return app


def _find_subscription_item_for_price(subscription, price_id: str):
    items = _stripe_field(subscription, "items", {})
    data = _stripe_field(items, "data")
    if not isinstance(data, list):
        return None
    for item in data:
        price = _stripe_field(item, "price")
        if _stripe_field(price, "id") == price_id:
            return item
    return None


def add_marketplace_addon_to_subscription(
    db: Session,
    creds: StripeCredentials,
    tenant: Tenant,
    admin_user: User,
    app: MarketplaceApp,
    quantity: int,
) -> TenantMarketplaceEntitlement:
    if quantity < 1:
        raise HTTPException(status_code=400, detail="Quantidade inválida.")
    if not has_active_stripe_subscription(tenant):
        raise HTTPException(
            status_code=400,
            detail="Assine um plano principal antes de contratar add-ons com cobrança automática.",
        )
    if not app.stripe_price_id:
        raise HTTPException(status_code=503, detail="Add-on ainda não vinculado ao Stripe.")

    _configure_stripe(creds)
    get_or_create_stripe_customer(db, creds, tenant, admin_user)
    sub = stripe.Subscription.retrieve(tenant.stripe_subscription_id, expand=["items.data.price"])

    existing_item = _find_subscription_item_for_price(sub, app.stripe_price_id)
    if existing_item:
        new_qty = int(_stripe_field(existing_item, "quantity") or 0) + quantity
        updated = stripe.Subscription.modify(
            tenant.stripe_subscription_id,
            items=[{"id": _stripe_field(existing_item, "id"), "quantity": new_qty}],
            proration_behavior="create_prorations",
            metadata={STRIPE_TENANT_METADATA_KEY: str(tenant.id)},
        )
        item_id = _stripe_field(existing_item, "id")
        final_qty = new_qty
    else:
        updated = stripe.Subscription.modify(
            tenant.stripe_subscription_id,
            items=[{"price": app.stripe_price_id, "quantity": quantity}],
            proration_behavior="create_prorations",
            metadata={STRIPE_TENANT_METADATA_KEY: str(tenant.id)},
        )
        created_item = _find_subscription_item_for_price(updated, app.stripe_price_id)
        if created_item is None:
            raise HTTPException(status_code=502, detail="Stripe não retornou o item do add-on.")
        item_id = str(_stripe_field(created_item, "id"))
        final_qty = quantity

    ent = db.execute(
        select(TenantMarketplaceEntitlement).where(
            TenantMarketplaceEntitlement.tenant_id == tenant.id,
            TenantMarketplaceEntitlement.marketplace_app_id == app.id,
        )
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if ent is None:
        ent = TenantMarketplaceEntitlement(
            tenant_id=tenant.id,
            marketplace_app_id=app.id,
            quantity=final_qty,
        )
    else:
        ent.quantity = final_qty
    ent.status = MarketplaceEntitlementStatus.ACTIVE
    ent.stripe_subscription_item_id = item_id
    ent.activated_at = ent.activated_at or now
    db.add(ent)
    db.flush()
    return ent


def sync_marketplace_entitlements_from_subscription(db: Session, tenant: Tenant, subscription) -> None:
    items = _stripe_field(subscription, "items", {})
    data = _stripe_field(items, "data")
    if not isinstance(data, list):
        return

    active_item_ids: set[str] = set()
    now = datetime.now(timezone.utc)

    for item in data:
        price = _stripe_field(item, "price")
        price_id = _stripe_field(price, "id")
        if not isinstance(price_id, str):
            continue
        app = db.execute(
            select(MarketplaceApp).where(MarketplaceApp.stripe_price_id == price_id).limit(1)
        ).scalar_one_or_none()
        if app is None:
            continue

        item_id = str(_stripe_field(item, "id") or "")
        qty = int(_stripe_field(item, "quantity") or 1)
        active_item_ids.add(item_id)

        ent = db.execute(
            select(TenantMarketplaceEntitlement).where(
                TenantMarketplaceEntitlement.tenant_id == tenant.id,
                TenantMarketplaceEntitlement.marketplace_app_id == app.id,
            )
        ).scalar_one_or_none()
        if ent is None:
            ent = TenantMarketplaceEntitlement(
                tenant_id=tenant.id,
                marketplace_app_id=app.id,
                quantity=qty,
            )
        ent.quantity = qty
        ent.status = MarketplaceEntitlementStatus.ACTIVE
        ent.stripe_subscription_item_id = item_id or None
        ent.activated_at = ent.activated_at or now
        db.add(ent)

    stale = db.execute(
        select(TenantMarketplaceEntitlement)
        .join(MarketplaceApp, TenantMarketplaceEntitlement.marketplace_app_id == MarketplaceApp.id)
        .where(
            TenantMarketplaceEntitlement.tenant_id == tenant.id,
            TenantMarketplaceEntitlement.stripe_subscription_item_id.is_not(None),
            MarketplaceApp.stripe_price_id.is_not(None),
        )
    ).scalars().all()
    for ent in stale:
        item_id = ent.stripe_subscription_item_id or ""
        if item_id and item_id not in active_item_ids:
            ent.status = MarketplaceEntitlementStatus.CANCELLED
            ent.stripe_subscription_item_id = None
            db.add(ent)
