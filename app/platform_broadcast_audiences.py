"""Públicos segmentados para avisos da plataforma SaaS."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.plan_rules import normalize_plan_key
from app.tenant_subscription import TRIAL_DAYS, is_on_free_trial, is_trial_expired
from models import Tenant, TenantStatus, User

PlatformBroadcastAudience = Literal[
    "all",
    "new_tenants",
    "trial",
    "trial_expiring",
    "unpaid",
    "paid",
]

AUDIENCE_LABELS: dict[str, str] = {
    "all": "Todos os workspaces ativos",
    "new_tenants": "Novos clientes (últimos 7 dias)",
    "trial": "Em período de teste (Free 30 dias)",
    "trial_expiring": "Teste expirando (próximos 7 dias)",
    "unpaid": "Inadimplentes / teste vencido",
    "paid": "Clientes pagantes",
}

NEW_TENANT_DAYS = 7
TRIAL_EXPIRING_DAYS = 7

VALID_AUDIENCES = frozenset(AUDIENCE_LABELS.keys())


def validate_audience(audience: str) -> str:
    key = (audience or "all").strip().lower()
    if key not in VALID_AUDIENCES:
        raise ValueError(f"Público inválido: {audience}")
    return key


def tenant_matches_audience(
    tenant: Tenant,
    audience: str,
    *,
    now: datetime | None = None,
) -> bool:
    now = now or datetime.now(timezone.utc)
    audience = validate_audience(audience)
    plan = normalize_plan_key(tenant.active_plan)
    trial_end = tenant.created_at + timedelta(days=TRIAL_DAYS)

    if audience == "all":
        return tenant.status == TenantStatus.ACTIVE
    if audience == "new_tenants":
        return tenant.status == TenantStatus.ACTIVE and tenant.created_at >= now - timedelta(days=NEW_TENANT_DAYS)
    if audience == "trial":
        return tenant.status == TenantStatus.ACTIVE and is_on_free_trial(tenant, now=now)
    if audience == "trial_expiring":
        if tenant.status != TenantStatus.ACTIVE or not is_on_free_trial(tenant, now=now):
            return False
        return now < trial_end <= now + timedelta(days=TRIAL_EXPIRING_DAYS)
    if audience == "unpaid":
        if tenant.status == TenantStatus.SUSPENDED:
            return True
        return tenant.status == TenantStatus.ACTIVE and is_trial_expired(tenant, now=now) and plan == "free_30d"
    if audience == "paid":
        return tenant.status == TenantStatus.ACTIVE and plan != "free_30d"
    return False


def resolve_broadcast_recipients(
    db: Session,
    audience: str,
    *,
    now: datetime | None = None,
) -> tuple[list[tuple[int, int]], int]:
    """Retorna ([(user_id, tenant_id), ...], tenant_count) para o público indicado."""
    now = now or datetime.now(timezone.utc)
    audience = validate_audience(audience)

    tenants = db.execute(select(Tenant)).scalars().all()
    tenant_ids = [t.id for t in tenants if tenant_matches_audience(t, audience, now=now)]
    if not tenant_ids:
        return [], 0

    recipients = db.execute(
        select(User.id, User.tenant_id).where(
            User.is_active.is_(True),
            User.tenant_id.in_(tenant_ids),
        )
    ).all()
    return [(int(uid), int(tid)) for uid, tid in recipients], len(tenant_ids)


def preview_broadcast_audience(db: Session, audience: str) -> dict[str, int | str]:
    audience = validate_audience(audience)
    recipients, tenant_count = resolve_broadcast_recipients(db, audience)
    return {
        "audience": audience,
        "audience_label": AUDIENCE_LABELS[audience],
        "user_count": len(recipients),
        "tenant_count": tenant_count,
    }
