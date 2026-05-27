"""Schemas Pydantic — manutenção preventiva e validação estrita de payloads (espelho conceitual de Zod no TS)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas_whatsapp import WhatsappMessageJobOut


class PreventiveSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    preventive_promo_image_url: str | None = None
    preventive_image_url: str | None = None
    preventive_promo_image_mimetype: str | None = Field(default="image/jpeg", max_length=80)
    preventive_technical_problem_hint: str | None = None
    preventive_button_more_text: str = Field(default="Sim, quero saber mais", max_length=80)
    preventive_button_schedule_text: str = Field(default="Agendar agora", max_length=80)
    preventive_message_template: str | None = None
    preventive_auto_remind_days_before: int = Field(default=0, ge=0, le=90)
    preventive_auto_whatsapp_enabled: bool = False
    default_message_template: str | None = None


class PreventiveSettingsPatch(BaseModel):
    preventive_promo_image_url: str | None = Field(default=None, max_length=500)
    preventive_image_url: str | None = Field(default=None, max_length=500)
    preventive_promo_image_mimetype: str | None = Field(default=None, max_length=80)
    preventive_technical_problem_hint: str | None = None
    preventive_button_more_text: str | None = Field(default=None, max_length=80)
    preventive_button_schedule_text: str | None = Field(default=None, max_length=80)
    preventive_message_template: str | None = None
    preventive_auto_remind_days_before: int | None = Field(default=None, ge=0, le=90)
    preventive_auto_whatsapp_enabled: bool | None = None


class HistoricoServicoCreate(BaseModel):
    client_id: int = Field(ge=1)
    service_id: int = Field(ge=1)
    data_realizacao: date
    service_order_id: int | None = Field(default=None, ge=1)
    notes: str | None = Field(default=None, max_length=4000)


class PreventiveHistoricoFromOsCreate(BaseModel):
    """Registro de realização preventiva a partir da OS (usa periodicidade já cadastrada no serviço)."""

    data_realizacao: date | None = None
    notes: str | None = Field(default=None, max_length=4000)


class HistoricoServicoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    client_id: int
    service_id: int
    data_realizacao: date
    service_order_id: int | None = None
    notes: str | None = None
    created_at: datetime


class PreventiveItemOut(BaseModel):
    historico_servico_id: int = 0
    rule_id: int | None = None
    client_id: int
    client_name: str
    service_id: int = 0
    service_name: str
    equipment_id: int | None = None
    equipment_identificacao: str | None = None
    equipment_tipo: str | None = None
    interval_value: int | None = None
    interval_type: Literal["months", "days"] | None = None
    periodicidade_meses: int = 0
    data_ultima_realizacao: date
    data_proximo_vencimento: date
    dias_ate_vencimento: int
    whatsapp_valido: bool
    whatsapp_destino: str | None = None
    ultimo_whatsapp_status: str | None = None
    ultimo_whatsapp_erro: str | None = None
    ultimo_whatsapp_em: datetime | None = None


class PreventiveClientGroupOut(BaseModel):
    client_id: int
    client_name: str
    whatsapp_valido: bool = False
    whatsapp_destino: str | None = None
    equipments: list[PreventiveItemOut] = Field(default_factory=list)


class PreventiveItemsListOut(BaseModel):
    window_days: int | None = None
    year: int | None = Field(default=None, ge=2000, le=2100)
    month: int | None = Field(default=None, ge=1, le=12)
    clients: list[PreventiveClientGroupOut] = Field(default_factory=list)
    items: list[PreventiveItemOut] = Field(default_factory=list)


class EquipmentPreventiveRuleCreate(BaseModel):
    equipment_id: int = Field(ge=1)
    interval_value: int = Field(ge=1, le=120)
    interval_type: Literal["months", "days"] = "months"
    is_active: bool = True


class EquipmentPreventiveRuleUpdate(BaseModel):
    interval_value: int | None = Field(default=None, ge=1, le=120)
    interval_type: Literal["months", "days"] | None = None
    is_active: bool | None = None


class EquipmentPreventiveRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    is_active: bool
    interval_value: int
    interval_type: Literal["months", "days"]
    last_performed_date: datetime | None = None
    next_due_date: datetime | None = None
    created_at: datetime
    updated_at: datetime
    equipment_identificacao: str | None = None
    client_id: int | None = None


class EquipmentServicePreventiveScheduleOut(BaseModel):
    service_id: int
    service_name: str
    service_description: str | None = None
    default_interval_value: int
    default_interval_type: Literal["days", "months", "years"]
    override_interval_value: int | None = None
    override_interval_type: Literal["days", "months", "years"] | None = None
    effective_interval_value: int
    effective_interval_type: Literal["days", "months", "years"]
    last_performed_at: datetime | None = None
    next_due_at: datetime | None = None
    last_service_order_id: int | None = None
    pending_service_order_id: int | None = None
    awaiting_completion: bool = False
    has_override: bool = False


class EquipmentServicePreventiveScheduleListOut(BaseModel):
    items: list[EquipmentServicePreventiveScheduleOut] = Field(default_factory=list)


class EquipmentServicePreventiveOverrideUpsert(BaseModel):
    interval_value: int = Field(ge=1, le=3650)
    interval_type: Literal["days", "months", "years"]


class PreventivePreviewOut(BaseModel):
    message_text: str
    image_url: str | None = None
    image_mimetype: str | None = None
    button_more_label: str
    button_schedule_label: str
    equipment_count: int = 1
    is_grouped: bool = False


class PreventiveSendRequest(BaseModel):
    historico_servico_id: int | None = Field(default=None, ge=1)
    rule_id: int | None = Field(default=None, ge=1)
    client_id: int | None = Field(default=None, ge=1)
    year: int | None = Field(default=None, ge=2000, le=2100)
    month: int | None = Field(default=None, ge=1, le=12)
    window_days: int | None = Field(default=None, ge=1, le=400)
    promo_image_url: str | None = Field(default=None, max_length=500)
    promo_image_base64: str | None = Field(default=None, max_length=350_000)
    promo_image_mimetype: str | None = Field(default=None, max_length=80)
    technical_problem_hint: str | None = Field(default=None, max_length=500)

    @field_validator("promo_image_base64")
    @classmethod
    def _trim_b64(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        return s if s else None

    @model_validator(mode="after")
    def _require_ref(self) -> PreventiveSendRequest:
        by_historico = self.historico_servico_id is not None
        by_rule = self.rule_id is not None
        by_client_month = (
            self.client_id is not None and self.year is not None and self.month is not None
        )
        if sum((by_historico, by_rule, by_client_month)) != 1:
            raise ValueError("Informe historico_servico_id, rule_id ou client_id+year+month.")
        return self


class PreventiveSendReminderOut(BaseModel):
    """Resposta do POST /send-reminder: job preenchido quando síncrono; envio imediato costuma ser em segundo plano."""

    whatsapp_job: WhatsappMessageJobOut | None = None
    processing_in_background: bool = False


class PreventiveBulkSendRequest(BaseModel):
    historico_servico_ids: list[int] = Field(default_factory=list, max_length=300)
    window_days_if_empty: int | None = Field(default=None, ge=1, le=400)
    promo_image_url: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _require_ids_or_window(self) -> PreventiveBulkSendRequest:
        if self.historico_servico_ids:
            return self
        if self.window_days_if_empty is None:
            raise ValueError("Informe historico_servico_ids ou window_days_if_empty.")
        return self


class PreventiveBulkSendOut(BaseModel):
    attempted: int
    sent: int
    failed: int
    errors: list[dict[str, Any]]
    # True quando o envio roda após a resposta HTTP (evita 502 por timeout do proxy com vários disparos Evolution).
    processing_in_background: bool = False


class PreventiveQuickClientCreate(BaseModel):
    """Cadastro mínimo para criar cliente ao registrar preventiva manual."""

    name: str = Field(..., min_length=1, max_length=150)
    phone: str | None = Field(default=None, max_length=20)
    whatsapp: str | None = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def _need_phone_or_whatsapp(self) -> PreventiveQuickClientCreate:
        p = (self.phone or "").strip()
        w = (self.whatsapp or "").strip()
        if not p and not w:
            raise ValueError("Informe telefone ou WhatsApp para o novo cliente.")
        return self


class PreventiveRegisterEntryCreate(BaseModel):
    """Registra última realização preventiva e opcionalmente envia ou agenda lembrete por WhatsApp."""

    entry_mode: Literal["temporary", "existing"] = "temporary"
    client_id: int | None = Field(default=None, ge=1)
    new_client: PreventiveQuickClientCreate | None = None
    equipment_id: int | None = Field(default=None, ge=1)
    equipment_label: str | None = Field(default=None, max_length=120)
    service_id: int = Field(ge=1)
    data_realizacao: date
    notes: str | None = Field(default=None, max_length=4000)
    reminder_send: Literal["none", "now", "scheduled"] = "none"
    reminder_local_date: date | None = None
    reminder_local_time: str | None = Field(default=None, max_length=8)
    promo_image_url: str | None = Field(default=None, max_length=500)
    promo_image_base64: str | None = Field(default=None, max_length=350_000)
    promo_image_mimetype: str | None = Field(default=None, max_length=80)
    technical_problem_hint: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _client_xor(self) -> PreventiveRegisterEntryCreate:
        has_id = self.client_id is not None
        has_new = self.new_client is not None
        if has_id == has_new:
            raise ValueError("Informe exatamente um de: client_id ou new_client.")
        if self.reminder_send == "scheduled" and self.reminder_local_date is None:
            raise ValueError("Informe reminder_local_date ao agendar o lembrete.")
        if self.equipment_id is None and not (self.equipment_label or "").strip():
            raise ValueError("Informe equipment_id ou equipment_label (apelido do aparelho).")
        return self


class PreventiveRegisterEntryOut(BaseModel):
    historico: HistoricoServicoOut
    whatsapp_job: WhatsappMessageJobOut | None = None


class PreventiveLeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: int
    tenant_id: int
    client_id: int
    historico_servico_id: int | None = None
    whatsapp_digits: str
    interest_kind: Literal["more", "schedule"]
    message_text: str | None = None
    provider_message_id: str | None = None
    created_at: datetime


class EvolutionMessageKey(BaseModel):
    """Subconjunto validado do payload Evolution `messages.upsert` (entrada webhook)."""

    model_config = ConfigDict(extra="ignore")

    id: str | None = None
    remoteJid: str | None = None
    fromMe: bool | None = None


class EvolutionIncomingButtonPick(BaseModel):
    """Resposta a botão — estruturas comuns Baileys/Evolution."""

    model_config = ConfigDict(extra="ignore")

    selectedButtonId: str | None = None
    selectedDisplayText: str | None = None


class EvolutionIncomingMessageBlock(BaseModel):
    model_config = ConfigDict(extra="ignore")

    conversation: str | None = None
    extendedTextMessage: dict[str, Any] | None = None
    buttonsResponseMessage: EvolutionIncomingButtonPick | dict[str, Any] | None = None


class EvolutionUpsertData(BaseModel):
    """Campos usados para detectar interesse na campanha preventiva."""

    model_config = ConfigDict(extra="ignore")

    key: EvolutionMessageKey | dict[str, Any] | None = None
    message: EvolutionIncomingMessageBlock | dict[str, Any] | None = None
    messageTimestamp: int | float | None = None
