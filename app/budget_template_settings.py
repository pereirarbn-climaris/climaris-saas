from __future__ import annotations

import re
from datetime import datetime, timezone
from types import SimpleNamespace

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.budget_pdf import build_budget_pdf
from app.schemas_budget_template import BudgetTemplateSettingsPatch
from models import BudgetTemplateSettings, Tenant


def _normalize_hex_color(raw: str | None, fallback: str = "#0B7FAF") -> str:
    color = str(raw or fallback).strip().upper()
    if not re.fullmatch(r"#[0-9A-F]{6}", color):
        return fallback
    return color


def _normalize_template_key(raw: str | None) -> str:
    key = str(raw or "classic").strip().lower()
    if key in {"classic", "professional", "modelo1", "modelo2", "1", "2"}:
        if key in {"professional", "modelo2", "2"}:
            return "professional"
        return "classic"
    return "classic"


def get_budget_template_settings(db: Session, *, tenant_id: int) -> dict:
    row = _get_or_create_row(db, tenant_id=tenant_id)
    return _row_to_dict(row)


def patch_budget_template_settings(
    db: Session,
    *,
    tenant_id: int,
    payload: BudgetTemplateSettingsPatch,
) -> dict:
    row = _get_or_create_row(db, tenant_id=tenant_id)
    data = payload.model_dump(exclude_unset=True)
    if "template_key" in data and data["template_key"] is not None:
        row.template_key = _normalize_template_key(data["template_key"])
    if "brand_color" in data and data["brand_color"] is not None:
        row.brand_color = _normalize_hex_color(data["brand_color"], row.brand_color)
    if "default_warranty_terms" in data:
        row.default_warranty_terms = data["default_warranty_terms"]
    if "default_payment_terms" in data:
        row.default_payment_terms = data["default_payment_terms"]
    if "default_technical_notes" in data:
        row.default_technical_notes = data["default_technical_notes"]
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


def apply_budget_defaults_from_settings(
    db: Session,
    *,
    tenant_id: int,
    payment_terms: str | None,
    warranty_terms: str | None,
    observation: str | None,
) -> tuple[str | None, str | None, str | None]:
    row = db.execute(
        select(BudgetTemplateSettings).where(BudgetTemplateSettings.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if row is None:
        return payment_terms, warranty_terms, observation
    pt = (payment_terms or "").strip() or (row.default_payment_terms or "").strip() or None
    wt = (warranty_terms or "").strip() or (row.default_warranty_terms or "").strip() or None
    obs = (observation or "").strip() or (row.default_technical_notes or "").strip() or None
    return pt, wt, obs


def _get_or_create_row(db: Session, *, tenant_id: int) -> BudgetTemplateSettings:
    row = db.execute(
        select(BudgetTemplateSettings).where(BudgetTemplateSettings.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if row is not None:
        return row
    tenant = db.get(Tenant, tenant_id)
    brand = _normalize_hex_color(getattr(tenant, "pdf_primary_color", None) if tenant else None)
    row = BudgetTemplateSettings(tenant_id=tenant_id, template_key="classic", brand_color=brand)
    db.add(row)
    db.flush()
    return row


def _row_to_dict(row: BudgetTemplateSettings) -> dict:
    return {
        "template_key": row.template_key,
        "brand_color": row.brand_color,
        "default_warranty_terms": row.default_warranty_terms,
        "default_payment_terms": row.default_payment_terms,
        "default_technical_notes": row.default_technical_notes,
    }


def draft_settings_row(
    db: Session,
    tenant_id: int,
    payload: BudgetTemplateSettingsPatch,
) -> BudgetTemplateSettings:
    """Configuração efetiva para pré-visualização (rascunho + valores salvos)."""
    base = _get_or_create_row(db, tenant_id=tenant_id)
    data = payload.model_dump(exclude_unset=True)
    return BudgetTemplateSettings(
        tenant_id=tenant_id,
        template_key=_normalize_template_key(data.get("template_key", base.template_key)),
        brand_color=_normalize_hex_color(data.get("brand_color"), base.brand_color),
        default_warranty_terms=(
            data["default_warranty_terms"] if "default_warranty_terms" in data else base.default_warranty_terms
        ),
        default_payment_terms=(
            data["default_payment_terms"] if "default_payment_terms" in data else base.default_payment_terms
        ),
        default_technical_notes=(
            data["default_technical_notes"] if "default_technical_notes" in data else base.default_technical_notes
        ),
    )


def _sample_budget_for_preview(*, tenant: Tenant, settings: BudgetTemplateSettings) -> SimpleNamespace:
    client = SimpleNamespace(
        name="Cliente Exemplo Ltda.",
        document="12.345.678/0001-90",
        phone="(11) 98765-4321",
        whatsapp="(11) 98765-4321",
        email="contato@clienteexemplo.com.br",
        address_street="Rua das Flores",
        address_number="120",
        address_complement="Sala 2",
        address_district="Centro",
        address_city="São Paulo",
        address_state="SP",
        address_postal_code="01310100",
    )
    service = SimpleNamespace(
        name="Limpeza e higienização — split",
        description="Higienização completa com produtos biodegradáveis.",
    )
    product = SimpleNamespace(name="Filtro de ar lavável")
    return SimpleNamespace(
        id=42,
        created_at=datetime.now(timezone.utc),
        validity_days=7,
        payment_method="PIX / Cartão",
        payment_terms=(settings.default_payment_terms or "50% na aprovação e 50% na conclusão.").strip(),
        warranty_terms=(settings.default_warranty_terms or "Garantia de 90 dias para mão de obra.").strip(),
        description=(settings.default_technical_notes or "Prazo sujeito à disponibilidade de peças.").strip(),
        client=client,
        service_items=[
            SimpleNamespace(service=service, service_id=1, quantity=1, unit_price=280.0),
        ],
        product_items=[
            SimpleNamespace(product=product, product_id=1, quantity=2, unit_price=65.0),
        ],
    )


def build_budget_template_preview_pdf(
    db: Session,
    *,
    tenant_id: int,
    payload: BudgetTemplateSettingsPatch,
    logo_url: str | None = None,
) -> bytes:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise ValueError("Tenant not found")
    settings = draft_settings_row(db, tenant_id, payload)
    sample = _sample_budget_for_preview(tenant=tenant, settings=settings)
    return build_budget_pdf(sample, tenant, logo_url=logo_url, template_settings=settings)
