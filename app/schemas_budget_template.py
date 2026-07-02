from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.budget_text_presets import BudgetTextPreset


BudgetTemplateKey = Literal["classic", "professional"]


class BudgetTemplateSettingsOut(BaseModel):
    template_key: BudgetTemplateKey = "classic"
    brand_color: str = Field(default="#0B7FAF", pattern=r"^#[0-9A-Fa-f]{6}$")
    font_color: str = Field(default="#000000", pattern=r"^#[0-9A-Fa-f]{6}$")
    default_warranty_terms: str | None = None
    default_payment_terms: str | None = None
    default_payment_method: str | None = None
    default_scope_text: str | None = None
    default_technical_notes: str | None = None
    default_validity_days: int = 30
    warranty_presets: list[BudgetTextPreset] = Field(default_factory=list)
    payment_presets: list[BudgetTextPreset] = Field(default_factory=list)
    payment_method_presets: list[BudgetTextPreset] = Field(default_factory=list)
    scope_presets: list[BudgetTextPreset] = Field(default_factory=list)
    technical_presets: list[BudgetTextPreset] = Field(default_factory=list)
    signature_url: str | None = None
    has_signature: bool = False


class BudgetTemplateSettingsPatch(BaseModel):
    template_key: BudgetTemplateKey | None = None
    brand_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    font_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    default_warranty_terms: str | None = Field(default=None, max_length=8000)
    default_payment_terms: str | None = Field(default=None, max_length=8000)
    default_payment_method: str | None = Field(default=None, max_length=500)
    default_scope_text: str | None = Field(default=None, max_length=8000)
    default_technical_notes: str | None = Field(default=None, max_length=8000)
    default_validity_days: int | None = Field(default=None, ge=1, le=365)
    warranty_presets: list[BudgetTextPreset] | None = None
    payment_presets: list[BudgetTextPreset] | None = None
    payment_method_presets: list[BudgetTextPreset] | None = None
    scope_presets: list[BudgetTextPreset] | None = None
    technical_presets: list[BudgetTextPreset] | None = None

    @field_validator("template_key", mode="before")
    @classmethod
    def normalize_template_key(cls, value: object) -> object:
        if value is None:
            return None
        raw = str(value).strip().lower()
        if raw in {"modelo1", "1", "classic", "classico", "clássico"}:
            return "classic"
        if raw in {"modelo2", "2", "professional", "profissional", "compacto"}:
            return "professional"
        return value
