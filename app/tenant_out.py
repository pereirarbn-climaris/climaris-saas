"""Serialização de `Tenant` com rótulo de plano para a UI do cliente."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.saas_plan_effective import effective_plan_label_and_max_users
from app.schemas import TenantOut
from models import Tenant


def tenant_out_enriched(db: Session, tenant: Tenant) -> TenantOut:
    label, _max_users = effective_plan_label_and_max_users(db, tenant)
    base = TenantOut.model_validate(tenant)
    return base.model_copy(update={"active_plan_label": label})
