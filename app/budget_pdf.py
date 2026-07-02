from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.budget_pdf_classic import build_classic_budget_pdf
from app.budget_pdf_config import resolve_template_config
from app.budget_pdf_professional import build_professional_budget_pdf
from models import Budget, BudgetTemplateSettings, Tenant


def _resolve_signature_url(
    settings: BudgetTemplateSettings | None,
    *,
    db: Session | None,
    signature_url: str | None,
) -> str | None:
    if signature_url:
        return signature_url
    if settings is None or not settings.signature_s3_key or db is None:
        return settings.signature_url if settings else None
    try:
        from app.tenant_logo import generate_tenant_logo_presigned_url

        return generate_tenant_logo_presigned_url(settings.signature_s3_key, db=db, expires_seconds=600)
    except Exception:
        return settings.signature_url


def build_budget_pdf(
    budget: Budget,
    tenant: Tenant,
    logo_url: str | None = None,
    *,
    db: Session | None = None,
    template_settings: BudgetTemplateSettings | None = None,
    signature_url: str | None = None,
) -> bytes:
    settings = template_settings
    if settings is None and db is not None:
        settings = db.execute(
            select(BudgetTemplateSettings).where(BudgetTemplateSettings.tenant_id == tenant.id)
        ).scalar_one_or_none()

    config = resolve_template_config(tenant=tenant, settings=settings, budget=budget)
    resolved_signature = _resolve_signature_url(settings, db=db, signature_url=signature_url)
    if config.template_key == "professional":
        return build_professional_budget_pdf(
            budget, tenant, config, logo_url=logo_url, signature_url=resolved_signature
        )
    return build_classic_budget_pdf(
        budget, tenant, config, logo_url=logo_url, signature_url=resolved_signature
    )
