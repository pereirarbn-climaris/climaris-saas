"""Schemas do site institucional (configuração + API pública)."""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

SCREENSHOT_SLOTS = ("hero", "dashboard", "finance", "orders")


class PlatformWebsiteCnpjLookupIn(BaseModel):
    cnpj: str = Field(..., min_length=14, max_length=18)


class PlatformWebsiteSettingsPatch(BaseModel):
    hero_title: str | None = Field(default=None, max_length=200)
    hero_subtitle: str | None = Field(default=None, max_length=500)
    seo_title: str | None = Field(default=None, max_length=200)
    seo_description: str | None = Field(default=None, max_length=500)
    contact_email: str | None = Field(default=None, max_length=254)
    contact_phone: str | None = Field(default=None, max_length=32)
    legal_name: str | None = Field(default=None, max_length=160)
    trade_name: str | None = Field(default=None, max_length=160)
    cnpj: str | None = Field(default=None, max_length=18)
    is_verified_cnpj: bool | None = None
    dpo_name: str | None = Field(default=None, max_length=120)
    dpo_email: str | None = Field(default=None, max_length=254)
    address_street: str | None = Field(default=None, max_length=200)
    address_city: str | None = Field(default=None, max_length=80)
    address_state: str | None = Field(default=None, max_length=2)
    address_postal: str | None = Field(default=None, max_length=12)
    services: list[str] | None = None

    @field_validator(
        "hero_title",
        "hero_subtitle",
        "seo_title",
        "seo_description",
        "contact_email",
        "contact_phone",
        "legal_name",
        "trade_name",
        "cnpj",
        "dpo_name",
        "dpo_email",
        "address_street",
        "address_city",
        "address_state",
        "address_postal",
        mode="before",
    )
    @classmethod
    def _strip_optional(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s or None
        return v


class WebsiteScreenshotOut(BaseModel):
    slot: str
    has_image: bool
    url: str | None
    updated_at: datetime | None


class PlatformWebsiteSettingsOut(BaseModel):
    hero_title: str
    hero_subtitle: str
    seo_title: str
    seo_description: str
    contact_email: str
    contact_phone: str | None
    legal_name: str
    trade_name: str | None
    cnpj: str | None
    is_verified_cnpj: bool
    cnpj_verified_at: datetime | None
    dpo_name: str | None
    dpo_email: str | None
    address_street: str
    address_city: str
    address_state: str
    address_postal: str
    services: list[str]
    screenshots: list[WebsiteScreenshotOut]
    updated_at: datetime

    model_config = {"from_attributes": True}


class PublicWebsiteSettingsOut(BaseModel):
    hero_title: str
    hero_subtitle: str
    seo_title: str
    seo_description: str
    contact_email: str
    contact_phone: str | None
    legal_name: str
    trade_name: str | None
    cnpj: str | None
    is_verified_cnpj: bool
    cnpj_verified_at: datetime | None
    dpo_name: str | None
    dpo_email: str | None
    address_street: str
    address_city: str
    address_state: str
    address_postal: str
    services: list[str]
    screenshots: dict[str, str | None]
