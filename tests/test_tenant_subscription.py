"""Regras de trial e bloqueio de acesso."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.tenant_subscription import (
    TRIAL_DAYS,
    has_paid_plan_access,
    is_app_access_blocked,
    is_on_free_trial,
    trial_days_remaining,
)
from models import Tenant, TenantStatus


def _tenant(**kwargs) -> Tenant:
    defaults = dict(
        id=1,
        name="Test",
        cnpj="00000000000100",
        tax_id_kind="cnpj",
        active_plan="free_30d",
        finance_enabled=True,
        status=TenantStatus.ACTIVE,
        created_at=datetime.now(timezone.utc) - timedelta(days=5),
        subscription_status=None,
        stripe_subscription_id=None,
    )
    defaults.update(kwargs)
    return Tenant(**defaults)


def test_on_free_trial_within_period() -> None:
    tenant = _tenant()
    assert is_on_free_trial(tenant) is True
    assert trial_days_remaining(tenant) is not None
    assert trial_days_remaining(tenant) <= TRIAL_DAYS
    assert is_app_access_blocked(tenant) is False


def test_trial_expired_blocks_access() -> None:
    tenant = _tenant(created_at=datetime.now(timezone.utc) - timedelta(days=TRIAL_DAYS + 1))
    assert is_on_free_trial(tenant) is False
    assert is_app_access_blocked(tenant) is True
    assert has_paid_plan_access(tenant) is False


def test_active_stripe_subscription_allows_access() -> None:
    tenant = _tenant(
        created_at=datetime.now(timezone.utc) - timedelta(days=TRIAL_DAYS + 10),
        active_plan="basic",
        subscription_status="active",
        stripe_subscription_id="sub_123",
    )
    assert has_paid_plan_access(tenant) is True
    assert is_app_access_blocked(tenant) is False


def test_canceled_paid_plan_without_subscription_blocks_access() -> None:
    tenant = _tenant(
        created_at=datetime.now(timezone.utc) - timedelta(days=TRIAL_DAYS + 10),
        active_plan="basico",
        subscription_status="canceled",
        stripe_subscription_id=None,
    )
    assert has_paid_plan_access(tenant) is False
    assert is_app_access_blocked(tenant) is True


def test_canceled_stripe_customer_not_on_free_trial_banner() -> None:
    tenant = _tenant(
        active_plan="free_30d",
        subscription_status="canceled",
        stripe_subscription_id=None,
        stripe_customer_id="cus_test",
    )
    assert is_on_free_trial(tenant) is False
    assert trial_days_remaining(tenant) is None


def test_paid_plan_key_without_stripe_does_not_grant_access() -> None:
    tenant = _tenant(
        active_plan="basico",
        subscription_status=None,
        stripe_subscription_id=None,
    )
    assert has_paid_plan_access(tenant) is False
