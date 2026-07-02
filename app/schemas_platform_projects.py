"""Schemas para central de projetos da operação Climaris."""

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from models import PlatformProjectPriority, PlatformProjectStatus, PlatformProjectTaskStatus


class PlatformProjectTaskOut(BaseModel):
    id: int
    project_id: int
    title: str
    description: str | None
    status: str
    due_date: date | None
    sort_order: int
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlatformProjectOut(BaseModel):
    id: int
    title: str
    company_name: str
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None
    tenant_id: int | None
    demo_appointment_id: int | None
    status: str
    priority: str
    delivery_deadline: date | None
    description: str | None
    notes: str | None
    progress_percent: int
    created_at: datetime
    updated_at: datetime
    tasks: list[PlatformProjectTaskOut] = []

    model_config = {"from_attributes": True}


class PlatformProjectCreateIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    company_name: str = Field(min_length=2, max_length=160)
    contact_name: str | None = Field(default=None, max_length=120)
    contact_email: str | None = Field(default=None, max_length=254)
    contact_phone: str | None = Field(default=None, max_length=32)
    tenant_id: int | None = None
    demo_appointment_id: int | None = None
    status: str = PlatformProjectStatus.LEAD.value
    priority: str = PlatformProjectPriority.NORMAL.value
    delivery_deadline: date | None = None
    description: str | None = Field(default=None, max_length=8000)
    notes: str | None = Field(default=None, max_length=8000)
    use_default_checklist: bool = False
    initial_tasks: list[str] | None = Field(default=None, max_length=50)

    @field_validator(
        "title",
        "company_name",
        "contact_name",
        "contact_email",
        "contact_phone",
        "description",
        "notes",
        mode="before",
    )
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            stripped = v.strip()
            return stripped or None
        return v


class PlatformProjectPatchIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    company_name: str | None = Field(default=None, max_length=160)
    contact_name: str | None = Field(default=None, max_length=120)
    contact_email: str | None = Field(default=None, max_length=254)
    contact_phone: str | None = Field(default=None, max_length=32)
    tenant_id: int | None = None
    demo_appointment_id: int | None = None
    status: str | None = Field(default=None, max_length=24)
    priority: str | None = Field(default=None, max_length=16)
    delivery_deadline: date | None = None
    description: str | None = Field(default=None, max_length=8000)
    notes: str | None = Field(default=None, max_length=8000)
    progress_percent: int | None = Field(default=None, ge=0, le=100)


class PlatformProjectTaskCreateIn(BaseModel):
    title: str = Field(min_length=2, max_length=240)
    description: str | None = Field(default=None, max_length=4000)
    status: str = PlatformProjectTaskStatus.PENDING.value
    due_date: date | None = None
    sort_order: int = 100


class PlatformProjectTaskPatchIn(BaseModel):
    title: str | None = Field(default=None, max_length=240)
    description: str | None = Field(default=None, max_length=4000)
    status: str | None = Field(default=None, max_length=24)
    due_date: date | None = None
    sort_order: int | None = None
