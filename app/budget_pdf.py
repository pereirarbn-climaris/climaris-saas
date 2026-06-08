from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.budget_pdf_classic import build_classic_budget_pdf
from app.budget_pdf_config import resolve_template_config
from app.budget_pdf_professional import build_professional_budget_pdf
from models import Budget, BudgetTemplateSettings, Tenant


def build_budget_pdf(
    budget: Budget,
    tenant: Tenant,
    logo_url: str | None = None,
    *,
    db: Session | None = None,
    template_settings: BudgetTemplateSettings | None = None,
) -> bytes:
    settings = template_settings
    if settings is None and db is not None:
        settings = db.execute(
            select(BudgetTemplateSettings).where(BudgetTemplateSettings.tenant_id == tenant.id)
        ).scalar_one_or_none()

    config = resolve_template_config(tenant=tenant, settings=settings, budget=budget)
    if config.template_key == "professional":
        return build_professional_budget_pdf(budget, tenant, config, logo_url=logo_url)
    return build_classic_budget_pdf(budget, tenant, config, logo_url=logo_url)
