"""Processamento de webhooks Stripe para assinaturas de planos."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.plan_rules import normalize_plan_key
from app.stripe_billing import (
    STRIPE_PLAN_METADATA_KEY,
    STRIPE_TENANT_METADATA_KEY,
    apply_subscription_to_tenant,
    change_tenant_plan,
    resolve_tenant_from_stripe_refs,
    sync_tenant_subscription_from_stripe,
)
from app.stripe_credentials import resolve_stripe_credentials
from app.stripe_marketplace import sync_marketplace_entitlements_from_subscription
from models import StripeWebhookEvent, Tenant

logger = logging.getLogger("erp.stripe_webhook")


def _already_processed(db: Session, event_id: str) -> bool:
    return db.get(StripeWebhookEvent, event_id) is not None


def _mark_processed(db: Session, event_id: str, event_type: str) -> None:
    db.add(StripeWebhookEvent(stripe_event_id=event_id, event_type=event_type))


def _tenant_from_object(db: Session, obj: dict[str, Any]) -> Tenant | None:
    metadata = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
    tenant_id = metadata.get(STRIPE_TENANT_METADATA_KEY)
    customer_id = obj.get("customer")
    subscription_id = obj.get("id") if obj.get("object") == "subscription" else obj.get("subscription")
    return resolve_tenant_from_stripe_refs(
        db,
        tenant_id=str(tenant_id) if tenant_id is not None else None,
        customer_id=str(customer_id) if customer_id else None,
        subscription_id=str(subscription_id) if subscription_id else None,
    )


def process_stripe_webhook_event(db: Session, event: dict[str, Any]) -> dict[str, str]:
    event_id = str(event.get("id") or "")
    event_type = str(event.get("type") or "")
    if not event_id:
        return {"status": "ignored", "reason": "missing_event_id"}

    if _already_processed(db, event_id):
        return {"status": "duplicate"}

    data = event.get("data", {})
    obj = data.get("object") if isinstance(data, dict) else None
    if not isinstance(obj, dict):
        _mark_processed(db, event_id, event_type)
        return {"status": "ignored", "reason": "missing_object"}

    if event_type == "checkout.session.completed":
        tenant = _tenant_from_object(db, obj)
        if tenant is None:
            ref = obj.get("client_reference_id")
            tenant = resolve_tenant_from_stripe_refs(db, tenant_id=str(ref) if ref else None)
        if tenant is not None:
            customer_id = obj.get("customer")
            if customer_id:
                tenant.stripe_customer_id = str(customer_id)
            subscription_id = obj.get("subscription")
            if subscription_id:
                tenant.stripe_subscription_id = str(subscription_id)
            creds = resolve_stripe_credentials(db)
            if creds and subscription_id:
                sync_tenant_subscription_from_stripe(db, creds, tenant)
            else:
                metadata = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
                plan_key = metadata.get(STRIPE_PLAN_METADATA_KEY)
                if isinstance(plan_key, str) and plan_key.strip():
                    change_tenant_plan(db, tenant, plan_key.strip(), changed_by_email="stripe")
                    tenant.subscription_status = tenant.subscription_status or "active"
            db.add(tenant)

    elif event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        tenant = _tenant_from_object(db, obj)
        if tenant is not None:
            if event_type == "customer.subscription.deleted":
                tenant.subscription_status = "canceled"
                tenant.stripe_subscription_id = None
                tenant.subscription_current_period_end = None
                tenant.subscription_cancel_at_period_end = False
                tenant.subscription_ends_at = None
                sync_marketplace_entitlements_from_subscription(db, tenant, {"items": {"data": []}})
                if normalize_plan_key(tenant.active_plan) != "beta_internal":
                    change_tenant_plan(db, tenant, "free_30d", changed_by_email="stripe")
                db.add(tenant)
            else:
                apply_subscription_to_tenant(db, tenant, obj)

    elif event_type == "invoice.payment_failed":
        tenant = _tenant_from_object(db, obj)
        if tenant is not None:
            tenant.subscription_status = "past_due"
            db.add(tenant)

    elif event_type == "invoice.paid":
        tenant = _tenant_from_object(db, obj)
        if tenant is not None:
            tenant.subscription_status = "active"
            subscription_id = obj.get("subscription")
            if subscription_id and not tenant.stripe_subscription_id:
                tenant.stripe_subscription_id = str(subscription_id)
            creds = resolve_stripe_credentials(db)
            if creds and tenant.stripe_subscription_id:
                sync_tenant_subscription_from_stripe(db, creds, tenant)
            db.add(tenant)

    _mark_processed(db, event_id, event_type)
    db.commit()
    logger.info("Stripe webhook processado event_id=%s type=%s", event_id, event_type)
    return {"status": "ok", "event_type": event_type}
