from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


BudgetTemplateKey = Literal["classic", "professional"]


class BudgetTemplateSettingsOut(BaseModel):
    template_key: BudgetTemplateKey = "classic"
    brand_color: str = Field(default="#0B7FAF", pattern=r"^#[0-9A-Fa-f]{6}$")
    default_warranty_terms: str | None = None
    default_payment_terms: str | None = None
    default_technical_notes: str | None = None


class BudgetTemplateSettingsPatch(BaseModel):
    template_key: BudgetTemplateKey | None = None
    brand_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    default_warranty_terms: str | None = Field(default=None, max_length=8000)
    default_payment_terms: str | None = Field(default=None, max_length=8000)
    default_technical_notes: str | None = Field(default=None, max_length=8000)

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
