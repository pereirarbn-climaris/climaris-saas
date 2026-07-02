from __future__ import annotations

import re
from datetime import datetime, timezone
from types import SimpleNamespace

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.budget_pdf import build_budget_pdf
from app.budget_text_presets import (
    BudgetTextPreset,
    coerce_presets,
    default_text_from_presets,
    dumps_presets_json,
    ensure_presets_from_legacy,
    normalize_presets,
    parse_presets_json,
    presets_to_api,
)
from app.schemas_budget_template import BudgetTemplateSettingsPatch
from models import BudgetTemplateSettings, Tenant


def _normalize_hex_color(raw: str | None, fallback: str = "#0B7FAF", default: str | None = None) -> str:
    base = default if default is not None else fallback
    color = str(raw or base).strip().upper()
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
    if "font_color" in data and data["font_color"] is not None:
        row.font_color = _normalize_hex_color(data["font_color"], row.font_color, "#000000")
    if "default_warranty_terms" in data:
        row.default_warranty_terms = data["default_warranty_terms"]
    if "default_payment_terms" in data:
        row.default_payment_terms = data["default_payment_terms"]
    if "default_technical_notes" in data:
        row.default_technical_notes = data["default_technical_notes"]
    if "default_validity_days" in data and data["default_validity_days"] is not None:
        row.default_validity_days = int(data["default_validity_days"])
    if "warranty_presets" in data and data["warranty_presets"] is not None:
        _apply_presets(row, data["warranty_presets"], "warranty_presets_json", "default_warranty_terms")
    if "payment_presets" in data and data["payment_presets"] is not None:
        _apply_presets(row, data["payment_presets"], "payment_presets_json", "default_payment_terms")
    if "technical_presets" in data and data["technical_presets"] is not None:
        _apply_presets(row, data["technical_presets"], "technical_presets_json", "default_technical_notes")
    if "payment_method_presets" in data and data["payment_method_presets"] is not None:
        _apply_presets(row, data["payment_method_presets"], "payment_method_presets_json", "default_payment_method")
    if "scope_presets" in data and data["scope_presets"] is not None:
        _apply_presets(row, data["scope_presets"], "scope_presets_json", "default_scope_text")
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


def apply_budget_defaults_from_settings(
    db: Session,
    *,
    tenant_id: int,
    payment_terms: str | None,
    warranty_terms: str | None,
    scope_text: str | None,
    observation: str | None,
    payment_method: str | None,
) -> tuple[str | None, str | None, str | None, str | None, str | None]:
    row = db.execute(
        select(BudgetTemplateSettings).where(BudgetTemplateSettings.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if row is None:
        return payment_terms, warranty_terms, scope_text, observation, payment_method
    pt = (payment_terms or "").strip() or (row.default_payment_terms or "").strip() or None
    wt = (warranty_terms or "").strip() or (row.default_warranty_terms or "").strip() or None
    scope = (scope_text or "").strip() or (default_text_from_presets(_scope_presets(row)) or "").strip() or None
    obs = (observation or "").strip() or (default_text_from_presets(_technical_presets(row)) or "").strip() or None
    pm = (payment_method or "").strip() or (default_text_from_presets(_payment_method_presets(row)) or "").strip() or None
    return pt, wt, scope, obs, pm


def _apply_presets(
    row: BudgetTemplateSettings,
    presets: list[BudgetTextPreset | dict],
    json_attr: str,
    default_attr: str,
) -> None:
    normalized = normalize_presets(coerce_presets(presets))
    setattr(row, json_attr, dumps_presets_json(normalized))
    setattr(row, default_attr, default_text_from_presets(normalized))


def _warranty_presets(row: BudgetTemplateSettings) -> list[BudgetTextPreset]:
    return ensure_presets_from_legacy(
        parse_presets_json(row.warranty_presets_json),
        row.default_warranty_terms,
        default_name="Garantia padrão",
    )


def _payment_presets(row: BudgetTemplateSettings) -> list[BudgetTextPreset]:
    return ensure_presets_from_legacy(
        parse_presets_json(row.payment_presets_json),
        row.default_payment_terms,
        default_name="Pagamento padrão",
    )


def _technical_presets(row: BudgetTemplateSettings) -> list[BudgetTextPreset]:
    return ensure_presets_from_legacy(
        parse_presets_json(row.technical_presets_json),
        row.default_technical_notes,
        default_name="Observações padrão",
    )


def _payment_method_presets(row: BudgetTemplateSettings) -> list[BudgetTextPreset]:
    return ensure_presets_from_legacy(
        parse_presets_json(row.payment_method_presets_json),
        row.default_payment_method,
        default_name="Forma padrão",
    )


def _scope_presets(row: BudgetTemplateSettings) -> list[BudgetTextPreset]:
    return ensure_presets_from_legacy(
        parse_presets_json(row.scope_presets_json),
        row.default_scope_text,
        default_name="Escopo padrão",
    )


def _get_or_create_row(db: Session, *, tenant_id: int) -> BudgetTemplateSettings:
    row = db.execute(
        select(BudgetTemplateSettings).where(BudgetTemplateSettings.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if row is not None:
        return row
    tenant = db.get(Tenant, tenant_id)
    brand = _normalize_hex_color(getattr(tenant, "pdf_primary_color", None) if tenant else None)
    row = BudgetTemplateSettings(
        tenant_id=tenant_id,
        template_key="classic",
        brand_color=brand,
        font_color="#000000",
    )
    db.add(row)
    db.flush()
    return row


def _row_to_dict(row: BudgetTemplateSettings) -> dict:
    warranty = _warranty_presets(row)
    payment = _payment_presets(row)
    payment_method = _payment_method_presets(row)
    scope = _scope_presets(row)
    technical = _technical_presets(row)
    return {
        "template_key": row.template_key,
        "brand_color": row.brand_color,
        "font_color": row.font_color,
        "default_warranty_terms": default_text_from_presets(warranty) or row.default_warranty_terms,
        "default_payment_terms": default_text_from_presets(payment) or row.default_payment_terms,
        "default_payment_method": default_text_from_presets(payment_method) or row.default_payment_method,
        "default_scope_text": default_text_from_presets(scope) or row.default_scope_text,
        "default_technical_notes": default_text_from_presets(technical) or row.default_technical_notes,
        "default_validity_days": int(row.default_validity_days or 30),
        "warranty_presets": presets_to_api(warranty),
        "payment_presets": presets_to_api(payment),
        "payment_method_presets": presets_to_api(payment_method),
        "scope_presets": presets_to_api(scope),
        "technical_presets": presets_to_api(technical),
        "signature_url": row.signature_url,
        "has_signature": bool(row.signature_s3_key),
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
        font_color=_normalize_hex_color(data.get("font_color"), base.font_color, "#000000"),
        default_warranty_terms=(
            data["default_warranty_terms"] if "default_warranty_terms" in data else base.default_warranty_terms
        ),
        default_payment_terms=(
            data["default_payment_terms"] if "default_payment_terms" in data else base.default_payment_terms
        ),
        default_payment_method=(
            data["default_payment_method"] if "default_payment_method" in data else base.default_payment_method
        ),
        default_scope_text=(
            data["default_scope_text"] if "default_scope_text" in data else base.default_scope_text
        ),
        default_technical_notes=(
            data["default_technical_notes"] if "default_technical_notes" in data else base.default_technical_notes
        ),
        default_validity_days=(
            int(data["default_validity_days"])
            if "default_validity_days" in data and data["default_validity_days"] is not None
            else int(base.default_validity_days or 30)
        ),
        warranty_presets_json=(
            dumps_presets_json(normalize_presets(coerce_presets(data["warranty_presets"])))
            if "warranty_presets" in data and data["warranty_presets"] is not None
            else base.warranty_presets_json
        ),
        payment_presets_json=(
            dumps_presets_json(normalize_presets(coerce_presets(data["payment_presets"])))
            if "payment_presets" in data and data["payment_presets"] is not None
            else base.payment_presets_json
        ),
        technical_presets_json=(
            dumps_presets_json(normalize_presets(coerce_presets(data["technical_presets"])))
            if "technical_presets" in data and data["technical_presets"] is not None
            else base.technical_presets_json
        ),
        payment_method_presets_json=(
            dumps_presets_json(normalize_presets(coerce_presets(data["payment_method_presets"])))
            if "payment_method_presets" in data and data["payment_method_presets"] is not None
            else base.payment_method_presets_json
        ),
        scope_presets_json=(
            dumps_presets_json(normalize_presets(coerce_presets(data["scope_presets"])))
            if "scope_presets" in data and data["scope_presets"] is not None
            else base.scope_presets_json
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
        validity_days=int(settings.default_validity_days or 30),
        payment_method=(settings.default_payment_method or "PIX / Cartão").strip(),
        payment_terms=(settings.default_payment_terms or "50% na aprovação e 50% na conclusão.").strip(),
        warranty_terms=(settings.default_warranty_terms or "Garantia de 90 dias para mão de obra.").strip(),
        scope_text=(settings.default_scope_text or "Higienização e manutenção preventiva do equipamento.").strip(),
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
    signature_url: str | None = None
    if settings.signature_s3_key and db is not None:
        try:
            from app.tenant_logo import generate_tenant_logo_presigned_url

            signature_url = generate_tenant_logo_presigned_url(settings.signature_s3_key, db=db, expires_seconds=600)
        except Exception:
            signature_url = settings.signature_url
    return build_budget_pdf(
        sample,
        tenant,
        logo_url=logo_url,
        template_settings=settings,
        signature_url=signature_url,
        db=db,
    )
