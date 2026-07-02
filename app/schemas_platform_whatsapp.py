"""Schemas para WhatsApp da operação Climaris (instância global Evolution)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


PlatformWhatsappProvider = Literal["evolution", "official"]


class PlatformWhatsappConnectionOut(BaseModel):
    provider: PlatformWhatsappProvider
    instance_name: str
    status: str | None
    provider_configured: bool
    evolution_configured: bool
    official_configured: bool
    qrcode_base64: str | None = None
    pairing_code: str | None = None
    raw: dict | None = None


class PlatformWhatsappConnectionSetupIn(BaseModel):
    provider: PlatformWhatsappProvider = "evolution"
    instance_name: str | None = Field(default=None, max_length=80)


class PlatformWhatsappSettingsOut(BaseModel):
    default_provider: PlatformWhatsappProvider
    available_providers: list[PlatformWhatsappProvider]
    operator_whatsapp: str | None
    operator_whatsapp_source: str
    evolution_instance_name: str
    evolution_configured: bool
    official_configured: bool
    demo_client_message_preview: str
    demo_operator_message_preview: str


class PlatformWhatsappSendTextIn(BaseModel):
    provider: PlatformWhatsappProvider = "evolution"
    recipient_whatsapp: str = Field(min_length=8, max_length=32)
    message: str = Field(min_length=1, max_length=4000)


class PlatformWhatsappSendResultOut(BaseModel):
    provider: PlatformWhatsappProvider
    ok: bool
    provider_message_id: str | None = None
    recipient_whatsapp: str
    message: str
    sent_at: datetime


class PlatformDemoWhatsappSendIn(BaseModel):
    message: str | None = Field(default=None, max_length=4000)
    template: str | None = Field(
        default=None,
        description="confirmation | status_confirmed | status_cancelled | status_completed | status_no_show",
    )


class PlatformDemoWhatsappSendOut(BaseModel):
    ok: bool
    recipient_whatsapp: str | None
    message: str
    provider_message_id: str | None = None
