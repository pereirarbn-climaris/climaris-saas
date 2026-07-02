"""Schemas das páginas configuráveis do site institucional."""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class WebsitePageSectionOut(BaseModel):
    key: str
    title: str
    description: str
    bullets: list[str]


class WebsitePageImageOut(BaseModel):
    slot: str
    label: str
    hint: str
    has_image: bool
    url: str | None
    updated_at: datetime | None


class WebsitePageSummaryOut(BaseModel):
    slug: str
    label: str
    path: str
    sort_order: int
    is_published: bool
    updated_at: datetime | None


class WebsitePageOut(BaseModel):
    slug: str
    label: str
    path: str
    title: str
    subtitle: str
    hero_description: str
    seo_title: str
    seo_description: str
    sections: list[WebsitePageSectionOut]
    outcomes: list[str]
    images: list[WebsitePageImageOut]
    is_published: bool
    updated_at: datetime | None


class WebsitePagePatch(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    subtitle: str | None = Field(default=None, max_length=200)
    hero_description: str | None = Field(default=None, max_length=500)
    seo_title: str | None = Field(default=None, max_length=200)
    seo_description: str | None = Field(default=None, max_length=500)
    sections: list[WebsitePageSectionOut] | None = None
    outcomes: list[str] | None = None
    is_published: bool | None = None

    @field_validator(
        "title",
        "subtitle",
        "hero_description",
        "seo_title",
        "seo_description",
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

    @field_validator("outcomes", mode="before")
    @classmethod
    def _clean_outcomes(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        cleaned = [s.strip() for s in v if isinstance(s, str) and s.strip()]
        return cleaned or None


class PublicWebsitePageOut(BaseModel):
    slug: str
    title: str
    subtitle: str
    hero_description: str
    seo_title: str
    seo_description: str
    sections: list[WebsitePageSectionOut]
    outcomes: list[str]
    images: dict[str, str | None]
