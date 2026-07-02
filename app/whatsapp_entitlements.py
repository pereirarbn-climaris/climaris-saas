"""Acesso ao módulo WhatsApp por plano SaaS ou contratação na Loja."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.marketplace_util import tenant_entitlement_status_for_slug, tenant_has_marketplace_app
from app.plan_rules import get_plan_definition
from models import Tenant


def tenant_whatsapp_module_active(db: Session, tenant_id: int) -> bool:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return False
    plan = get_plan_definition(tenant.active_plan)
    if plan.is_beta_internal or plan.whatsapp_module_included:
        return True
    return tenant_has_marketplace_app(db, tenant_id, "whatsapp")


def require_whatsapp_module(db: Session, tenant_id: int) -> None:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    if tenant_whatsapp_module_active(db, tenant_id):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Módulo WhatsApp não contratado. Solicite na Loja de integrações.",
    )


def whatsapp_module_status_payload(db: Session, tenant_id: int) -> dict[str, bool | str | None]:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    plan_def = get_plan_definition(tenant.active_plan)
    active = tenant_whatsapp_module_active(db, tenant_id)
    ent_status = tenant_entitlement_status_for_slug(db, tenant_id, "whatsapp")
    if active and (plan_def.is_beta_internal or plan_def.whatsapp_module_included):
        status_label = plan_def.key
    elif ent_status is not None:
        status_label = ent_status.value
    else:
        status_label = plan_def.key if active else None
    return {
        "entitlement_active": active,
        "entitlement_status": status_label,
        "blocked_reason": None if active else "Módulo WhatsApp não contratado ou ainda não aprovado.",
    }
