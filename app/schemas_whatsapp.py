from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class WhatsappTemplateSendRequest(BaseModel):
    template_key: str = Field(..., min_length=1, max_length=80)
    recipient_whatsapp: str = Field(..., min_length=8, max_length=30)
    variables: dict[str, Any] = Field(default_factory=dict)
    reference_type: str | None = Field(default=None, max_length=40)
    reference_id: int | None = None
    scheduled_for: datetime | None = None

    @field_validator("template_key", "reference_type")
    @classmethod
    def _strip_optional_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("recipient_whatsapp")
    @classmethod
    def _strip_recipient(cls, value: str) -> str:
        return value.strip()


class WhatsappWebhookAck(BaseModel):
    status: str = "ok"
    handler_error: bool | None = None


class WhatsappAppointmentMessageSettingsPatch(BaseModel):
    template_body: str | None = Field(default=None, min_length=20, max_length=2000)
    confirm_keyword: str | None = Field(default=None, min_length=2, max_length=20)
    reschedule_keyword: str | None = Field(default=None, min_length=2, max_length=20)
    confirm_reply: str | None = Field(default=None, min_length=5, max_length=500)
    reschedule_reply: str | None = Field(default=None, min_length=5, max_length=500)
    cancel_reply: str | None = Field(default=None, min_length=5, max_length=500)

    @field_validator("template_body")
    @classmethod
    def _strip_template_body(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("confirm_keyword", "reschedule_keyword")
    @classmethod
    def _normalize_keyword(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().upper()
        return cleaned or None

    @field_validator("confirm_reply", "reschedule_reply", "cancel_reply")
    @classmethod
    def _strip_reply(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class WhatsappAppointmentMessageSettingsOut(BaseModel):
    template_body: str
    confirm_keyword: str
    reschedule_keyword: str
    confirm_reply: str
    reschedule_reply: str
    cancel_reply: str
    allowed_variables: list[str]
    reply_allowed_variables: dict[str, list[str]]


class WhatsappWebhookInfoOut(BaseModel):
    webhook_slug: str = "agenda"
    webhook_agenda_url: str | None = None
    webhook_agenda_url_with_tenant: str | None = None
    webhook_preventiva_url: str | None = None
    webhook_preventiva_url_with_tenant: str | None = None
    webhook_evolution_router_url: str | None = None
    webhook_evolution_router_url_with_tenant: str | None = None
    api_public_base_url_configured: bool
    webhook_enabled: bool
    tenant_id: int
    instance_name: str | None = None
    suggested_events: list[str] = Field(default_factory=lambda: ["MESSAGES_UPSERT"])
    suggested_events_agenda: list[str] = Field(default_factory=lambda: ["MESSAGES_UPSERT"])
    suggested_events_preventiva: list[str] = Field(default_factory=lambda: ["MESSAGES_UPSERT"])
    automation_enabled: bool = False
    automation_allowed_by_plan: bool = False
    automation_active: bool = False
    plan_key: str = "free_30d"
    plan_label: str = "Free 30 dias"


class WhatsappAutomationSettingsPatch(BaseModel):
    enabled: bool


class WhatsappAutomationSettingsOut(BaseModel):
    automation_enabled: bool
    automation_allowed_by_plan: bool
    automation_active: bool
    plan_key: str
    plan_label: str


class WhatsappAppointmentReminderSendRequest(BaseModel):
    recipient_whatsapp: str = Field(..., min_length=8, max_length=30)
    nome_cliente: str = Field(..., min_length=2, max_length=120)
    data_hora: str = Field(..., min_length=4, max_length=80)
    empresa: str | None = Field(default=None, max_length=150)
    reference_id: int | None = None

    @field_validator("recipient_whatsapp", "nome_cliente", "data_hora", "empresa")
    @classmethod
    def _strip_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class WhatsappReminderRulesPatch(BaseModel):
    offset_15m: bool | None = None
    offset_30m: bool | None = None
    offset_1h: bool | None = None
    offset_1d: bool | None = None
    custom_enabled: bool | None = None
    custom_minutes: int | None = Field(default=None, ge=1, le=60 * 24 * 30)
    dispatch_scheduled_at: datetime | None = None


class WhatsappReminderRulesOut(BaseModel):
    offset_15m: bool
    offset_30m: bool
    offset_1h: bool
    offset_1d: bool
    custom_enabled: bool
    custom_minutes: int | None = None
    active_offsets_minutes: list[int]
    dispatch_scheduled_at: datetime | None = None


class WhatsappTenantConnectionConfigureRequest(BaseModel):
    instance_name: str | None = Field(default=None, min_length=3, max_length=120)

    @field_validator("instance_name")
    @classmethod
    def _strip_instance_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().lower()
        return cleaned or None


class WhatsappTenantConnectionOut(BaseModel):
    tenant_id: int
    instance_name: str
    status: str | None = None
    connected_at: datetime | None = None
    qrcode_base64: str | None = None
    pairing_code: str | None = None
    raw: dict[str, Any] | None = None


class WhatsappTemplateOut(BaseModel):
    key: str
    description: str
    variables: list[str]


class WhatsappMessageJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    provider_slug: str
    template_key: str | None = None
    recipient_whatsapp: str
    rendered_message: str
    status: str
    provider_message_id: str | None = None
    reference_type: str | None = None
    reference_id: int | None = None
    error_message: str | None = None
    scheduled_for: datetime | None = None
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    read_at: datetime | None = None
    failed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class WhatsappChatbotRequest(BaseModel):
    message_text: str = Field(..., min_length=1, max_length=2000)
    client_name: str | None = Field(default=None, max_length=120)

    @field_validator("message_text", "client_name")
    @classmethod
    def _strip_chat_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class WhatsappChatbotReplyOut(BaseModel):
    intent: str
    reply_text: str


class WhatsappModuleStatusOut(BaseModel):
    """Liberação do módulo WhatsApp na Loja (independe de conexão Evolution)."""

    entitlement_active: bool
    entitlement_status: str | None = None
    blocked_reason: str | None = None
