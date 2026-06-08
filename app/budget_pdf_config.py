from __future__ import annotations

from dataclasses import dataclass

from models import Budget, BudgetTemplateSettings, Tenant


@dataclass(frozen=True)
class TemplateConfig:
    template_key: str
    brand_color: str
    warranty_text: str | None
    payment_terms_text: str | None
    technical_notes_text: str | None


def resolve_template_config(
    *,
    tenant: Tenant,
    settings: BudgetTemplateSettings | None,
    budget: Budget,
) -> TemplateConfig:
    template_key = (settings.template_key if settings else "classic").strip().lower()
    if template_key not in {"classic", "professional"}:
        template_key = "classic"

    brand = (settings.brand_color if settings else None) or getattr(tenant, "pdf_primary_color", None) or "#0B7FAF"

    warranty = (budget.warranty_terms or "").strip() or (
        (settings.default_warranty_terms or "").strip() if settings else ""
    ) or None
    payment = (budget.payment_terms or "").strip() or (
        (settings.default_payment_terms or "").strip() if settings else ""
    ) or None
    technical = (budget.description or "").strip() or (
        (settings.default_technical_notes or "").strip() if settings else ""
    ) or None

    return TemplateConfig(
        template_key=template_key,
        brand_color=brand,
        warranty_text=warranty,
        payment_terms_text=payment,
        technical_notes_text=technical,
    )
