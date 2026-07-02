from __future__ import annotations

from dataclasses import dataclass

from app.budget_text_presets import default_text_from_presets, ensure_presets_from_legacy, parse_presets_json
from models import Budget, BudgetTemplateSettings, Tenant


@dataclass(frozen=True)
class TemplateConfig:
    template_key: str
    brand_color: str
    font_color: str
    warranty_text: str | None
    payment_terms_text: str | None
    payment_method_text: str | None
    scope_text: str | None
    observations_text: str | None


def _text_from_settings_presets(
    settings: BudgetTemplateSettings | None,
    *,
    json_attr: str,
    default_attr: str,
    default_name: str,
) -> str | None:
    if settings is None:
        return None
    presets = ensure_presets_from_legacy(
        parse_presets_json(getattr(settings, json_attr, None)),
        getattr(settings, default_attr, None),
        default_name=default_name,
    )
    text = default_text_from_presets(presets)
    return text or None


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
    font = (settings.font_color if settings else None) or "#000000"

    warranty = (budget.warranty_terms or "").strip() or (
        _text_from_settings_presets(settings, json_attr="warranty_presets_json", default_attr="default_warranty_terms", default_name="Garantia padrão")
    ) or None
    payment = (budget.payment_terms or "").strip() or (
        _text_from_settings_presets(settings, json_attr="payment_presets_json", default_attr="default_payment_terms", default_name="Pagamento padrão")
    ) or None
    payment_method = (budget.payment_method or "").strip() or (
        _text_from_settings_presets(
            settings,
            json_attr="payment_method_presets_json",
            default_attr="default_payment_method",
            default_name="Forma padrão",
        )
    ) or None
    scope = (getattr(budget, "scope_text", None) or "").strip() or (
        _text_from_settings_presets(
            settings,
            json_attr="scope_presets_json",
            default_attr="default_scope_text",
            default_name="Escopo padrão",
        )
    ) or None
    observations = (budget.description or "").strip() or (
        _text_from_settings_presets(
            settings,
            json_attr="technical_presets_json",
            default_attr="default_technical_notes",
            default_name="Observações padrão",
        )
    ) or None

    return TemplateConfig(
        template_key=template_key,
        brand_color=brand,
        font_color=font,
        warranty_text=warranty,
        payment_terms_text=payment,
        payment_method_text=payment_method,
        scope_text=scope,
        observations_text=observations,
    )
