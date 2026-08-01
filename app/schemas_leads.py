"""Schemas para leads do site institucional (climaris.com.br)."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


class WebsiteLeadCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=32)
    company: str | None = Field(default=None, max_length=160)
    job_title: str | None = Field(default=None, max_length=80)
    technicians_count: str | None = Field(default=None, max_length=24)
    selected_plan: str | None = Field(default=None, max_length=80)
    message: str | None = Field(default=None, max_length=2000)
    # Honeypot anti-spam — deve permanecer vazio.
    website_url: str | None = Field(default=None, max_length=200)
    lgpd_consent: bool = Field(
        ...,
        description="Aceite obrigatório da Política de Privacidade e tratamento de dados conforme a LGPD.",
    )

    @field_validator("lgpd_consent")
    @classmethod
    def _require_lgpd_consent(cls, value: bool) -> bool:
        if not value:
            raise ValueError(
                "É necessário aceitar a Política de Privacidade e o tratamento de dados conforme a LGPD."
            )
        return value

    @field_validator(
        "name",
        "company",
        "message",
        "phone",
        "job_title",
        "technicians_count",
        "selected_plan",
        mode="before",
    )
    @classmethod
    def _strip_strings(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            stripped = v.strip()
            return stripped or None
        return v


class WebsiteLeadOut(BaseModel):
    id: int
    name: str
    email: str
    phone: str | None
    company: str | None
    job_title: str | None
    technicians_count: str | None
    selected_plan: str | None
    message: str
    source: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class WebsiteLeadCreateOut(BaseModel):
    id: int
    message: str = "Recebemos seu contato! Nossa equipe retornará em breve."
