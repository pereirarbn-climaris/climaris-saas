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


class WhatsappAppointmentMessageSettingsPatch(BaseModel):
    template_body: str | None = Field(default=None, min_length=20, max_length=2000)
    confirm_keyword: str | None = Field(default=None, min_length=2, max_length=20)
    reschedule_keyword: str | None = Field(default=None, min_length=2, max_length=20)

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


class WhatsappAppointmentMessageSettingsOut(BaseModel):
    template_body: str
    confirm_keyword: str
    reschedule_keyword: str
    allowed_variables: list[str]


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


class WhatsappReminderRulesOut(BaseModel):
    offset_15m: bool
    offset_30m: bool
    offset_1h: bool
    offset_1d: bool
    custom_enabled: bool
    custom_minutes: int | None = None
    active_offsets_minutes: list[int]


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
