from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


CampaignSegmentKind = Literal["inactive_since", "manual"]


class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    message_template: str = Field(..., min_length=5, max_length=4000)
    segment_kind: CampaignSegmentKind = "inactive_since"
    segment_params: dict[str, Any] = Field(default_factory=dict)
    asset_id: int | None = Field(default=None, ge=1)
    scheduled_at: datetime | None = None
    status: Literal["draft", "scheduled"] = "draft"

    @field_validator("name", "message_template")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class CampaignOut(BaseModel):
    id: int
    tenant_id: int
    name: str
    message_template: str
    status: str
    scheduled_at: datetime | None
    segment_kind: str
    segment_params: dict[str, Any]
    asset_id: int | None
    asset_url: str | None
    asset_content_type: str | None
    total_contacts: int
    sent_count: int
    created_at: datetime
    updated_at: datetime


class CampaignAssetOut(BaseModel):
    id: int
    url: str
    content_type: str | None
    s3_key: str | None


class CampaignPreviewOut(BaseModel):
    total: int
    clients: list[dict[str, Any]]
    selection_mode: str | None = None
    official_count: int | None = None
    external_count: int | None = None
    estimated_duration_seconds: float | None = None


class CampaignRunOut(BaseModel):
    campaign: CampaignOut
    sent: int
    failed: int
    total_recipients: int | None = None
    estimated_duration_seconds: float | None = None
    send_speed: str | None = None


SendSpeedKind = Literal["fast", "medium", "slow"]


class CampaignRunRequest(BaseModel):
    selection_mode: Literal["automatic", "manual"] = "automatic"
    client_ids: list[int] = Field(default_factory=list)
    inactive_days: int | None = Field(default=None, ge=1, le=3650)
    external_lead_ids: list[int] = Field(default_factory=list)
    import_batch_id: str | None = Field(default=None, max_length=36)
    send_speed: SendSpeedKind = "fast"
    run_async: bool = True
    scheduled_at: datetime | None = None


class CampaignDispatchStatusOut(BaseModel):
    campaign_id: int
    status: str
    sent: int
    failed: int
    total: int
    processed: int
    progress_pct: float
    is_running: bool


class CampaignRunStartedOut(BaseModel):
    campaign: CampaignOut
    campaign_id: int
    total_recipients: int
    estimated_duration_seconds: float
    send_speed: str
    status: str
    async_dispatch: bool = True
    scheduled_at: datetime | None = None


class CampaignPreviewRequest(BaseModel):
    selection_mode: Literal["automatic", "manual"] = "automatic"
    client_ids: list[int] = Field(default_factory=list)
    inactive_days: int | None = Field(default=None, ge=1, le=3650)
    message_template: str = Field(default="", max_length=4000)
    external_lead_ids: list[int] = Field(default_factory=list)
    import_batch_id: str | None = Field(default=None, max_length=36)
    send_speed: SendSpeedKind = "fast"


class CampaignExternalLeadOut(BaseModel):
    id: int
    name: str
    phone: str
    whatsapp_preview: str | None = None


class CampaignLeadInvalidRowOut(BaseModel):
    line_no: int
    name: str
    phone_raw: str
    error: str


class CampaignLeadValidRowOut(BaseModel):
    line_no: int
    name: str
    phone: str
    formatted: str
    whatsapp_preview: str | None = None


class CampaignLeadsValidateOut(BaseModel):
    valid_rows: list[CampaignLeadValidRowOut]
    invalid_rows: list[CampaignLeadInvalidRowOut]
    valid_count: int
    invalid_count: int
    skipped_empty: int
    skipped_duplicate: int
    requires_review: bool
    source_filename: str | None = None
    total_rows_parsed: int | None = None
    validation_message: str | None = None


class CampaignLeadConfirmItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    phone: str = Field(..., min_length=8, max_length=32)


class CampaignLeadsConfirmIn(BaseModel):
    leads: list[CampaignLeadConfirmItem] = Field(..., min_length=1)
    source_filename: str | None = Field(default=None, max_length=180)
    discarded_invalid_count: int = Field(default=0, ge=0)


class CampaignLeadsImportOut(BaseModel):
    import_batch_id: str
    imported_count: int
    skipped_count: int = 0
    discarded_count: int = 0
    errors: list[str] = Field(default_factory=list)
    leads: list[CampaignExternalLeadOut]
    summary_message: str | None = None


class CampaignFunnelOut(BaseModel):
    sent: int
    delivered: int
    read: int
    os_closed: int


class CampaignConvertedClientOut(BaseModel):
    client_id: int
    client_name: str
    service_order_id: int
    service_order_title: str
    closed_at: datetime | None


class CampaignConvertedClientSummaryOut(BaseModel):
    client_id: int
    client_name: str
    interaction_type: str
    interaction_at: datetime
    service_order_id: int | None = None
    service_order_title: str | None = None


class CampaignAnalyticsOut(BaseModel):
    campaign_id: int
    campaign_name: str
    campaign_created_at: datetime
    total_enviados: int
    total_lidos: int
    total_orcamentos: int
    total_os_fechadas: int
    conversion_rate: float
    conversion_window_days: int
    clientes_convertidos: list[CampaignConvertedClientSummaryOut]
    funnel: CampaignFunnelOut | None = None
    total_sent: int | None = None
    total_delivered: int | None = None
    total_read: int | None = None
    total_conversion: int | None = None
    total_budgets: int | None = None
    converted_clients: list[CampaignConvertedClientOut] = Field(default_factory=list)


class CampaignCompareItemOut(BaseModel):
    campaign_id: int
    campaign_name: str
    conversion_rate: float
    total_sent: int
    total_conversion: int
