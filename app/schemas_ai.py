from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TenantAISettingsUpsert(BaseModel):
    agent_name: str = Field(..., min_length=2, max_length=80)
    tone_of_voice: str = Field(..., min_length=3, max_length=20)
    instructions: str | None = Field(default=None, max_length=4000)
    model_slug: str | None = Field(default=None, max_length=80)
    is_enabled: bool = True
    ai_context_products: bool = True
    ai_context_service_prices: bool = True
    ai_context_services_catalog: bool = True
    ai_tool_billing: bool = False
    ai_tool_cancel: bool = True
    ai_tool_reschedule: bool = True
    ai_tool_agenda_read: bool = True
    ai_allow_direct_schedule: bool = False
    ai_allow_auto_client_create: bool = False
    ai_clarification_instructions: str | None = Field(default=None, max_length=4000)

    @field_validator(
        "agent_name",
        "tone_of_voice",
        "instructions",
        "model_slug",
        "ai_clarification_instructions",
    )
    @classmethod
    def _strip_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class TenantAISettingsPatch(BaseModel):
    agent_name: str | None = Field(default=None, min_length=2, max_length=80)
    tone_of_voice: str | None = Field(default=None, min_length=3, max_length=20)
    instructions: str | None = Field(default=None, max_length=4000)
    model_slug: str | None = Field(default=None, max_length=80)
    is_enabled: bool | None = None
    ai_context_products: bool | None = None
    ai_context_service_prices: bool | None = None
    ai_context_services_catalog: bool | None = None
    ai_tool_billing: bool | None = None
    ai_tool_cancel: bool | None = None
    ai_tool_reschedule: bool | None = None
    ai_tool_agenda_read: bool | None = None
    ai_allow_direct_schedule: bool | None = None
    ai_allow_auto_client_create: bool | None = None
    ai_clarification_instructions: str | None = Field(default=None, max_length=4000)

    @field_validator(
        "agent_name",
        "tone_of_voice",
        "instructions",
        "model_slug",
        "ai_clarification_instructions",
    )
    @classmethod
    def _strip_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class TenantAISettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    agent_name: str
    tone_of_voice: str
    instructions: str | None
    model_slug: str
    is_enabled: bool
    ai_context_products: bool = True
    ai_context_service_prices: bool = True
    ai_context_services_catalog: bool = True
    ai_tool_billing: bool = False
    ai_tool_cancel: bool = True
    ai_tool_reschedule: bool = True
    ai_tool_agenda_read: bool = True
    ai_allow_direct_schedule: bool = False
    ai_allow_auto_client_create: bool = False
    ai_clarification_instructions: str | None = None
    created_at: datetime
    updated_at: datetime


class AIChatHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    client_whatsapp: str | None
    user_message: str
    assistant_response: str
    used_model: str | None
    used_tools_json: str | None
    is_mock: bool
    created_at: datetime


class AISandboxToolRequest(BaseModel):
    tool_name: str = Field(..., min_length=2, max_length=80)
    arguments: dict[str, Any] = Field(default_factory=dict)

    @field_validator("tool_name")
    @classmethod
    def _strip_tool_name(cls, value: str) -> str:
        return value.strip()


class AISandboxToolOut(BaseModel):
    tool_name: str
    arguments: dict[str, Any]
    result: dict[str, Any]
