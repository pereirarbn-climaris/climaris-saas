"""Regras de trial, assinatura Stripe e bloqueio de acesso ao app."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.plan_rules import get_plan_definition, normalize_plan_key
from models import Tenant, TenantStatus

TRIAL_DAYS = 30
TRIAL_EXPIRING_DAYS = 7

_PAID_SUBSCRIPTION_STATUSES = frozenset({"active", "trialing", "past_due"})


@dataclass(frozen=True)
class TenantSubscriptionSnapshot:
    active_plan: str
    trial_ends_at: datetime | None
    trial_days_remaining: int | None
    is_on_free_trial: bool
    is_trial_expired: bool
    has_active_stripe_subscription: bool
    has_paid_access: bool
    subscription_access_blocked: bool
    subscription_status: str | None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def trial_ends_at(tenant: Tenant) -> datetime:
    created = tenant.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return created + timedelta(days=TRIAL_DAYS)


def _stripe_trial_consumed(tenant: Tenant) -> bool:
    """Trial de boas-vindas encerra após qualquer assinatura Stripe (ativa ou cancelada)."""
    if not tenant.stripe_customer_id:
        return False
    status = (tenant.subscription_status or "").strip().lower()
    return status in _PAID_SUBSCRIPTION_STATUSES | {"canceled", "unpaid"}


def is_on_free_trial(tenant: Tenant, *, now: datetime | None = None) -> bool:
    now = now or _now()
    if normalize_plan_key(tenant.active_plan) != "free_30d":
        return False
    if tenant.status != TenantStatus.ACTIVE:
        return False
    if _stripe_trial_consumed(tenant):
        return False
    return now < trial_ends_at(tenant)


def is_trial_expired(tenant: Tenant, *, now: datetime | None = None) -> bool:
    now = now or _now()
    if normalize_plan_key(tenant.active_plan) != "free_30d":
        return False
    return now >= trial_ends_at(tenant)


def has_active_stripe_subscription(tenant: Tenant) -> bool:
    status = (tenant.subscription_status or "").strip().lower()
    return status in _PAID_SUBSCRIPTION_STATUSES and bool(tenant.stripe_subscription_id)


def _subscription_grace_active(tenant: Tenant, *, now: datetime | None = None) -> bool:
    """Acesso até o fim do período já pago após agendar cancelamento."""
    now = now or _now()
    if not tenant.subscription_cancel_at_period_end and not tenant.subscription_ends_at:
        return False
    ends = tenant.subscription_ends_at
    if ends is None:
        return False
    if ends.tzinfo is None:
        ends = ends.replace(tzinfo=timezone.utc)
    return now < ends


def has_paid_plan_access(tenant: Tenant, *, now: datetime | None = None) -> bool:
    now = now or _now()
    if tenant.status != TenantStatus.ACTIVE:
        return False
    plan_key = normalize_plan_key(tenant.active_plan)
    plan_def = get_plan_definition(plan_key)
    if plan_def.is_beta_internal:
        return True
    if has_active_stripe_subscription(tenant):
        ends = tenant.subscription_ends_at
        if ends is not None:
            if ends.tzinfo is None:
                ends = ends.replace(tzinfo=timezone.utc)
            if now >= ends:
                return False
        return True
    if _subscription_grace_active(tenant, now=now) and plan_key != "free_30d":
        return True
    if plan_key == "free_30d":
        return is_on_free_trial(tenant, now=now)
    return False


def is_app_access_blocked(tenant: Tenant, *, now: datetime | None = None) -> bool:
    now = now or _now()
    if tenant.status == TenantStatus.CANCELLED:
        return True
    if tenant.status == TenantStatus.SUSPENDED:
        return True
    return not has_paid_plan_access(tenant, now=now)


def trial_days_remaining(tenant: Tenant, *, now: datetime | None = None) -> int | None:
    now = now or _now()
    if not is_on_free_trial(tenant, now=now):
        return None
    delta = trial_ends_at(tenant) - now
    return max(0, int(delta.total_seconds() // 86400))


def subscription_snapshot(tenant: Tenant, *, now: datetime | None = None) -> TenantSubscriptionSnapshot:
    now = now or _now()
    plan_key = normalize_plan_key(tenant.active_plan)
    on_trial = is_on_free_trial(tenant, now=now)
    return TenantSubscriptionSnapshot(
        active_plan=plan_key,
        trial_ends_at=trial_ends_at(tenant) if plan_key == "free_30d" else None,
        trial_days_remaining=trial_days_remaining(tenant, now=now),
        is_on_free_trial=on_trial,
        is_trial_expired=is_trial_expired(tenant, now=now),
        has_active_stripe_subscription=has_active_stripe_subscription(tenant),
        has_paid_access=has_paid_plan_access(tenant, now=now),
        subscription_access_blocked=is_app_access_blocked(tenant, now=now),
        subscription_status=tenant.subscription_status,
    )


def remaining_trial_seconds_for_stripe(tenant: Tenant, *, now: datetime | None = None) -> int | None:
    """Segundos restantes de trial gratuito para repassar ao Stripe Checkout."""
    now = now or _now()
    if not is_on_free_trial(tenant, now=now):
        return None
    remaining = trial_ends_at(tenant) - now
    seconds = int(remaining.total_seconds())
    return seconds if seconds >= 86400 else None
