from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

BotTriggerType = Literal["keyword", "menu_option", "system_event", "manual"]
BotStepKind = Literal["message", "question", "menu", "action", "handoff", "end"]


class WhatsappBotSettingsPatch(BaseModel):
    enabled: bool | None = None
    welcome_message: str | None = Field(default=None, min_length=5, max_length=2000)
    fallback_message: str | None = Field(default=None, min_length=5, max_length=1000)
    handoff_message: str | None = Field(default=None, min_length=5, max_length=1000)
    handoff_keywords: list[str] | None = Field(default=None, max_length=30)
    handoff_pause_minutes: int | None = Field(default=None, ge=1, le=60 * 24 * 30)
    business_hours: dict[str, Any] | None = None

    @field_validator("welcome_message", "fallback_message", "handoff_message")
    @classmethod
    def _strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()

    @field_validator("handoff_keywords")
    @classmethod
    def _normalize_keywords(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        out: list[str] = []
        for raw in value:
            cleaned = str(raw or "").strip()
            if cleaned and cleaned not in out:
                out.append(cleaned[:40])
        return out


class WhatsappBotSettingsOut(BaseModel):
    id: int
    tenant_id: int
    enabled: bool
    welcome_message: str
    fallback_message: str
    handoff_message: str
    handoff_keywords: list[str]
    handoff_pause_minutes: int
    business_hours: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class WhatsappBotStepBase(BaseModel):
    step_key: str = Field(..., min_length=1, max_length=80)
    kind: BotStepKind = "message"
    message_template: str = Field(..., min_length=1, max_length=4000)
    options: list[dict[str, Any]] = Field(default_factory=list)
    validation: dict[str, Any] = Field(default_factory=dict)
    actions: dict[str, Any] = Field(default_factory=dict)
    next_step_key: str | None = Field(default=None, max_length=80)
    sort_order: int = Field(default=100, ge=0, le=100_000)

    @field_validator("step_key", "next_step_key")
    @classmethod
    def _normalize_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().lower().replace(" ", "-")
        return cleaned or None

    @field_validator("message_template")
    @classmethod
    def _strip_message(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def _require_menu_options(self) -> "WhatsappBotStepBase":
        if self.kind == "menu" and not self.options:
            raise ValueError("Passos do tipo menu precisam de ao menos uma opção.")
        return self


class WhatsappBotStepCreate(WhatsappBotStepBase):
    pass


class WhatsappBotStepPatch(BaseModel):
    step_key: str | None = Field(default=None, min_length=1, max_length=80)
    kind: BotStepKind | None = None
    message_template: str | None = Field(default=None, min_length=1, max_length=4000)
    options: list[dict[str, Any]] | None = None
    validation: dict[str, Any] | None = None
    actions: dict[str, Any] | None = None
    next_step_key: str | None = Field(default=None, max_length=80)
    sort_order: int | None = Field(default=None, ge=0, le=100_000)

    @field_validator("step_key", "next_step_key")
    @classmethod
    def _normalize_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().lower().replace(" ", "-")
        return cleaned or None

    @field_validator("message_template")
    @classmethod
    def _strip_message(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()


class WhatsappBotStepOut(BaseModel):
    id: int
    flow_id: int
    step_key: str
    kind: str
    message_template: str
    options: list[dict[str, Any]]
    validation: dict[str, Any]
    actions: dict[str, Any]
    next_step_key: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class WhatsappBotFlowCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    enabled: bool = True
    trigger_type: BotTriggerType = "keyword"
    trigger_keywords: list[str] = Field(default_factory=list, max_length=50)
    system_event: str | None = Field(default=None, max_length=80)
    priority: int = Field(default=100, ge=0, le=100_000)
    steps: list[WhatsappBotStepCreate] = Field(default_factory=list, max_length=50)

    @field_validator("slug")
    @classmethod
    def _normalize_slug(cls, value: str) -> str:
        cleaned = value.strip().lower().replace(" ", "-")
        allowed = set("abcdefghijklmnopqrstuvwxyz0123456789-_")
        cleaned = "".join(ch for ch in cleaned if ch in allowed)
        if not cleaned:
            raise ValueError("Slug inválido.")
        return cleaned[:80]

    @field_validator("name", "description", "system_event")
    @classmethod
    def _strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("trigger_keywords")
    @classmethod
    def _normalize_keywords(cls, value: list[str]) -> list[str]:
        out: list[str] = []
        for raw in value:
            cleaned = str(raw or "").strip()
            if cleaned and cleaned not in out:
                out.append(cleaned[:80])
        return out

    @model_validator(mode="after")
    def _validate_trigger(self) -> "WhatsappBotFlowCreate":
        if self.trigger_type == "system_event" and not self.system_event:
            raise ValueError("Fluxos de evento do sistema precisam de system_event.")
        if self.trigger_type in ("keyword", "menu_option") and not self.trigger_keywords:
            raise ValueError("Informe palavras-chave ou opções para iniciar o fluxo.")
        return self


class WhatsappBotFlowPatch(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=80)
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    enabled: bool | None = None
    trigger_type: BotTriggerType | None = None
    trigger_keywords: list[str] | None = Field(default=None, max_length=50)
    system_event: str | None = Field(default=None, max_length=80)
    priority: int | None = Field(default=None, ge=0, le=100_000)

    @field_validator("slug")
    @classmethod
    def _normalize_slug(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().lower().replace(" ", "-")
        allowed = set("abcdefghijklmnopqrstuvwxyz0123456789-_")
        cleaned = "".join(ch for ch in cleaned if ch in allowed)
        return cleaned or None

    @field_validator("name", "description", "system_event")
    @classmethod
    def _strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("trigger_keywords")
    @classmethod
    def _normalize_keywords(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        out: list[str] = []
        for raw in value:
            cleaned = str(raw or "").strip()
            if cleaned and cleaned not in out:
                out.append(cleaned[:80])
        return out


class WhatsappBotFlowOut(BaseModel):
    id: int
    tenant_id: int
    slug: str
    name: str
    description: str | None
    enabled: bool
    trigger_type: str
    trigger_keywords: list[str]
    system_event: str | None
    priority: int
    steps: list[WhatsappBotStepOut]
    created_at: datetime
    updated_at: datetime


class WhatsappBotTestRequest(BaseModel):
    message_text: str = Field(..., min_length=1, max_length=2000)
    client_whatsapp: str | None = Field(default=None, max_length=30)
    context: dict[str, Any] = Field(default_factory=dict)
    reset_session: bool = True

    @field_validator("message_text", "client_whatsapp")
    @classmethod
    def _strip_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class WhatsappBotTestResponse(BaseModel):
    matched: bool
    reply_text: str | None = None
    flow_id: int | None = None
    flow_name: str | None = None
    step_key: str | None = None
    ended: bool = False
    handoff: bool = False
    paused_until: datetime | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class WhatsappBotSeedDefaultsResponse(BaseModel):
    created_flows: int
    skipped_existing: int
    flows: list[WhatsappBotFlowOut]


class WhatsappBotStatusOut(BaseModel):
    entitlement_active: bool
    entitlement_status: str | None = None
    blocked_reason: str | None = None


class WhatsappBotSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    client_whatsapp: str
    current_flow_id: int | None
    current_flow_name: str | None = None
    current_step_key: str | None
    context: dict[str, Any] = Field(default_factory=dict)
    paused_until: datetime | None
    last_incoming_at: datetime | None
    last_outgoing_at: datetime | None
    created_at: datetime
    updated_at: datetime


class WhatsappBotEventOut(BaseModel):
    id: int
    event_type: str
    payload: dict[str, Any]
    job_id: int | None = None
    created_at: datetime
