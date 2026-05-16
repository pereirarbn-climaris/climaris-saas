from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

BroadcastSegmentKind = Literal["inactive_no_os_recent", "open_budgets"]


class WhatsappBroadcastCampaignCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    slug: str | None = Field(default=None, max_length=80)
    message_template: str = Field(..., min_length=10, max_length=4000)
    segment_kind: BroadcastSegmentKind
    segment_params: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    max_recipients_per_run: int = Field(default=300, ge=1, le=2000)
    cooldown_days: int = Field(default=30, ge=0, le=365)

    @field_validator("name", "message_template", "slug")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.strip()


class WhatsappBroadcastCampaignPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    slug: str | None = Field(default=None, max_length=80)
    message_template: str | None = Field(default=None, min_length=10, max_length=4000)
    segment_kind: BroadcastSegmentKind | None = None
    segment_params: dict[str, Any] | None = None
    enabled: bool | None = None
    max_recipients_per_run: int | None = Field(default=None, ge=1, le=2000)
    cooldown_days: int | None = Field(default=None, ge=0, le=365)


class WhatsappBroadcastCampaignOut(BaseModel):
    id: int
    tenant_id: int
    slug: str
    name: str
    message_template: str
    segment_kind: str
    segment_params: dict[str, Any]
    enabled: bool
    max_recipients_per_run: int
    cooldown_days: int
    last_run_at: datetime | None
    last_run_summary: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class WhatsappBroadcastCampaignPreviewOut(BaseModel):
    estimated_total: int
    sample: list[dict[str, Any]]


class WhatsappBroadcastCampaignRunOut(BaseModel):
    id: int
    campaign_id: int
    tenant_id: int
    created_by_user_id: int | None
    status: str
    planned: int
    sent_ok: int
    sent_failed: int
    skipped_cooldown: int
    skipped_no_phone: int
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None


class WhatsappBroadcastCampaignRunResultOut(BaseModel):
    campaign: WhatsappBroadcastCampaignOut
    run: WhatsappBroadcastCampaignRunOut
