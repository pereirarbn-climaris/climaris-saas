"""Planos de acesso e assinatura Stripe (tenant admin)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.dashboard_entitlements import dashboard_tier_label
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.plan_rules import normalize_plan_key
from app.saas_plan_effective import plan_label_and_max_users_for_key
from app.dashboard_entitlements import dashboard_tier_label
from app.schemas import (
    BillingCheckoutRequest,
    BillingCheckoutResponse,
    BillingPlanOut,
    BillingPortalResponse,
    BillingStatusOut,
    BillingSubscriptionActionResponse,
    BillingSyncSubscriptionResponse,
)
from app.stripe_billing import (
    cancel_tenant_subscription,
    create_customer_portal_session,
    get_contractable_plans,
    require_stripe_credentials,
    resolve_subscribed_plan_key,
    resume_tenant_subscription,
    subscribe_or_change_plan,
    sync_tenant_subscription_from_stripe,
)
from app.stripe_credentials import resolve_stripe_credentials, stripe_configured
from app.tenant_subscription import has_active_stripe_subscription, subscription_snapshot
from models import Tenant, User, UserRole

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans", response_model=list[BillingPlanOut])
def list_billing_plans(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[BillingPlanOut]:
    rows = get_contractable_plans(db)
    return [
        BillingPlanOut(
            plan_key=r.plan_key,
            display_name=r.display_name,
            description=r.description,
            footnote=r.footnote,
            finance_max_mode=r.finance_max_mode,
            dashboard_tier=(r.dashboard_tier or "basic").strip().lower(),  # type: ignore[arg-type]
            dashboard_label=dashboard_tier_label((r.dashboard_tier or "basic").strip().lower()),
            max_users=r.max_users,
            monthly_price_brl=float(r.monthly_price_brl) if r.monthly_price_brl is not None else None,
            sort_order=r.sort_order,
        )
        for r in rows
    ]


@router.get("/status", response_model=BillingStatusOut)
def billing_status(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> BillingStatusOut:
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace não encontrado.")
    if stripe_configured(db) and tenant.stripe_customer_id:
        creds = resolve_stripe_credentials(db)
        if creds is not None:
            if sync_tenant_subscription_from_stripe(db, creds, tenant, changed_by_email=current_user.email):
                db.commit()
                db.refresh(tenant)
    snap = subscription_snapshot(tenant)
    subscribed_key = resolve_subscribed_plan_key(db, tenant)
    display_key = subscribed_key or snap.active_plan
    label, max_users = plan_label_and_max_users_for_key(db, display_key)
    return BillingStatusOut(
        active_plan=snap.active_plan,
        active_plan_label=label,
        max_users=max_users,
        subscribed_plan_key=subscribed_key,
        subscription_status=tenant.subscription_status,
        subscription_current_period_end=tenant.subscription_current_period_end,
        stripe_configured=stripe_configured(db),
        has_stripe_customer=bool(tenant.stripe_customer_id),
        has_active_subscription=snap.has_active_stripe_subscription,
        trial_ends_at=snap.trial_ends_at,
        trial_days_remaining=snap.trial_days_remaining,
        is_on_free_trial=snap.is_on_free_trial,
        is_trial_expired=snap.is_trial_expired,
        has_paid_access=snap.has_paid_access,
        subscription_access_blocked=snap.subscription_access_blocked,
        subscription_cancel_at_period_end=bool(tenant.subscription_cancel_at_period_end),
        subscription_ends_at=tenant.subscription_ends_at,
    )


@router.post("/checkout", response_model=BillingCheckoutResponse)
def billing_checkout(
    payload: BillingCheckoutRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> BillingCheckoutResponse:
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace não encontrado.")
    creds = require_stripe_credentials(db)
    url, upgraded = subscribe_or_change_plan(db, creds, tenant, current_user, payload.plan_key)
    db.commit()
    return BillingCheckoutResponse(checkout_url=url, upgraded_in_place=upgraded)


@router.post("/sync-subscription", response_model=BillingSyncSubscriptionResponse)
def billing_sync_subscription(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> BillingSyncSubscriptionResponse:
    """Sincroniza plano/status com a assinatura Stripe (ex.: retorno do checkout)."""
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace não encontrado.")
    creds = require_stripe_credentials(db)
    synced = sync_tenant_subscription_from_stripe(
        db, creds, tenant, changed_by_email=current_user.email
    )
    db.commit()
    snap = subscription_snapshot(tenant)
    return BillingSyncSubscriptionResponse(
        synced=synced,
        active_plan=snap.active_plan,
        has_active_subscription=snap.has_active_stripe_subscription,
    )


@router.post("/cancel-subscription", response_model=BillingSubscriptionActionResponse)
def billing_cancel_subscription(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> BillingSubscriptionActionResponse:
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace não encontrado.")
    creds = require_stripe_credentials(db)
    cancel_tenant_subscription(db, creds, tenant, current_user, at_period_end=True)
    db.commit()
    db.refresh(tenant)
    ends = tenant.subscription_ends_at
    return BillingSubscriptionActionResponse(
        subscription_status=tenant.subscription_status,
        subscription_cancel_at_period_end=bool(tenant.subscription_cancel_at_period_end),
        subscription_ends_at=ends,
        message="Assinatura cancelada. O acesso permanece até o fim do período já pago.",
    )


@router.post("/resume-subscription", response_model=BillingSubscriptionActionResponse)
def billing_resume_subscription(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> BillingSubscriptionActionResponse:
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace não encontrado.")
    creds = require_stripe_credentials(db)
    resume_tenant_subscription(db, creds, tenant, current_user)
    db.commit()
    db.refresh(tenant)
    return BillingSubscriptionActionResponse(
        subscription_status=tenant.subscription_status,
        subscription_cancel_at_period_end=bool(tenant.subscription_cancel_at_period_end),
        subscription_ends_at=tenant.subscription_ends_at,
        message="Cancelamento desfeito. Sua assinatura continuará renovando normalmente.",
    )


@router.post("/portal", response_model=BillingPortalResponse)
def billing_portal(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> BillingPortalResponse:
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace não encontrado.")
    creds = require_stripe_credentials(db)
    url = create_customer_portal_session(db, creds, tenant, current_user)
    db.commit()
    return BillingPortalResponse(portal_url=url)
