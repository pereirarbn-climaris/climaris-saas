"""Schemas para agendamento de demonstrações comerciais."""

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


class DemoCalendarDayOut(BaseModel):
    date: date
    status: str
    available_slots: int
    total_slots: int


class DemoScheduleBlockOut(BaseModel):
    id: int
    starts_at: datetime
    ends_at: datetime
    reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DemoScheduleBlockCreateIn(BaseModel):
    starts_at: datetime
    ends_at: datetime
    reason: str | None = Field(default=None, max_length=200)

    @field_validator("reason", mode="before")
    @classmethod
    def _strip_reason(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            stripped = v.strip()
            return stripped or None
        return v


class DemoSlotOut(BaseModel):
    starts_at: datetime
    ends_at: datetime
    label: str


class DemoAppointmentCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=32)
    company: str | None = Field(default=None, max_length=160)
    job_title: str | None = Field(default=None, max_length=80)
    technicians_count: str | None = Field(default=None, max_length=24)
    selected_plan: str | None = Field(default=None, max_length=80)
    scheduled_at: datetime
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


class DemoAppointmentCreateOut(BaseModel):
    id: int
    scheduled_at: datetime
    message: str = (
        "Demonstração agendada com sucesso! Você receberá a confirmação por e-mail e WhatsApp."
    )


class DemoAppointmentOut(BaseModel):
    id: int
    website_lead_id: int | None
    name: str
    email: str
    phone: str | None
    company: str | None
    job_title: str | None
    technicians_count: str | None
    selected_plan: str | None
    scheduled_at: datetime
    duration_minutes: int
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DemoAppointmentPatchIn(BaseModel):
    status: str | None = Field(default=None, max_length=24)
    notes: str | None = Field(default=None, max_length=4000)
    scheduled_at: datetime | None = None
    notify_whatsapp: bool | None = Field(
        default=None,
        description="Quando o status mudar, envia WhatsApp ao lead (padrão: true).",
    )

    @field_validator("notes", mode="before")
    @classmethod
    def _strip_notes(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            stripped = v.strip()
            return stripped or None
        return v
