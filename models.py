from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TenantStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    TECHNICIAN = "technician"
    RECEPTIONIST = "receptionist"


class OrderStatus(str, enum.Enum):
    OPEN = "open"
    APPROVED = "approved"
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"


class BudgetStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class QrCodeStatus(str, enum.Enum):
    AVAILABLE = "available"
    LINKED = "linked"


class ScheduleStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class StockMovementReason(str, enum.Enum):
    OS_CONSUMPTION = "os_consumption"
    MANUAL_ADJUST = "manual_adjust"
    PURCHASE = "purchase"


class PreventiveIntervalType(str, enum.Enum):
    MONTHS = "months"
    DAYS = "days"


class BillingPaymentGateway(str, enum.Enum):
    ASAAS = "asaas"
    MERCADO_PAGO = "mercado_pago"
    MANUAL = "manual"


class FinanceEntryType(str, enum.Enum):
    INCOME = "income"
    EXPENSE = "expense"


class FinanceEntryStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"
    AWAITING_INVOICE = "awaiting_invoice"


class FinanceCreditCardInvoiceStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"
    PAID = "paid"


class FinanceRecurringStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"


class FinanceRecurringFrequency(str, enum.Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class FinanceGatewayProvider(str, enum.Enum):
    ASAAS = "asaas"
    MERCADOPAGO = "mercadopago"
    STONE = "stone"


class NfseProvider(str, enum.Enum):
    NATIONAL_MEI = "national_mei"
    FOCUS = "focus"


class NfseInvoiceStatus(str, enum.Enum):
    PENDING_SUBMISSION = "pending_submission"
    ISSUED = "issued"
    FAILED = "failed"
    CANCELLED = "cancelled"


class FinanceAccountType(str, enum.Enum):
    CHECKING = "checking"
    SAVINGS = "savings"
    INVESTMENT = "investment"
    DIGITAL_WALLET = "digital_wallet"
    CASH = "cash"
    OTHER = "other"


class EquipmentType(str, enum.Enum):
    AR_CONDICIONADO = "AR_CONDICIONADO"


class EquipmentCatalogCategory(str, enum.Enum):
    """Legado — substituído por tabela equipment_categories (migração 20260518_0078)."""

    AIR_CONDITIONER = "AIR_CONDITIONER"
    REFRIGERATOR = "REFRIGERATOR"
    WATER_COOLER = "WATER_COOLER"
    OTHER = "OTHER"


class EquipmentCatalogComponentType(str, enum.Enum):
    """Tipo de peça no catálogo (multi-split: condensadora + evaporadoras)."""

    UNICO = "UNICO"
    EVAPORADORA = "EVAPORADORA"
    CONDENSADORA = "CONDENSADORA"


class EquipmentCategory(Base):
    """Categoria configurável por tenant (campos técnicos opcionais por flags)."""

    __tablename__ = "equipment_categories"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_equipment_categories_tenant_name"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    icon_key: Mapped[str] = mapped_column(String(40), nullable=False, default="outros")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    has_fluid_type: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_capacity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_voltage: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    field_definitions: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship()
    catalog_entries: Mapped[list["EquipmentCatalog"]] = relationship(back_populates="category")


class EquipmentDocumentType(str, enum.Enum):
    PMOC = "pmoc"
    TECHNICAL_REPORT = "technical_report"
    HYGIENE_REPORT = "hygiene_report"


class EquipmentDocumentStatus(str, enum.Enum):
    DRAFT = "draft"
    ISSUED = "issued"
    SIGNED = "signed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class PmocPlanStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


class PmocActivityFrequency(str, enum.Enum):
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMIANNUAL = "semiannual"
    ANNUAL = "annual"
    CUSTOM = "custom"


class PmocExecutionCompletion(str, enum.Enum):
    DONE = "done"
    PARTIAL = "partial"
    SKIPPED = "skipped"


class PmocOccurrenceStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"


class WhatsappMessageStatus(str, enum.Enum):
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # Cadastro fiscal: CNPJ (14) ou CPF (11), somente dígitos. Nome da coluna legado no banco.
    cnpj: Mapped[str] = mapped_column(String(18), unique=True, nullable=False, index=True)
    tax_id_kind: Mapped[str] = mapped_column(String(8), nullable=False, default="cnpj")
    active_plan: Mapped[str] = mapped_column(String(80), nullable=False)
    finance_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    inventory_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Flags de funcionalidades beta por workspace: {"new_laudo": true, "dre_dashboard": false}
    features_enabled: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    finance_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="basic")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    business_days: Mapped[str] = mapped_column(String(32), nullable=False, default="0,1,2,3,4")
    workday_start: Mapped[str] = mapped_column(String(5), nullable=False, default="08:00")
    workday_end: Mapped[str] = mapped_column(String(5), nullable=False, default="18:00")
    weekday_work_hours: Mapped[str | None] = mapped_column(Text, nullable=True)
    block_national_holidays: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    address_street: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address_complement: Mapped[str | None] = mapped_column(String(120), nullable=True)
    address_district: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address_state: Mapped[str | None] = mapped_column(String(2), nullable=True)
    address_postal_code: Mapped[str | None] = mapped_column(String(12), nullable=True)
    address_country: Mapped[str] = mapped_column(String(60), nullable=False, default="Brasil")
    address_ibge_code: Mapped[str | None] = mapped_column(String(7), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    trade_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    state_registration: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ie_indicator: Mapped[str | None] = mapped_column(String(2), nullable=True)
    main_activity_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    main_activity_description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    legal_nature: Mapped[str | None] = mapped_column(String(150), nullable=True)
    registration_status: Mapped[str | None] = mapped_column(String(80), nullable=True)
    founded_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_verified_cnpj: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_cnpj_commercial_update: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cnpj_commercial_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    whatsapp_instance_name: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True)
    whatsapp_connection_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    whatsapp_connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    whatsapp_appointment_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    whatsapp_appointment_confirm_keyword: Mapped[str | None] = mapped_column(String(20), nullable=True)
    whatsapp_appointment_reschedule_keyword: Mapped[str | None] = mapped_column(String(20), nullable=True)
    whatsapp_appointment_confirm_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    whatsapp_appointment_reschedule_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    whatsapp_appointment_cancel_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    whatsapp_reminder_offsets_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    whatsapp_reminder_custom_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    whatsapp_agenda_dispatch_scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    whatsapp_automation_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    logo_s3_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    logo_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pdf_primary_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#0B7FAF")
    cft_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    preventive_promo_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    preventive_promo_image_s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    preventive_promo_image_mimetype: Mapped[str | None] = mapped_column(String(80), nullable=True)
    preventive_promo_image_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    preventive_technical_problem_hint: Mapped[str | None] = mapped_column(Text, nullable=True)
    preventive_button_more_text: Mapped[str] = mapped_column(String(80), nullable=False, default="Sim, quero saber mais")
    preventive_button_schedule_text: Mapped[str] = mapped_column(String(80), nullable=False, default="Agendar agora")
    preventive_message_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    preventive_message_template_first: Mapped[str | None] = mapped_column(Text, nullable=True)
    preventive_default_template_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="returning")
    preventive_ai_message_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    preventive_ai_message_fidelity: Mapped[str] = mapped_column(String(16), nullable=False, default="faithful")
    preventive_auto_schedule_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    preventive_action_buttons_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    preventive_button_schedule_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    preventive_button_custom_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    preventive_button_custom_result: Mapped[str] = mapped_column(String(16), nullable=False, default="lead")
    preventive_button_custom_reply_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    preventive_button_custom_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    preventive_message_models_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    preventive_default_template_model_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 0 = só lembrete no dia do vencimento; N>0 = também envia quando faltam N dias (calendário do tenant.timezone).
    preventive_auto_remind_days_before: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    preventive_auto_whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # days_before | month_first_business_day
    preventive_auto_whatsapp_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="days_before")
    stripe_customer_id: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True, index=True)
    subscription_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    subscription_current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    subscription_cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    subscription_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[TenantStatus] = mapped_column(
        Enum(TenantStatus, name="tenant_status", values_callable=lambda items: [item.value for item in items]),
        nullable=False,
        default=TenantStatus.ACTIVE,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    users: Mapped[list["User"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    clients: Mapped[list["Client"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    products: Mapped[list["Product"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    stock_movements: Mapped[list["StockMovement"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    product_purchases: Mapped[list["ProductPurchase"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    services: Mapped[list["Service"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    service_orders: Mapped[list["ServiceOrder"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    budgets: Mapped[list["Budget"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    budget_template_settings: Mapped["BudgetTemplateSettings | None"] = relationship(
        back_populates="tenant", uselist=False, cascade="all, delete-orphan"
    )
    qrcodes: Mapped[list["QrCode"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    schedules: Mapped[list["Schedule"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    holidays: Mapped[list["TenantHoliday"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    api_keys: Mapped[list["TenantApiKey"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    finance_categories: Mapped[list["FinanceCategory"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    finance_entries: Mapped[list["FinanceEntry"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    finance_recurring_transactions: Mapped[list["FinanceRecurringTransaction"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    finance_payment_fees: Mapped[list["TenantFinancePaymentFee"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    finance_accounts: Mapped[list["FinanceBankAccount"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    finance_credit_cards: Mapped[list["FinanceCreditCard"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    finance_gateways: Mapped[list["TenantFinanceGateway"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    finance_ofx_imports: Mapped[list["FinanceOfxImport"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    nfse_settings: Mapped["TenantNfseSettings | None"] = relationship(
        back_populates="tenant", uselist=False, cascade="all, delete-orphan"
    )
    nfse_invoices: Mapped[list["NfseInvoice"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    whatsapp_jobs: Mapped[list["WhatsappMessageJob"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    whatsapp_events: Mapped[list["WhatsappMessageEvent"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    whatsapp_reschedule_options: Mapped[list["WhatsappRescheduleOption"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    whatsapp_bot_settings: Mapped["WhatsappBotSettings | None"] = relationship(
        back_populates="tenant", uselist=False, cascade="all, delete-orphan"
    )
    whatsapp_bot_flows: Mapped[list["WhatsappBotFlow"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    whatsapp_bot_sessions: Mapped[list["WhatsappBotSession"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    whatsapp_broadcast_campaigns: Mapped[list["WhatsappBroadcastCampaign"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    plan_change_logs: Mapped[list["TenantPlanChangeLog"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    marketplace_entitlements: Mapped[list["TenantMarketplaceEntitlement"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    pmoc_plans: Mapped[list["PmocPlan"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    product_images: Mapped[list["ProductImage"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    mercado_livre_account: Mapped["TenantMercadoLivreAccount | None"] = relationship(
        back_populates="tenant", uselist=False, cascade="all, delete-orphan"
    )
    mercado_livre_product_links: Mapped[list["MercadoLivreProductLink"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    ai_settings: Mapped["TenantAISettings | None"] = relationship(
        back_populates="tenant", uselist=False, cascade="all, delete-orphan"
    )
    ai_chat_history: Mapped[list["AIChatHistory"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    ai_pending_tool_confirmations: Mapped[list["AIPendingToolConfirmation"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    historico_servicos: Mapped[list["HistoricoServico"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    lembretes_preventivos: Mapped[list["LembretePreventivo"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    preventive_interest_leads: Mapped[list["PreventiveInterestLead"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    preventive_reminder_contexts: Mapped[list["PreventiveReminderContext"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    preventive_schedule_flows: Mapped[list["PreventiveScheduleFlow"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )


class TenantAISettings(Base):
    __tablename__ = "tenant_ai_settings"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_tenant_ai_settings_tenant"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_name: Mapped[str] = mapped_column(String(80), nullable=False, default="Assistente")
    tone_of_voice: Mapped[str] = mapped_column(String(20), nullable=False, default="amigavel")
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_slug: Mapped[str] = mapped_column(String(80), nullable=False, default="claude-haiku-4-5-20251201")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Visibilidade no contexto enviado ao modelo (LGPD / escopo comercial).
    ai_context_products: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ai_context_service_prices: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ai_context_services_catalog: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Ferramentas: cobrança desligada por padrão.
    ai_tool_billing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ai_tool_cancel: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ai_tool_reschedule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ai_tool_agenda_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ai_allow_direct_schedule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ai_allow_auto_client_create: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ai_clarification_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)

    tenant: Mapped["Tenant"] = relationship(back_populates="ai_settings")


class AIChatHistory(Base):
    __tablename__ = "ai_chat_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    user_message: Mapped[str] = mapped_column(Text, nullable=False)
    assistant_response: Mapped[str] = mapped_column(Text, nullable=False)
    used_model: Mapped[str | None] = mapped_column(String(80), nullable=True)
    used_tools_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt_xml: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_mock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="ai_chat_history")


class AIPendingToolConfirmation(Base):
    __tablename__ = "ai_pending_tool_confirmations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "client_whatsapp", name="uq_ai_pending_tool_tenant_client"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_whatsapp: Mapped[str] = mapped_column(String(20), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(80), nullable=False)
    arguments_json: Mapped[str] = mapped_column(Text, nullable=False)
    confirmation_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    tenant: Mapped["Tenant"] = relationship(back_populates="ai_pending_tool_confirmations")


class MarketplaceEntitlementStatus(str, enum.Enum):
    REQUESTED = "requested"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"


class TenantHoliday(Base):
    __tablename__ = "tenant_holidays"
    __table_args__ = (UniqueConstraint("tenant_id", "holiday_date", name="uq_tenant_holiday_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    holiday_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(String(200))

    tenant: Mapped["Tenant"] = relationship(back_populates="holidays")


class TenantApiKey(Base):
    """Chave de API por workspace (segredo armazenado só como hash SHA-256)."""

    __tablename__ = "tenant_api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant: Mapped["Tenant"] = relationship(back_populates="api_keys")


class PlatformApiCredential(Base):
    """Credenciais de provedores externos do SaaS (não expõe chave completa na API)."""

    __tablename__ = "platform_api_credentials"
    __table_args__ = (UniqueConstraint("provider_slug", name="uq_platform_api_credentials_provider_slug"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_slug: Mapped[str] = mapped_column(String(64), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    api_base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    api_key_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_key_preview: Mapped[str | None] = mapped_column(String(32), nullable=True)
    aws_access_key_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    aws_access_key_id_preview: Mapped[str | None] = mapped_column(String(32), nullable=True)
    aws_secret_access_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    aws_secret_access_key_preview: Mapped[str | None] = mapped_column(String(32), nullable=True)
    aws_keys_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    extra_config_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PlatformBranding(Base):
    """Identidade visual global do SaaS (logo, favicon, nome) — singleton id=1."""

    __tablename__ = "platform_branding"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    platform_name: Mapped[str] = mapped_column(String(120), nullable=False, default="Climaris")
    logo_s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    logo_content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    logo_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    favicon_s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    favicon_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    favicon_content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    favicon_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class DemoAppointmentStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class PlatformProjectStatus(str, enum.Enum):
    LEAD = "lead"
    ONBOARDING = "onboarding"
    IMPLEMENTATION = "implementation"
    DELIVERED = "delivered"
    ON_HOLD = "on_hold"
    CANCELLED = "cancelled"


class PlatformProjectPriority(str, enum.Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class PlatformProjectTaskStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    BLOCKED = "blocked"


class WebsiteLead(Base):
    __tablename__ = "website_leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    company: Mapped[str | None] = mapped_column(String(160), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="website", index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="new", index=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(80), nullable=True)
    technicians_count: Mapped[str | None] = mapped_column(String(24), nullable=True)
    selected_plan: Mapped[str | None] = mapped_column(String(80), nullable=True)
    lgpd_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class PlatformWebsiteSettings(Base):
    __tablename__ = "platform_website_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hero_title: Mapped[str] = mapped_column(String(200), nullable=False)
    hero_subtitle: Mapped[str] = mapped_column(String(500), nullable=False)
    seo_title: Mapped[str] = mapped_column(String(200), nullable=False)
    seo_description: Mapped[str] = mapped_column(String(500), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(254), nullable=False, default="contato@climaris.com.br")
    contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    legal_name: Mapped[str] = mapped_column(String(160), nullable=False, default="Climaris")
    trade_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    cnpj: Mapped[str | None] = mapped_column(String(18), nullable=True)
    is_verified_cnpj: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cnpj_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dpo_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    dpo_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    address_street: Mapped[str] = mapped_column(String(200), nullable=False)
    address_city: Mapped[str] = mapped_column(String(80), nullable=False, default="Araraquara")
    address_state: Mapped[str] = mapped_column(String(2), nullable=False, default="SP")
    address_postal: Mapped[str] = mapped_column(String(12), nullable=False, default="14800-000")
    services_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    hero_s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    hero_content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    hero_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dashboard_s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    dashboard_content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    dashboard_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finance_s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    finance_content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    finance_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    orders_s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    orders_content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    orders_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PlatformWebsitePage(Base):
    __tablename__ = "platform_website_pages"

    slug: Mapped[str] = mapped_column(String(80), primary_key=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    path: Mapped[str] = mapped_column(String(200), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    subtitle: Mapped[str] = mapped_column(String(200), nullable=False)
    hero_description: Mapped[str] = mapped_column(String(500), nullable=False)
    seo_title: Mapped[str] = mapped_column(String(200), nullable=False)
    seo_description: Mapped[str] = mapped_column(String(500), nullable=False)
    sections_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    outcomes_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    images_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class DemoAppointment(Base):
    __tablename__ = "demo_appointments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    website_lead_id: Mapped[int | None] = mapped_column(
        ForeignKey("website_leads.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    company: Mapped[str | None] = mapped_column(String(160), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(80), nullable=True)
    technicians_count: Mapped[str | None] = mapped_column(String(24), nullable=True)
    selected_plan: Mapped[str | None] = mapped_column(String(80), nullable=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=45)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default=DemoAppointmentStatus.SCHEDULED.value, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class DemoScheduleBlock(Base):
    __tablename__ = "demo_schedule_blocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PlatformProject(Base):
    __tablename__ = "platform_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    company_name: Mapped[str] = mapped_column(String(160), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    demo_appointment_id: Mapped[int | None] = mapped_column(
        ForeignKey("demo_appointments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default=PlatformProjectStatus.LEAD.value, index=True
    )
    priority: Mapped[str] = mapped_column(
        String(16), nullable=False, default=PlatformProjectPriority.NORMAL.value
    )
    delivery_deadline: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tasks: Mapped[list["PlatformProjectTask"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class PlatformProjectTask(Base):
    __tablename__ = "platform_project_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("platform_projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default=PlatformProjectTaskStatus.PENDING.value, index=True
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project: Mapped["PlatformProject"] = relationship(back_populates="tasks")


class NotificationKind(str, enum.Enum):
    SERVICE_ORDER_CREATED = "service_order_created"
    SERVICE_ORDER_SCHEDULED = "service_order_scheduled"
    SERVICE_ORDER_STARTED = "service_order_started"
    SERVICE_ORDER_DONE = "service_order_done"
    SERVICE_ORDER_CANCELLED = "service_order_cancelled"
    BUDGET_APPROVED = "budget_approved"
    FINANCE_PAYMENT_RECEIVED = "finance_payment_received"
    WHATSAPP_SEND_FAILED = "whatsapp_send_failed"
    PLATFORM_ANNOUNCEMENT = "platform_announcement"
    SYSTEM = "system"


class UserNotification(Base):
    __tablename__ = "user_notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    link_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    entity_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    actor_user: Mapped["User | None"] = relationship(foreign_keys=[actor_user_id])


class PlatformNotificationBroadcast(Base):
    __tablename__ = "platform_notification_broadcasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    link_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    audience: Mapped[str] = mapped_column(String(40), nullable=False, default="all", index=True)
    recipients_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tenant_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    created_by_user: Mapped["User | None"] = relationship(foreign_keys=[created_by_user_id])

    @property
    def audience_label(self) -> str | None:
        from app.platform_broadcast_audiences import AUDIENCE_LABELS

        return AUDIENCE_LABELS.get(self.audience)

    @property
    def created_by_name(self) -> str | None:
        return self.created_by_user.full_name if self.created_by_user else None


class SaasPlanCatalog(Base):
    """Catálogo editável de planos (nomes, textos da matriz, teto financeiro) — painel /operacao."""

    __tablename__ = "saas_plan_catalog"

    plan_key: Mapped[str] = mapped_column(String(80), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    footnote: Mapped[str] = mapped_column(Text, nullable=False, default="")
    finance_max_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="basic")
    max_users: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_beta_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_contract: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_selectable_for_tenants: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_in_matrix: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    monthly_price_brl: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    stripe_product_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    stripe_price_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    dashboard_tier: Mapped[str] = mapped_column(String(20), nullable=False, default="basic")
    products_inventory_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    products_purchases_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    products_max_images: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=lambda items: [item.value for item in items]),
        nullable=False,
        default=UserRole.RECEPTIONIST,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    login_blocked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_platform_operator: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="users")
    assigned_orders: Mapped[list["ServiceOrderTechnician"]] = relationship(back_populates="technician")
    assigned_schedules: Mapped[list["ScheduleTechnician"]] = relationship(back_populates="technician")
    work_windows: Mapped[list["TechnicianWorkWindow"]] = relationship(
        back_populates="technician", cascade="all, delete-orphan"
    )
    break_windows: Mapped[list["TechnicianBreakWindow"]] = relationship(
        back_populates="technician", cascade="all, delete-orphan"
    )
    unavailable_blocks: Mapped[list["TechnicianUnavailability"]] = relationship(
        back_populates="technician", cascade="all, delete-orphan"
    )
    email_verification_token: Mapped["EmailVerificationToken | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )
    password_reset_token: Mapped["PasswordResetToken | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )
    platform_plan_changes: Mapped[list["TenantPlanChangeLog"]] = relationship(back_populates="changed_by_user")
    whatsapp_jobs_created: Mapped[list["WhatsappMessageJob"]] = relationship(back_populates="created_by_user")
    equipment_link_audits: Mapped[list["ServiceOrderServiceItemEquipmentAudit"]] = relationship()
    trusted_login_devices: Mapped[list["LoginTrustedDevice"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    refresh_tokens: Mapped[list["LoginRefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class TenantPlanChangeLog(Base):
    __tablename__ = "tenant_plan_change_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    previous_plan: Mapped[str] = mapped_column(String(80), nullable=False)
    new_plan: Mapped[str] = mapped_column(String(80), nullable=False)
    changed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    changed_by_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="plan_change_logs")
    changed_by_user: Mapped["User | None"] = relationship(back_populates="platform_plan_changes")


class MarketplaceApp(Base):
    """Catálogo global de integrações / apps vendidos na loja da plataforma."""

    __tablename__ = "marketplace_apps"
    __table_args__ = (UniqueConstraint("slug", name="uq_marketplace_apps_slug"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    short_description: Mapped[str] = mapped_column(String(400), nullable=False)
    long_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    monthly_price_brl: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    setup_fee_brl: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    feature_flag_key: Mapped[str] = mapped_column(String(80), nullable=False)
    allow_quantity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    unit_label: Mapped[str | None] = mapped_column(String(40), nullable=True)
    user_seats_per_unit: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    entitlements: Mapped[list["TenantMarketplaceEntitlement"]] = relationship(
        back_populates="marketplace_app", cascade="all, delete-orphan"
    )


class TenantMarketplaceEntitlement(Base):
    """Contratação / status de um app da loja por tenant."""

    __tablename__ = "tenant_marketplace_entitlements"
    __table_args__ = (UniqueConstraint("tenant_id", "marketplace_app_id", name="uq_tenant_marketplace_app"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    marketplace_app_id: Mapped[int] = mapped_column(
        ForeignKey("marketplace_apps.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[MarketplaceEntitlementStatus] = mapped_column(
        Enum(
            MarketplaceEntitlementStatus,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=24,
        ),
        nullable=False,
        default=MarketplaceEntitlementStatus.REQUESTED,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    tenant_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="marketplace_entitlements")
    marketplace_app: Mapped["MarketplaceApp"] = relationship(back_populates="entitlements")


class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="email_verification_token")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="password_reset_token")


class LoginAttemptAudit(Base):
    __tablename__ = "login_attempt_audits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    tenant_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    device_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    outcome: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class LoginClientSecurityState(Base):
    __tablename__ = "login_client_security_states"
    __table_args__ = (UniqueConstraint("email", "device_fingerprint", name="uq_login_client_state_email_device"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    device_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    failed_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    blocked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class LoginCaptchaChallenge(Base):
    __tablename__ = "login_captcha_challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    device_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    answer_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LoginTwoFactorChallenge(Base):
    __tablename__ = "login_two_factor_challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LoginTrustedDevice(Base):
    """Dispositivo confiável após 2FA (cookie HTTP-only + hash do token)."""

    __tablename__ = "login_trusted_devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    user_agent_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="trusted_login_devices")


class LoginRefreshToken(Base):
    """Refresh token opaco (hash no banco) para emitir novos JWT de acesso sem novo login."""

    __tablename__ = "login_refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")


class Client(Base):
    __tablename__ = "clients"
    __table_args__ = (
        UniqueConstraint("tenant_id", "document", name="uq_clients_tenant_document"),
        UniqueConstraint("tenant_id", "phone", name="uq_clients_tenant_phone"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # CPF (11) ou CNPJ (14), somente dígitos — alinhado a cpf_destinatario / cnpj_destinatario (Focus NFe NFe).
    document: Mapped[str | None] = mapped_column(String(20), nullable=True)
    tax_id_kind: Mapped[str] = mapped_column(String(8), nullable=False, default="cnpj")
    optante_mei: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255))
    # Nome fantasia (PJ); opcional.
    trade_name: Mapped[str | None] = mapped_column(String(150))
    # Pessoa de contato na empresa (PJ); exibido na lista de clientes.
    contact_person_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    # Documentos complementares de Pessoa Física.
    rg: Mapped[str | None] = mapped_column(String(20), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Inscrição estadual do destinatário; pode ser "ISENTO" quando aplicável.
    state_registration: Mapped[str | None] = mapped_column(String(20))
    # NFe: indicador_inscricao_estadual_destinatario — 1 contribuinte, 2 isento, 9 não contribuinte.
    ie_indicator: Mapped[str | None] = mapped_column(String(2))
    # NFS-e: inscrição municipal do tomador (quando a prefeitura exigir).
    municipal_registration: Mapped[str | None] = mapped_column(String(20))
    # Endereço: NFe (destinatário) e NFSe (tomador.endereco); codigo_municipio IBGE 7 dígitos.
    address_street: Mapped[str | None] = mapped_column(String(255))
    address_number: Mapped[str | None] = mapped_column(String(20))
    address_complement: Mapped[str | None] = mapped_column(String(120))
    address_district: Mapped[str | None] = mapped_column(String(100))
    address_city: Mapped[str | None] = mapped_column(String(100))
    address_state: Mapped[str | None] = mapped_column(String(2))
    address_postal_code: Mapped[str | None] = mapped_column(String(12))
    address_country: Mapped[str] = mapped_column(String(60), nullable=False, default="Brasil")
    address_ibge_code: Mapped[str | None] = mapped_column(String(7))
    preventive_campaign_opt_out: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    # True após consulta CNPJA bem-sucedida; trava CNPJ, razão social e tipo no cadastro.
    is_verified_cnpj: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Última atualização via API comercial CNPJá (limite de 60 dias entre consultas pagas).
    last_cnpj_commercial_update: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Enriquecimento CNPJá comercial (Receita + Cadastro de Contribuintes).
    main_activity_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    main_activity_description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    legal_nature: Mapped[str | None] = mapped_column(String(150), nullable=True)
    registration_status: Mapped[str | None] = mapped_column(String(80), nullable=True)
    founded_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Observações livres e tags/categorias (ex.: "Contrato PMOC", "Cliente recorrente").
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    logo_s3_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    logo_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="clients")
    service_orders: Mapped[list["ServiceOrder"]] = relationship(back_populates="client")
    budgets: Mapped[list["Budget"]] = relationship(back_populates="client")
    schedules: Mapped[list["Schedule"]] = relationship(back_populates="client")
    equipments: Mapped[list["Equipment"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="Equipment.id.desc()"
    )
    catalog_equipments: Mapped[list["ClientEquipment"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="ClientEquipment.created_at.desc()"
    )
    pmoc_plans: Mapped[list["PmocPlan"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="PmocPlan.id.desc()"
    )
    nfse_invoices: Mapped[list["NfseInvoice"]] = relationship(back_populates="client")
    historico_servicos: Mapped[list["HistoricoServico"]] = relationship(back_populates="client")
    billing_automation: Mapped["CustomerBillingAutomation | None"] = relationship(
        back_populates="client", uselist=False, cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list["ClientAuditLog"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="ClientAuditLog.id.desc()"
    )
    sites: Mapped[list["ClientSite"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="ClientSite.name.asc()"
    )
    addresses: Mapped[list["ClientAddress"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="ClientAddress.created_at.asc()"
    )
    contacts: Mapped[list["ClientContact"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="ClientContact.id.asc()"
    )
    contracts: Mapped[list["ClientContract"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="ClientContract.created_at.desc()"
    )


class ClientSite(Base):
    """Unidade / filial / matriz / local de instalação do cliente (Unidades e Filiais)."""

    __tablename__ = "client_sites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # matriz | filial | unidade_operacional | local_instalacao | sem_cnpj
    site_type: Mapped[str] = mapped_column(String(30), nullable=False, server_default="filial")
    nickname: Mapped[str | None] = mapped_column(String(150), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    responsible_role: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # CNPJ/CPF próprio da unidade (quando `has_own_document` é verdadeiro).
    has_own_document: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    document: Mapped[str | None] = mapped_column(String(20), nullable=True)
    legal_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    trade_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    state_registration: Mapped[str | None] = mapped_column(String(20), nullable=True)
    municipal_registration: Mapped[str | None] = mapped_column(String(20), nullable=True)
    street: Mapped[str | None] = mapped_column(String(255), nullable=True)
    number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    complement: Mapped[str | None] = mapped_column(String(120), nullable=True)
    neighborhood: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(2), nullable=True)
    cep: Mapped[str | None] = mapped_column(String(12), nullable=True)
    reference_point: Mapped[str | None] = mapped_column(String(255), nullable=True)
    has_equipment: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    participates_pmoc: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    use_main_contacts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    use_main_billing_address: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship()
    client: Mapped["Client"] = relationship(back_populates="sites")
    equipments: Mapped[list["Equipment"]] = relationship(back_populates="client_site")
    catalog_equipments: Mapped[list["ClientEquipment"]] = relationship(back_populates="client_site")


class ClientAddress(Base):
    __tablename__ = "client_addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    client_site_id: Mapped[int | None] = mapped_column(
        ForeignKey("client_sites.id", ondelete="SET NULL"), nullable=True, index=True
    )
    address_type: Mapped[str] = mapped_column(String(20), nullable=False, default="outros")
    street: Mapped[str | None] = mapped_column(String(255), nullable=True)
    number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    complement: Mapped[str | None] = mapped_column(String(120), nullable=True)
    neighborhood: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(2), nullable=True)
    cep: Mapped[str | None] = mapped_column(String(12), nullable=True)
    reference_point: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_principal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    use_for_billing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    use_for_pmoc: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    use_for_service_orders: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    use_for_correspondence: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship()
    client: Mapped["Client"] = relationship(back_populates="addresses")
    client_site: Mapped["ClientSite | None"] = relationship()


class ClientAuditLog(Base):
    __tablename__ = "client_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    changes_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    client: Mapped["Client"] = relationship(back_populates="audit_logs")
    user: Mapped["User | None"] = relationship()


class ClientContact(Base):
    """Contato adicional do cliente (multi-contato: nome, cargo, preferências de notificação)."""

    __tablename__ = "client_contacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    client_site_id: Mapped[int | None] = mapped_column(
        ForeignKey("client_sites.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="outros")
    role: Mapped[str | None] = mapped_column(String(100), nullable=True)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    receives_service_orders: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    receives_pmoc: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    receives_financial: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    receives_contracts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    receives_whatsapp_notifications: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    receives_automatic_emails: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_principal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship()
    client: Mapped["Client"] = relationship(back_populates="contacts")
    client_site: Mapped["ClientSite | None"] = relationship()


class ClientContract(Base):
    """Contrato comercial do cliente (tabela criada em 20260708_0145; modelo adicionado depois)."""

    __tablename__ = "client_contracts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "contract_number", name="uq_client_contracts_tenant_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    client_site_id: Mapped[int | None] = mapped_column(
        ForeignKey("client_sites.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    budget_id: Mapped[int | None] = mapped_column(
        ForeignKey("budgets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    pmoc_plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("pmoc_plans.id", ondelete="SET NULL"), nullable=True, index=True
    )
    responsible_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    contract_number: Mapped[str] = mapped_column(String(40), nullable=False)
    display_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    contract_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    contract_type: Mapped[str] = mapped_column(String(80), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False, default="sob_demanda")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    recurrence: Mapped[str] = mapped_column(String(20), nullable=False, default="annual")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    value_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    due_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    adjustment_index: Mapped[str | None] = mapped_column(String(40), nullable=True)
    adjustment_period: Mapped[str | None] = mapped_column(String(20), nullable=True)
    late_fee_percent: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    interest_percent: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    auto_renewal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    expiry_notice_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    coverage_location: Mapped[str | None] = mapped_column(Text, nullable=True)
    billing_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    form_category_label: Mapped[str | None] = mapped_column(String(40), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship()
    client: Mapped["Client"] = relationship(back_populates="contracts")
    contract_equipments: Mapped[list["ClientContractEquipment"]] = relationship(
        back_populates="client_contract",
        cascade="all, delete-orphan",
        order_by="ClientContractEquipment.sort_order",
    )
    contract_services: Mapped[list["ClientContractService"]] = relationship(
        back_populates="client_contract",
        cascade="all, delete-orphan",
        order_by="ClientContractService.sort_order",
    )
    attachments: Mapped[list["ClientContractAttachment"]] = relationship(
        back_populates="client_contract",
        cascade="all, delete-orphan",
        order_by="ClientContractAttachment.created_at",
    )


class ClientContractEquipment(Base):
    """Equipamentos do catálogo do cliente vinculados ao contrato comercial."""

    __tablename__ = "client_contract_equipments"
    __table_args__ = (
        UniqueConstraint("client_contract_id", "client_equipment_id", name="uq_client_contract_equipment"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_contract_id: Mapped[int] = mapped_column(
        ForeignKey("client_contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_equipment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("client_equipments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    client_contract: Mapped["ClientContract"] = relationship(back_populates="contract_equipments")
    client_equipment: Mapped["ClientEquipment"] = relationship()


class ClientContractService(Base):
    """Serviços cobertos pelo contrato (lista livre / catálogo de opções do formulário)."""

    __tablename__ = "client_contract_services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_contract_id: Mapped[int] = mapped_column(
        ForeignKey("client_contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_name: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    client_contract: Mapped["ClientContract"] = relationship(back_populates="contract_services")


class ClientContractAttachment(Base):
    """Documento anexo do contrato (PDF/JPG/PNG) armazenado no S3."""

    __tablename__ = "client_contract_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_contract_id: Mapped[int] = mapped_column(
        ForeignKey("client_contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_type: Mapped[str] = mapped_column(String(80), nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_s3_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_url: Mapped[str | None] = mapped_column(String(800), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploaded_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client_contract: Mapped["ClientContract"] = relationship(back_populates="attachments")


class Equipment(Base):
    __tablename__ = "equipments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    client_site_id: Mapped[int | None] = mapped_column(
        ForeignKey("client_sites.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tipo: Mapped[EquipmentType] = mapped_column(
        Enum(
            EquipmentType,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=40,
        ),
        nullable=False,
        default=EquipmentType.AR_CONDICIONADO,
    )
    identificacao: Mapped[str] = mapped_column(String(120), nullable=False)
    fabricante: Mapped[str | None] = mapped_column(String(120), nullable=True)
    modelo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    serial: Mapped[str | None] = mapped_column(String(120), nullable=True)
    capacidade_btu: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tipo_gas: Mapped[str | None] = mapped_column(String(40), nullable=True)
    voltagem: Mapped[str | None] = mapped_column(String(20), nullable=True)
    tecnologia_ciclo: Mapped[str | None] = mapped_column(String(20), nullable=True)
    local_instalacao: Mapped[str | None] = mapped_column(String(180), nullable=True)
    installation_reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    categoria_instalacao: Mapped[str | None] = mapped_column(String(32), nullable=True)
    modelo_evaporadora: Mapped[str | None] = mapped_column(String(120), nullable=True)
    modelo_condensadora: Mapped[str | None] = mapped_column(String(120), nullable=True)
    capacidade_tr: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    ambiente_nome: Mapped[str | None] = mapped_column(String(180), nullable=True)
    ambiente_tipo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    area_m2: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    ocupacao_fixa: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ocupacao_flutuante: Mapped[int | None] = mapped_column(Integer, nullable=True)
    carga_termica_total: Mapped[str | None] = mapped_column(String(200), nullable=True)
    massa_gas_kg: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    corrente_nominal_a: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    filtro_tipo: Mapped[str | None] = mapped_column(String(80), nullable=True)
    filtro_quantidade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    filtro_dimensoes: Mapped[str | None] = mapped_column(String(120), nullable=True)
    filtro_periodicidade_limpeza: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    preventive_reminder_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    public_token: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    client: Mapped["Client"] = relationship(back_populates="equipments")
    client_site: Mapped["ClientSite | None"] = relationship(back_populates="equipments")
    service_items: Mapped[list["ServiceOrderEquipmentService"]] = relationship(back_populates="equipment")
    documents: Mapped[list["EquipmentDocument"]] = relationship(
        back_populates="equipment", cascade="all, delete-orphan", order_by="EquipmentDocument.id.desc()"
    )
    qr_label: Mapped["QrCode | None"] = relationship(back_populates="equipment", uselist=False)
    pmoc_plan_links: Mapped[list["PmocPlanEquipment"]] = relationship(
        back_populates="equipment", cascade="all, delete-orphan"
    )
    preventive_rule: Mapped["EquipmentPreventiveRule | None"] = relationship(
        back_populates="equipment", uselist=False, cascade="all, delete-orphan"
    )


class EquipmentPreventiveRule(Base):
    """Regra de manutenção preventiva customizada por equipamento do cliente."""

    __tablename__ = "equipment_preventive_rules"
    __table_args__ = (UniqueConstraint("equipment_id", name="uq_equipment_preventive_rule_equipment"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipments.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    interval_value: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    interval_type: Mapped[PreventiveIntervalType] = mapped_column(
        Enum(
            PreventiveIntervalType,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=PreventiveIntervalType.MONTHS,
    )
    last_performed_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    equipment: Mapped["Equipment"] = relationship(back_populates="preventive_rule")

    def compute_next_due_date(self, from_dt: datetime | None = None) -> datetime | None:
        from app.equipment_preventive_rules import compute_next_due_datetime

        base = from_dt or self.last_performed_date
        if base is None:
            return None
        return compute_next_due_datetime(
            base,
            interval_value=self.interval_value,
            interval_type=self.interval_type,
        )


class EquipmentServicePreventiveOverride(Base):
    """Intervalo preventivo customizado por equipamento + tipo de serviço."""

    __tablename__ = "equipment_service_preventive_overrides"
    __table_args__ = (
        UniqueConstraint("equipment_id", "service_id", name="uq_equipment_service_preventive_override"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True
    )
    interval_value: Mapped[int] = mapped_column(Integer, nullable=False)
    interval_type: Mapped[str] = mapped_column(String(16), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    equipment: Mapped["Equipment"] = relationship()
    service: Mapped["Service"] = relationship()


class EquipmentServicePreventiveSchedule(Base):
    """Prazos preventivos persistidos por equipamento + serviço (fonte da Gestão Preventiva)."""

    __tablename__ = "equipment_service_preventive_schedules"
    __table_args__ = (
        UniqueConstraint("equipment_id", "service_id", name="uq_equipment_service_preventive_schedule"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True
    )
    interval_value: Mapped[int] = mapped_column(Integer, nullable=False)
    interval_type: Mapped[str] = mapped_column(String(16), nullable=False)
    last_performed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_service_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("service_orders.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    message_template_kind: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    equipment: Mapped["Equipment"] = relationship()
    service: Mapped["Service"] = relationship()


class CustomerBillingAutomation(Base):
    """Preferências de faturamento automático pós-fechamento da OS (fase 2)."""

    __tablename__ = "customer_billing_automations"
    __table_args__ = (UniqueConstraint("client_id", name="uq_customer_billing_automation_client"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    auto_emit_nfse: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    payment_gateway: Mapped[BillingPaymentGateway] = mapped_column(
        Enum(
            BillingPaymentGateway,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=24,
        ),
        nullable=False,
        default=BillingPaymentGateway.MANUAL,
    )
    days_to_due: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    auto_send_whatsapp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    client: Mapped["Client"] = relationship(back_populates="billing_automation")


class TenantGarantiaSettings(Base):
    """Textos e prazos padrão do termo de garantia de instalação por tenant."""

    __tablename__ = "tenant_garantia_settings"

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True
    )
    default_meses_garantia: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    prazo_garantia_servico: Mapped[str | None] = mapped_column(Text, nullable=True)
    nota_garantia_fabrica: Mapped[str | None] = mapped_column(Text, nullable=True)
    termos_garantia: Mapped[str | None] = mapped_column(Text, nullable=True)
    servicos_cobertos: Mapped[str | None] = mapped_column(Text, nullable=True)
    condicoes_exclusoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship()


class ManualIngestionStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class ManualExtractionStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class EquipmentManual(Base):
    """Manual técnico em PDF no S3 — pode ser compartilhado por vários modelos do catálogo."""

    __tablename__ = "equipment_manuals"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    s3_url: Mapped[str] = mapped_column(String(500), nullable=False)
    ingestion_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ManualIngestionStatus.PENDING.value
    )
    ingestion_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    ingested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Extração estruturada via IA: identificação de equipamento(s) + specs, para
    # pré-preencher o cadastro no catálogo (revisão humana antes de salvar).
    extraction_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ManualExtractionStatus.PENDING.value
    )
    extraction_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    extraction_result: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    extracted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship()
    catalog_entries: Mapped[list["EquipmentCatalog"]] = relationship(back_populates="manual")
    manual_chunks: Mapped[list["ManualChunk"]] = relationship(
        back_populates="manual", cascade="all, delete-orphan"
    )
    error_codes: Mapped[list["EquipmentManualErrorCode"]] = relationship(
        back_populates="manual", cascade="all, delete-orphan"
    )


class EquipmentManualErrorCode(Base):
    """Código de erro/falha extraído do manual (tabela de diagnóstico) — consulta rápida da Iris em campo."""

    __tablename__ = "equipment_manual_error_codes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    manual_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("equipment_manuals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    probable_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommended_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    pagina_origem: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    tenant: Mapped["Tenant"] = relationship()
    manual: Mapped["EquipmentManual"] = relationship(back_populates="error_codes")


class ManualChunk(Base):
    """Trecho vetorizado de manual técnico (RAG) com metadados de origem."""

    __tablename__ = "manual_chunks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    manual_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("equipment_manuals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fabricante: Mapped[str] = mapped_column(String(120), nullable=False, default="", index=True)
    modelo: Mapped[str] = mapped_column(String(120), nullable=False, default="", index=True)
    tipo_documento: Mapped[str] = mapped_column(String(80), nullable=False, default="manual_tecnico", index=True)
    versao: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    pagina_origem: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(1536), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    manual: Mapped["EquipmentManual"] = relationship(back_populates="manual_chunks")


class EquipmentCatalog(Base):
    __tablename__ = "equipment_catalog"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "brand",
            "category_id",
            "component_type",
            "model",
            name="uq_equipment_catalog_tenant_brand_category_component_model",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("equipment_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    component_type: Mapped[EquipmentCatalogComponentType] = mapped_column(
        Enum(
            EquipmentCatalogComponentType,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=EquipmentCatalogComponentType.UNICO,
    )
    brand: Mapped[str] = mapped_column(String(120), nullable=False)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    model_evaporator: Mapped[str | None] = mapped_column(String(120), nullable=True)
    model_condenser: Mapped[str | None] = mapped_column(String(120), nullable=True)
    capacity: Mapped[str | None] = mapped_column(String(80), nullable=True)
    fluid_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    voltage: Mapped[str | None] = mapped_column(String(40), nullable=True)
    technical_data: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    manual_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("equipment_manuals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship()
    category: Mapped["EquipmentCategory"] = relationship(back_populates="catalog_entries")
    manual: Mapped["EquipmentManual | None"] = relationship(back_populates="catalog_entries")
    client_components: Mapped[list["ClientEquipmentComponent"]] = relationship(back_populates="catalog")


class ClientEquipment(Base):
    """Instalação lógica no cliente (pode agrupar condensadora + várias evaporadoras)."""

    __tablename__ = "client_equipments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    client_site_id: Mapped[int | None] = mapped_column(
        ForeignKey("client_sites.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tag: Mapped[str] = mapped_column(String(120), nullable=False)
    installation_reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    installation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Ano de fabricação do aparelho (não confundir com installation_date, que é quando foi instalado).
    manufacture_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Carga de refrigerante em kg — usada em relatórios de PMOC/NR quando o técnico mede/confirma em campo.
    gas_charge_kg: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    legacy_equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship()
    client: Mapped["Client"] = relationship(back_populates="catalog_equipments")
    client_site: Mapped["ClientSite | None"] = relationship(back_populates="catalog_equipments")
    components: Mapped[list["ClientEquipmentComponent"]] = relationship(
        back_populates="client_equipment", cascade="all, delete-orphan", order_by="ClientEquipmentComponent.created_at"
    )
    legacy_equipment: Mapped["Equipment | None"] = relationship()


class ClientEquipmentComponent(Base):
    """Peça física vinculada a uma instalação (catálogo + serial)."""

    __tablename__ = "client_equipment_components"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_equipment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("client_equipments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    catalog_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("equipment_catalog.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    serial_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    client_equipment: Mapped["ClientEquipment"] = relationship(back_populates="components")
    catalog: Mapped["EquipmentCatalog"] = relationship(back_populates="client_components")


class EquipmentDocument(Base):
    __tablename__ = "equipment_documents"
    __table_args__ = (
        UniqueConstraint("tenant_id", "document_type", "document_number", name="uq_equipment_doc_number_by_tenant_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipments.id", ondelete="CASCADE"), nullable=False, index=True)
    service_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("service_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    responsible_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    technician_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    document_type: Mapped[EquipmentDocumentType] = mapped_column(
        Enum(
            EquipmentDocumentType,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=32,
        ),
        nullable=False,
    )
    status: Mapped[EquipmentDocumentStatus] = mapped_column(
        Enum(
            EquipmentDocumentStatus,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=20,
        ),
        nullable=False,
        default=EquipmentDocumentStatus.DRAFT,
    )
    document_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_due_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_s3_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship()
    equipment: Mapped["Equipment"] = relationship(back_populates="documents")
    service_order: Mapped["ServiceOrder | None"] = relationship()
    responsible_user: Mapped["User | None"] = relationship(foreign_keys=[responsible_user_id])
    technician: Mapped["User | None"] = relationship(foreign_keys=[technician_id])
    fields: Mapped[list["EquipmentDocumentField"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="EquipmentDocumentField.id.desc()"
    )
    attachments: Mapped[list["EquipmentDocumentAttachment"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="EquipmentDocumentAttachment.id.desc()"
    )
    events: Mapped[list["EquipmentDocumentEvent"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="EquipmentDocumentEvent.id.desc()"
    )


class EquipmentDocumentField(Base):
    __tablename__ = "equipment_document_fields"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("equipment_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    schema_version: Mapped[str] = mapped_column(String(20), nullable=False, default="v1")
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    document: Mapped["EquipmentDocument"] = relationship(back_populates="fields")


class EquipmentDocumentAttachment(Base):
    __tablename__ = "equipment_document_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("equipment_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_type: Mapped[str] = mapped_column(String(40), nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_s3_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    uploaded_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    document: Mapped["EquipmentDocument"] = relationship(back_populates="attachments")


class EquipmentDocumentEvent(Base):
    __tablename__ = "equipment_document_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("equipment_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    document: Mapped["EquipmentDocument"] = relationship(back_populates="events")


class PmocPlan(Base):
    """PMOC por estabelecimento (cliente/endereço), com fichas por equipamento — Lei Federal nº 13.589/2018."""

    __tablename__ = "pmoc_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    client_site_id: Mapped[int | None] = mapped_column(
        ForeignKey("client_sites.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    status: Mapped[PmocPlanStatus] = mapped_column(
        Enum(PmocPlanStatus, values_callable=lambda items: [item.value for item in items], native_enum=False, length=20),
        nullable=False,
        default=PmocPlanStatus.DRAFT,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    version_label: Mapped[str] = mapped_column(String(40), nullable=False, default="1.0")
    establishment_snapshot_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    law_reference_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    extras_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_btu_sum: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    air_analysis_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    next_air_analysis_due: Mapped[date | None] = mapped_column(Date, nullable=True)
    responsible_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    responsible_council: Mapped[str | None] = mapped_column(String(16), nullable=True)
    responsible_registration: Mapped[str | None] = mapped_column(String(80), nullable=True)
    art_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    art_issued_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    art_file_s3_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    art_file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="pmoc_plans")
    client: Mapped["Client"] = relationship(back_populates="pmoc_plans")
    client_site: Mapped["ClientSite | None"] = relationship()
    equipments: Mapped[list["PmocPlanEquipment"]] = relationship(
        back_populates="pmoc", cascade="all, delete-orphan", order_by="PmocPlanEquipment.sort_order"
    )
    scheduled_activities: Mapped[list["PmocScheduledActivity"]] = relationship(
        back_populates="pmoc", cascade="all, delete-orphan", order_by="PmocScheduledActivity.sort_order"
    )
    executions: Mapped[list["PmocExecution"]] = relationship(
        back_populates="pmoc", cascade="all, delete-orphan", order_by="PmocExecution.executed_at.desc()"
    )
    air_quality_analyses: Mapped[list["PmocAirQualityAnalysis"]] = relationship(
        back_populates="pmoc", cascade="all, delete-orphan", order_by="PmocAirQualityAnalysis.analysis_date.desc()"
    )
    occurrences: Mapped[list["PmocOccurrence"]] = relationship(
        back_populates="pmoc", cascade="all, delete-orphan", order_by="PmocOccurrence.created_at.desc()"
    )


class PmocPlanEquipment(Base):
    __tablename__ = "pmoc_plan_equipments"
    __table_args__ = (UniqueConstraint("pmoc_id", "equipment_id", name="uq_pmoc_plan_equipment"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pmoc_id: Mapped[int] = mapped_column(ForeignKey("pmoc_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipments.id", ondelete="CASCADE"), nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ficha_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    pmoc: Mapped["PmocPlan"] = relationship(back_populates="equipments")
    equipment: Mapped["Equipment"] = relationship(back_populates="pmoc_plan_links")


class PmocScheduledActivity(Base):
    __tablename__ = "pmoc_scheduled_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pmoc_id: Mapped[int] = mapped_column(ForeignKey("pmoc_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    equipment_id: Mapped[int | None] = mapped_column(ForeignKey("equipments.id", ondelete="SET NULL"), nullable=True)
    service_id: Mapped[int | None] = mapped_column(
        ForeignKey("services.id", ondelete="SET NULL"), nullable=True, index=True
    )
    frequency: Mapped[PmocActivityFrequency] = mapped_column(
        Enum(
            PmocActivityFrequency,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=20,
        ),
        nullable=False,
    )
    task_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_system_seed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    pmoc: Mapped["PmocPlan"] = relationship(back_populates="scheduled_activities")
    equipment: Mapped["Equipment | None"] = relationship()
    service: Mapped["Service | None"] = relationship()


class PmocExecution(Base):
    __tablename__ = "pmoc_executions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pmoc_id: Mapped[int] = mapped_column(ForeignKey("pmoc_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    scheduled_activity_id: Mapped[int | None] = mapped_column(
        ForeignKey("pmoc_scheduled_activities.id", ondelete="SET NULL"), nullable=True
    )
    equipment_id: Mapped[int | None] = mapped_column(ForeignKey("equipments.id", ondelete="SET NULL"), nullable=True)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completion_status: Mapped[PmocExecutionCompletion] = mapped_column(
        Enum(
            PmocExecutionCompletion,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=20,
        ),
        nullable=False,
        default=PmocExecutionCompletion.DONE,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    performed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    service_order_id: Mapped[int | None] = mapped_column(ForeignKey("service_orders.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    pmoc: Mapped["PmocPlan"] = relationship(back_populates="executions")
    scheduled_activity: Mapped["PmocScheduledActivity | None"] = relationship()
    equipment: Mapped["Equipment | None"] = relationship()
    performed_by: Mapped["User | None"] = relationship(foreign_keys=[performed_by_user_id])
    service_order: Mapped["ServiceOrder | None"] = relationship()


class PmocBuildingProfile(Base):
    __tablename__ = "pmoc_building_profiles"
    __table_args__ = (UniqueConstraint("pmoc_id", name="uq_pmoc_building_profile_pmoc"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pmoc_id: Mapped[int] = mapped_column(ForeignKey("pmoc_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    legal_representative: Mapped[str | None] = mapped_column(String(180), nullable=True)
    state_registration: Mapped[str | None] = mapped_column(String(40), nullable=True)
    activity_exercised: Mapped[str | None] = mapped_column(String(180), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_climatized_area_m2: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    floors_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_occupants: Mapped[int | None] = mapped_column(Integer, nullable=True)
    operation_hours: Mapped[str | None] = mapped_column(String(180), nullable=True)
    occupancy_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    power_outage_procedure: Mapped[str | None] = mapped_column(Text, nullable=True)
    critical_failure_procedure: Mapped[str | None] = mapped_column(Text, nullable=True)
    annual_load_review_due: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    pmoc: Mapped["PmocPlan"] = relationship()


class PmocEnvironment(Base):
    __tablename__ = "pmoc_environments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pmoc_id: Mapped[int] = mapped_column(ForeignKey("pmoc_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    equipment_id: Mapped[int | None] = mapped_column(ForeignKey("equipments.id", ondelete="SET NULL"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    environment_name: Mapped[str] = mapped_column(String(180), nullable=False)
    area_m2: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    ceiling_height_m: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    air_volume_m3: Mapped[float | None] = mapped_column(Numeric(12, 3), nullable=True)
    avg_occupants: Mapped[int | None] = mapped_column(Integer, nullable=True)
    activity_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    pmoc: Mapped["PmocPlan"] = relationship()
    equipment: Mapped["Equipment | None"] = relationship()
    equipment_links: Mapped[list["PmocEnvironmentEquipment"]] = relationship(
        back_populates="environment", cascade="all, delete-orphan"
    )


class PmocEnvironmentEquipment(Base):
    __tablename__ = "pmoc_environment_equipments"
    __table_args__ = (UniqueConstraint("pmoc_environment_id", "equipment_id", name="uq_pmoc_environment_equipment"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pmoc_environment_id: Mapped[int] = mapped_column(
        ForeignKey("pmoc_environments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipments.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    environment: Mapped["PmocEnvironment"] = relationship(back_populates="equipment_links")
    equipment: Mapped["Equipment"] = relationship()


class PmocExecutionMeasurement(Base):
    __tablename__ = "pmoc_execution_measurements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pmoc_execution_id: Mapped[int] = mapped_column(
        ForeignKey("pmoc_executions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    metric_group: Mapped[str] = mapped_column(String(40), nullable=False)
    metric_key: Mapped[str] = mapped_column(String(80), nullable=False)
    value_numeric: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    value_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(24), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    execution: Mapped["PmocExecution"] = relationship()


class PmocExecutionServiceLog(Base):
    __tablename__ = "pmoc_execution_service_logs"
    __table_args__ = (UniqueConstraint("pmoc_execution_id", name="uq_pmoc_execution_service_log_execution"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pmoc_execution_id: Mapped[int] = mapped_column(
        ForeignKey("pmoc_executions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    technician_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    executed_service: Mapped[str | None] = mapped_column(Text, nullable=True)
    worked_hours: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    observations: Mapped[str | None] = mapped_column(Text, nullable=True)
    legal_signature_provider: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    execution: Mapped["PmocExecution"] = relationship()


class PmocExecutionConsumable(Base):
    __tablename__ = "pmoc_execution_consumables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pmoc_execution_id: Mapped[int] = mapped_column(
        ForeignKey("pmoc_executions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    lot_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    validity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    quantity: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    execution: Mapped["PmocExecution"] = relationship()


class PmocServiceCatalog(Base):
    __tablename__ = "pmoc_service_catalogs"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_pmoc_service_catalog_tenant_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    frequency: Mapped[PmocActivityFrequency] = mapped_column(
        Enum(
            PmocActivityFrequency,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=20,
        ),
        nullable=False,
    )
    equipment_types_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship()


class PmocAirQualityAnalysis(Base):
    __tablename__ = "pmoc_air_quality_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pmoc_id: Mapped[int] = mapped_column(ForeignKey("pmoc_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    analysis_date: Mapped[date] = mapped_column(Date, nullable=False)
    lab_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    file_s3_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    pmoc: Mapped["PmocPlan"] = relationship(back_populates="air_quality_analyses")
    created_by: Mapped["User | None"] = relationship()


class PmocOccurrence(Base):
    """Plano de ação — falha detectada em checklist (O.S. ou vistoria PMOC)."""

    __tablename__ = "pmoc_occurrences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    pmoc_id: Mapped[int] = mapped_column(ForeignKey("pmoc_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    equipment_id: Mapped[int | None] = mapped_column(ForeignKey("equipments.id", ondelete="SET NULL"), nullable=True)
    service_order_id: Mapped[int | None] = mapped_column(ForeignKey("service_orders.id", ondelete="SET NULL"), nullable=True)
    checklist_item_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    checklist_item_descricao: Mapped[str] = mapped_column(String(500), nullable=False)
    failure_description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[PmocOccurrenceStatus] = mapped_column(
        Enum(
            PmocOccurrenceStatus,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=20,
        ),
        nullable=False,
        default=PmocOccurrenceStatus.OPEN,
    )
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    pmoc: Mapped["PmocPlan"] = relationship(back_populates="occurrences")
    equipment: Mapped["Equipment | None"] = relationship()
    service_order: Mapped["ServiceOrder | None"] = relationship()
    created_by: Mapped["User | None"] = relationship()


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("tenant_id", "sku", name="uq_products_tenant_sku"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    sku: Mapped[str] = mapped_column(String(50), nullable=False)
    purchase_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    sale_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    stock_quantity: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False, default=0)
    quantity_physical: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False, default=0)
    quantity_reserved: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False, default=0)
    compatible_equipment_tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    btu_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    btu_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    application_scope: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="products")
    order_items: Mapped[list["ServiceOrderProductItem"]] = relationship(back_populates="product")
    service_inputs: Mapped[list["ServiceProductInput"]] = relationship(back_populates="product")
    stock_movements: Mapped[list["StockMovement"]] = relationship(back_populates="product")
    purchase_lines: Mapped[list["ProductPurchaseLine"]] = relationship(back_populates="product")
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="ProductImage.sort_order"
    )
    mercado_livre_link: Mapped["MercadoLivreProductLink | None"] = relationship(
        back_populates="product", uselist=False, cascade="all, delete-orphan"
    )

    @property
    def quantity_available(self) -> float:
        physical = float(self.quantity_physical)
        reserved = float(self.quantity_reserved)
        return max(0.0, physical - reserved)

    @property
    def primary_image_url(self) -> str | None:
        for image in self.images:
            url = (image.public_url or "").strip()
            if url:
                return url
        return None


class ProductImage(Base):
    """Imagens do produto (URLs públicas S3 para exibição e envio ao Mercado Livre)."""

    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    public_url: Mapped[str] = mapped_column(String(768), nullable=False)
    s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="product_images")
    product: Mapped["Product"] = relationship(back_populates="images")


class MercadoLivreSyncStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHING = "publishing"
    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"


class TenantMercadoLivreAccount(Base):
    """Conta do vendedor Mercado Livre conectada ao workspace (OAuth)."""

    __tablename__ = "tenant_mercado_livre_accounts"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_tenant_mercado_livre_account"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    ml_user_id: Mapped[str] = mapped_column(String(32), nullable=False)
    nickname: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    site_id: Mapped[str] = mapped_column(String(8), nullable=False, default="MLB")
    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="mercado_livre_account")


class MercadoLivreProductLink(Base):
    """Estado da publicação de um produto no Mercado Livre."""

    __tablename__ = "mercado_livre_product_links"
    __table_args__ = (UniqueConstraint("tenant_id", "product_id", name="uq_ml_link_tenant_product"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    ml_item_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    permalink: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ml_category_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    listing_type_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sync_status: Mapped[MercadoLivreSyncStatus] = mapped_column(
        Enum(
            MercadoLivreSyncStatus,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=24,
        ),
        nullable=False,
        default=MercadoLivreSyncStatus.DRAFT,
    )
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    ml_item_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="mercado_livre_product_links")
    product: Mapped["Product"] = relationship(back_populates="mercado_livre_link")


class Service(Base):
    __tablename__ = "services"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_services_tenant_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    equipment_type_tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    btu_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    btu_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    service_category: Mapped[str | None] = mapped_column(String(40), nullable=True)
    applies_residential: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    applies_commercial: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    nfse_codigo_tributacao_nacional: Mapped[str | None] = mapped_column(String(32), nullable=True)
    nfse_codigo_nbs: Mapped[str | None] = mapped_column(String(32), nullable=True)
    periodicidade_meses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preventive_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    preventive_interval_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    preventive_interval_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    service_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    require_photo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    icon_key: Mapped[str | None] = mapped_column(String(32), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    visible_in_service_order: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    visible_in_pmoc: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    visible_in_contract: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="services")
    order_items: Mapped[list["ServiceOrderEquipmentService"]] = relationship(back_populates="service")
    historico_servicos: Mapped[list["HistoricoServico"]] = relationship(back_populates="service")
    product_inputs: Mapped[list["ServiceProductInput"]] = relationship(
        back_populates="service", cascade="all, delete-orphan"
    )

    @property
    def estimated_material_cost(self) -> float:
        return float(sum(item.total_cost for item in self.product_inputs))

    @property
    def estimated_profit(self) -> float:
        return float(self.price) - self.estimated_material_cost


class PreventiveInterestKind(str, enum.Enum):
    MORE = "more"
    SCHEDULE = "schedule"


class HistoricoServico(Base):
    """Última realização de um tipo de serviço para o cliente (base para vencimento preventivo)."""

    __tablename__ = "historico_servicos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="RESTRICT"), nullable=False, index=True)
    data_realizacao: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    service_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("service_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="historico_servicos")
    client: Mapped["Client"] = relationship(back_populates="historico_servicos")
    service: Mapped["Service"] = relationship(back_populates="historico_servicos")
    service_order: Mapped["ServiceOrder | None"] = relationship()
    lembretes: Mapped[list["LembretePreventivo"]] = relationship(
        back_populates="historico_servico",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class LembretePreventivo(Base):
    """Registro de lembretes preventivos enviados (evita spam / auditoria)."""

    __tablename__ = "lembretes_preventivos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    historico_servico_id: Mapped[int] = mapped_column(
        ForeignKey("historico_servicos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reminder_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    recipient_whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    whatsapp_job_id: Mapped[int | None] = mapped_column(
        ForeignKey("whatsapp_message_jobs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="lembretes_preventivos")
    historico_servico: Mapped["HistoricoServico"] = relationship(back_populates="lembretes")
    whatsapp_job: Mapped["WhatsappMessageJob | None"] = relationship()


class PreventiveInterestLead(Base):
    """Resposta a botão ou texto de interesse na campanha preventiva (entrada futura para IA)."""

    __tablename__ = "preventive_interest_leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    historico_servico_id: Mapped[int | None] = mapped_column(
        ForeignKey("historico_servicos.id", ondelete="SET NULL"), nullable=True, index=True
    )
    whatsapp_digits: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    interest_kind: Mapped[PreventiveInterestKind] = mapped_column(
        Enum(
            PreventiveInterestKind,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=16,
        ),
        nullable=False,
    )
    message_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="preventive_interest_leads")
    client: Mapped["Client"] = relationship()
    historico_servico: Mapped["HistoricoServico | None"] = relationship()


class PreventiveReminderContext(Base):
    """Snapshot do grupo preventivo enviado — usado para fluxo AGENDAR no WhatsApp."""

    __tablename__ = "preventive_reminder_contexts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    whatsapp_digits: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    whatsapp_job_id: Mapped[int | None] = mapped_column(
        ForeignKey("whatsapp_message_jobs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    group_items_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="preventive_reminder_contexts")
    client: Mapped["Client"] = relationship()
    whatsapp_job: Mapped["WhatsappMessageJob | None"] = relationship()


class PreventiveScheduleFlow(Base):
    """Conversa WhatsApp: escolha de equipamento → horário → OS agendada."""

    __tablename__ = "preventive_schedule_flows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    whatsapp_digits: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    step: Mapped[str] = mapped_column(String(20), nullable=False, default="equipment")
    equipment_items_json: Mapped[str] = mapped_column(Text, nullable=False)
    selected_equipment_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    service_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("service_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    schedule_id: Mapped[int | None] = mapped_column(
        ForeignKey("schedules.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="preventive_schedule_flows")
    client: Mapped["Client"] = relationship()
    slot_options: Mapped[list["PreventiveScheduleSlotOption"]] = relationship(
        back_populates="flow", cascade="all, delete-orphan"
    )


class PreventiveScheduleSlotOption(Base):
    __tablename__ = "preventive_schedule_slot_options"
    __table_args__ = (UniqueConstraint("option_code", name="uq_preventive_schedule_slot_option_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    flow_id: Mapped[int] = mapped_column(
        ForeignKey("preventive_schedule_flows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    option_code: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    option_index: Mapped[int] = mapped_column(Integer, nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    technician_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    selected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    flow: Mapped["PreventiveScheduleFlow"] = relationship(back_populates="slot_options")
    technician: Mapped["User | None"] = relationship()


class ServiceOrder(Base):
    __tablename__ = "service_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False, index=True)
    client_site_id: Mapped[int | None] = mapped_column(
        ForeignKey("client_sites.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_budget_id: Mapped[int | None] = mapped_column(
        ForeignKey("budgets.id", ondelete="SET NULL"), nullable=True, unique=True, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    discount_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status", values_callable=lambda items: [item.value for item in items]),
        nullable=False,
        default=OrderStatus.OPEN,
    )
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stock_consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant: Mapped["Tenant"] = relationship(back_populates="service_orders")
    client: Mapped["Client"] = relationship(back_populates="service_orders")
    client_site: Mapped["ClientSite | None"] = relationship()
    technicians: Mapped[list["ServiceOrderTechnician"]] = relationship(
        back_populates="service_order", cascade="all, delete-orphan"
    )
    service_items: Mapped[list["ServiceOrderEquipmentService"]] = relationship(
        back_populates="service_order", cascade="all, delete-orphan"
    )
    product_items: Mapped[list["ServiceOrderProductItem"]] = relationship(
        back_populates="service_order", cascade="all, delete-orphan"
    )
    schedules: Mapped[list["Schedule"]] = relationship(
        back_populates="service_order",
        cascade="all, delete-orphan",
        order_by="Schedule.starts_at",
    )
    source_budget: Mapped["Budget | None"] = relationship(back_populates="generated_service_order", uselist=False)
    stock_movements: Mapped[list["StockMovement"]] = relationship(back_populates="service_order")
    finance_entries: Mapped[list["FinanceEntry"]] = relationship(back_populates="service_order")
    nfse_invoices: Mapped[list["NfseInvoice"]] = relationship(back_populates="service_order")

    @property
    def schedule(self) -> "Schedule | None":
        """Primeiro agendamento ativo (não cancelado), se houver."""
        if not self.schedules:
            return None
        for s in self.schedules:
            if s.status != ScheduleStatus.CANCELLED:
                return s
        return None

    @property
    def assigned_technician_name(self) -> str | None:
        """Nomes dos técnicos do agendamento ativo, ou da OS, para listagens."""
        names: list[str] = []
        sched = self.schedule
        if sched is not None:
            for st in sched.technicians:
                u = st.technician
                if u is not None and (u.full_name or "").strip():
                    names.append(u.full_name.strip())
        if not names:
            for ot in self.technicians:
                u = ot.technician
                if u is not None and (u.full_name or "").strip():
                    names.append(u.full_name.strip())
        if not names:
            return None
        # Únicos, ordem estável
        seen: set[str] = set()
        ordered: list[str] = []
        for n in names:
            if n not in seen:
                seen.add(n)
                ordered.append(n)
        return ", ".join(ordered)

    @property
    def technician_ids(self) -> list[int]:
        """IDs dos técnicos no agendamento ativo; senão, vínculos diretos na OS."""
        ids: list[int] = []
        sched = self.schedule
        if sched is not None:
            for st in sched.technicians:
                if st.technician_id not in ids:
                    ids.append(st.technician_id)
        for ot in self.technicians:
            if ot.technician_id not in ids:
                ids.append(ot.technician_id)
        return ids

    def get_total_duration(self) -> int:
        """Tempo estimado (min) = soma de quantity × duration_minutes dos serviços (produtos não entram)."""
        total = 0
        for item in self.service_items:
            qty = max(int(item.quantity or 1), 1)
            minutes = max(int(item.duration_minutes or 1), 1)
            total += qty * minutes
        return max(total, 0)


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity_delta: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    reason: Mapped[StockMovementReason] = mapped_column(
        Enum(
            StockMovementReason,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=32,
        ),
        nullable=False,
    )
    service_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("service_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    product_purchase_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_purchases.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="stock_movements")
    product: Mapped["Product"] = relationship(back_populates="stock_movements")
    service_order: Mapped["ServiceOrder | None"] = relationship(back_populates="stock_movements")
    product_purchase: Mapped["ProductPurchase | None"] = relationship(back_populates="stock_movements")


class ProductPurchase(Base):
    __tablename__ = "product_purchases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    finance_entry_id: Mapped[int] = mapped_column(
        ForeignKey("finance_entries.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    supplier_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    purchased_at: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="product_purchases")
    finance_entry: Mapped["FinanceEntry"] = relationship(back_populates="product_purchase")
    lines: Mapped[list["ProductPurchaseLine"]] = relationship(
        back_populates="purchase", cascade="all, delete-orphan"
    )
    stock_movements: Mapped[list["StockMovement"]] = relationship(back_populates="product_purchase")


class ProductPurchaseLine(Base):
    __tablename__ = "product_purchase_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    purchase_id: Mapped[int] = mapped_column(
        ForeignKey("product_purchases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    unit_cost: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    purchase: Mapped["ProductPurchase"] = relationship(back_populates="lines")
    product: Mapped["Product"] = relationship(back_populates="purchase_lines")


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False, index=True)
    client_site_id: Mapped[int | None] = mapped_column(
        ForeignKey("client_sites.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[BudgetStatus] = mapped_column(
        Enum(BudgetStatus, name="budget_status", values_callable=lambda items: [item.value for item in items]),
        nullable=False,
        default=BudgetStatus.DRAFT,
    )
    payment_method: Mapped[str | None] = mapped_column(String(120))
    payment_terms: Mapped[str | None] = mapped_column(Text)
    warranty_terms: Mapped[str | None] = mapped_column(Text)
    scope_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    validity_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pdf_s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    tracking_url: Mapped[str | None] = mapped_column(String(768), nullable=True)
    pdf_file_missing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    tenant: Mapped["Tenant"] = relationship(back_populates="budgets")
    client: Mapped["Client"] = relationship(back_populates="budgets")
    client_site: Mapped["ClientSite | None"] = relationship()
    service_items: Mapped[list["BudgetServiceItem"]] = relationship(
        back_populates="budget", cascade="all, delete-orphan"
    )
    product_items: Mapped[list["BudgetProductItem"]] = relationship(
        back_populates="budget", cascade="all, delete-orphan"
    )
    generated_service_order: Mapped["ServiceOrder | None"] = relationship(back_populates="source_budget", uselist=False)


class QrCode(Base):
    """Cartela de etiqueta QR pré-gerada (code_id impresso na etiqueta física)."""

    __tablename__ = "qrcodes"
    __table_args__ = (
        UniqueConstraint("code_id", name="uq_qrcodes_code_id"),
        UniqueConstraint("linked_to_equipment_id", name="uq_qrcodes_linked_equipment"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code_id: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    linked_to_equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    public_token: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    pdf_s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    image_s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    tracking_url: Mapped[str | None] = mapped_column(String(768), nullable=True)
    status: Mapped[QrCodeStatus] = mapped_column(
        Enum(
            QrCodeStatus,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=20,
        ),
        nullable=False,
        default=QrCodeStatus.AVAILABLE,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="qrcodes")
    equipment: Mapped["Equipment | None"] = relationship(back_populates="qr_label")


class BudgetServiceItem(Base):
    __tablename__ = "budget_service_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    budget_id: Mapped[int] = mapped_column(ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False, index=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    budget: Mapped["Budget"] = relationship(back_populates="service_items")
    service: Mapped["Service"] = relationship()


class BudgetProductItem(Base):
    __tablename__ = "budget_product_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    budget_id: Mapped[int] = mapped_column(ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    budget: Mapped["Budget"] = relationship(back_populates="product_items")
    product: Mapped["Product"] = relationship()


class BudgetTemplateSettings(Base):
    """Configuração de modelos, cores e textos legais padrão para PDFs de orçamento."""

    __tablename__ = "budget_template_settings"

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    template_key: Mapped[str] = mapped_column(String(32), nullable=False, default="classic")
    brand_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#0B7FAF")
    font_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#000000")
    default_warranty_terms: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_payment_terms: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_payment_method: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_scope_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_technical_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_validity_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    warranty_presets_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_presets_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_method_presets_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    scope_presets_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    technical_presets_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    signature_s3_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    signature_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    signature_content_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="budget_template_settings")


class ServiceOrderTechnician(Base):
    __tablename__ = "service_order_technicians"
    __table_args__ = (UniqueConstraint("service_order_id", "technician_id", name="uq_order_technician"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    service_order_id: Mapped[int] = mapped_column(
        ForeignKey("service_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    technician_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    service_order: Mapped["ServiceOrder"] = relationship(back_populates="technicians")
    technician: Mapped["User"] = relationship(back_populates="assigned_orders")


class ServiceOrderEquipmentService(Base):
    """Vínculo equipamento ↔ serviço na OS (pivot os_equipment_services)."""

    __tablename__ = "service_order_service_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    service_order_id: Mapped[int] = mapped_column(
        ForeignKey("service_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="RESTRICT"), nullable=False, index=True)
    equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    service_order: Mapped["ServiceOrder"] = relationship(back_populates="service_items")
    service: Mapped["Service"] = relationship(back_populates="order_items")
    equipment: Mapped["Equipment | None"] = relationship(back_populates="service_items")
    equipment_audits: Mapped[list["ServiceOrderServiceItemEquipmentAudit"]] = relationship()


# Alias retrocompatível no código legado
ServiceOrderServiceItem = ServiceOrderEquipmentService


class ServiceOrderServiceItemEquipmentAudit(Base):
    __tablename__ = "service_order_service_item_equipment_audits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    service_order_id: Mapped[int] = mapped_column(
        ForeignKey("service_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_item_id: Mapped[int] = mapped_column(
        ForeignKey("service_order_service_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    previous_equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipments.id", ondelete="SET NULL"), nullable=True
    )
    new_equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipments.id", ondelete="SET NULL"), nullable=True
    )
    changed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="app")
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class ServiceOrderProductItem(Base):
    __tablename__ = "service_order_product_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    service_order_id: Mapped[int] = mapped_column(
        ForeignKey("service_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    service_order: Mapped["ServiceOrder"] = relationship(back_populates="product_items")
    product: Mapped["Product"] = relationship(back_populates="order_items")


class ServiceProductInput(Base):
    __tablename__ = "service_product_inputs"
    __table_args__ = (UniqueConstraint("service_id", "product_id", name="uq_service_product_input"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False, default=1)
    unit_cost: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    service: Mapped["Service"] = relationship(back_populates="product_inputs")
    product: Mapped["Product"] = relationship(back_populates="service_inputs")

    @property
    def effective_unit_cost(self) -> float:
        """Custo unitário atual: preço de compra do produto (fallback no snapshot salvo)."""
        if self.product is not None:
            return float(self.product.purchase_price)
        return float(self.unit_cost)

    @property
    def total_cost(self) -> float:
        return self.effective_unit_cost * float(self.quantity)


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False, index=True)
    service_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("service_orders.id", ondelete="SET NULL"), index=True
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[ScheduleStatus] = mapped_column(
        Enum(ScheduleStatus, name="schedule_status", values_callable=lambda items: [item.value for item in items]),
        nullable=False,
        default=ScheduleStatus.PENDING,
    )
    notes: Mapped[str | None] = mapped_column(Text)

    tenant: Mapped["Tenant"] = relationship(back_populates="schedules")
    client: Mapped["Client"] = relationship(back_populates="schedules")
    service_order: Mapped["ServiceOrder | None"] = relationship(back_populates="schedules")
    technicians: Mapped[list["ScheduleTechnician"]] = relationship(
        back_populates="schedule", cascade="all, delete-orphan"
    )


class ScheduleTechnician(Base):
    __tablename__ = "schedule_technicians"
    __table_args__ = (UniqueConstraint("schedule_id", "technician_id", name="uq_schedule_technician"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    schedule_id: Mapped[int] = mapped_column(ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False, index=True)
    technician_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)

    schedule: Mapped["Schedule"] = relationship(back_populates="technicians")
    technician: Mapped["User"] = relationship(back_populates="assigned_schedules")


class FinanceCategory(Base):
    __tablename__ = "finance_categories"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_finance_categories_tenant_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="finance_categories")
    entries: Mapped[list["FinanceEntry"]] = relationship(back_populates="category")


class FinanceEntry(Base):
    __tablename__ = "finance_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("finance_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    description: Mapped[str] = mapped_column(String(180), nullable=False)
    entry_type: Mapped[FinanceEntryType] = mapped_column(
        Enum(FinanceEntryType, name="finance_entry_type", values_callable=lambda items: [item.value for item in items]),
        nullable=False,
    )
    status: Mapped[FinanceEntryStatus] = mapped_column(
        Enum(
            FinanceEntryStatus,
            name="finance_entry_status",
            values_callable=lambda items: [item.value for item in items],
        ),
        nullable=False,
        default=FinanceEntryStatus.PENDING,
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    payment_method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    payment_provider: Mapped[str | None] = mapped_column(String(80), nullable=True)
    finance_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("finance_bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    credit_card_id: Mapped[int | None] = mapped_column(
        ForeignKey("finance_credit_cards.id", ondelete="SET NULL"), nullable=True, index=True
    )
    fee_fixed_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    fee_percent: Mapped[float] = mapped_column(Numeric(7, 4), nullable=False, default=0)
    fee_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    recipient_whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    gateway_payment_id: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    gateway_preference_id: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    mercadopago_archived_preference_id: Mapped[str | None] = mapped_column(
        String(48), nullable=True, index=True
    )
    mercadopago_preapproval_id: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    mp_reversal_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    mp_reversal_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    installment_group_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    installment_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    installment_total: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    competence_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_settlement_date: Mapped[date] = mapped_column(Date, nullable=False)
    settlement_plan: Mapped[str | None] = mapped_column(String(32), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    service_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("service_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    recurring_transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("finance_recurring_transactions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    credit_card_invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("finance_credit_card_invoices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="finance_entries")
    category: Mapped["FinanceCategory | None"] = relationship(back_populates="entries")
    finance_account: Mapped["FinanceBankAccount | None"] = relationship(back_populates="entries")
    credit_card: Mapped["FinanceCreditCard | None"] = relationship(back_populates="entries")
    service_order: Mapped["ServiceOrder | None"] = relationship(back_populates="finance_entries")
    ofx_line_matches: Mapped[list["FinanceOfxStatementLine"]] = relationship(
        back_populates="matched_entry", foreign_keys="FinanceOfxStatementLine.matched_finance_entry_id"
    )
    recurring_transaction: Mapped["FinanceRecurringTransaction | None"] = relationship(
        back_populates="entries", foreign_keys="FinanceEntry.recurring_transaction_id"
    )
    credit_card_invoice: Mapped["FinanceCreditCardInvoice | None"] = relationship(
        back_populates="entries", foreign_keys="FinanceEntry.credit_card_invoice_id"
    )
    product_purchase: Mapped["ProductPurchase | None"] = relationship(
        back_populates="finance_entry", uselist=False
    )


class FinanceRecurringTransaction(Base):
    """Regra de lançamento recorrente (semanal ou mensal)."""

    __tablename__ = "finance_recurring_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=FinanceRecurringStatus.ACTIVE.value)
    frequency: Mapped[str] = mapped_column(String(16), nullable=False)
    day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weekday: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    template_json: Mapped[str] = mapped_column(Text, nullable=False)
    last_generated_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="finance_recurring_transactions")
    entries: Mapped[list["FinanceEntry"]] = relationship(
        back_populates="recurring_transaction",
        foreign_keys="FinanceEntry.recurring_transaction_id",
    )


class FinanceBankAccount(Base):
    __tablename__ = "finance_bank_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    bank_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    account_type: Mapped[FinanceAccountType] = mapped_column(
        Enum(FinanceAccountType, name="finance_account_type", values_callable=lambda items: [item.value for item in items]),
        nullable=False,
        default=FinanceAccountType.CHECKING,
    )
    initial_balance: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="finance_accounts")
    entries: Mapped[list["FinanceEntry"]] = relationship(back_populates="finance_account")
    credit_cards: Mapped[list["FinanceCreditCard"]] = relationship(back_populates="billing_account")
    ofx_imports: Mapped[list["FinanceOfxImport"]] = relationship(
        back_populates="finance_bank_account", cascade="all, delete-orphan"
    )


class FinanceBankCatalog(Base):
    """Catálogo global de bancos/carteiras (operadora): visibilidade e logo no wizard de contas."""

    __tablename__ = "finance_bank_catalog"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_finance_bank_catalog_slug"),
        UniqueConstraint("logo_file_token", name="uq_finance_bank_catalog_logo_token"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    bank_name: Mapped[str] = mapped_column(String(80), nullable=False)
    display_label: Mapped[str] = mapped_column(String(80), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    logo_external_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_file_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    logo_mime: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class FinanceOfxImport(Base):
    """Upload de extrato OFX por conta bancária (conciliação assistida)."""

    __tablename__ = "finance_ofx_imports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    finance_bank_account_id: Mapped[int] = mapped_column(
        ForeignKey("finance_bank_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="finance_ofx_imports")
    finance_bank_account: Mapped["FinanceBankAccount"] = relationship(back_populates="ofx_imports")
    lines: Mapped[list["FinanceOfxStatementLine"]] = relationship(
        back_populates="import_", cascade="all, delete-orphan"
    )


class FinanceOfxStatementLine(Base):
    """Linha de extrato OFX persistida para conciliação com lançamentos."""

    __tablename__ = "finance_ofx_statement_lines"
    __table_args__ = (UniqueConstraint("import_id", "fit_id", name="uq_fin_ofx_line_import_fit"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_id: Mapped[int] = mapped_column(ForeignKey("finance_ofx_imports.id", ondelete="CASCADE"), nullable=False, index=True)
    fit_id: Mapped[str] = mapped_column(String(128), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    posted_at: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    trn_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payee: Mapped[str | None] = mapped_column(String(500), nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    matched_finance_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("finance_entries.id", ondelete="SET NULL"), nullable=True, index=True
    )
    matched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    import_: Mapped["FinanceOfxImport"] = relationship(back_populates="lines")
    matched_entry: Mapped["FinanceEntry | None"] = relationship(
        back_populates="ofx_line_matches", foreign_keys="FinanceOfxStatementLine.matched_finance_entry_id"
    )


class FinanceCreditCardInvoice(Base):
    """Fatura consolidada por ciclo de vencimento do cartão."""

    __tablename__ = "finance_credit_card_invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    credit_card_id: Mapped[int] = mapped_column(
        ForeignKey("finance_credit_cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[FinanceCreditCardInvoiceStatus] = mapped_column(
        Enum(
            FinanceCreditCardInvoiceStatus,
            name="finance_credit_card_invoice_status",
            values_callable=lambda items: [item.value for item in items],
        ),
        nullable=False,
        default=FinanceCreditCardInvoiceStatus.OPEN,
    )
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    finance_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("finance_entries.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    credit_card: Mapped["FinanceCreditCard"] = relationship(back_populates="invoices")
    entries: Mapped[list["FinanceEntry"]] = relationship(
        back_populates="credit_card_invoice",
        foreign_keys="FinanceEntry.credit_card_invoice_id",
    )
    bank_entry: Mapped["FinanceEntry | None"] = relationship(
        foreign_keys=[finance_entry_id],
    )


class FinanceCreditCard(Base):
    __tablename__ = "finance_credit_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    billing_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("finance_bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    brand: Mapped[str] = mapped_column(String(40), nullable=False, default="other")
    limit_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    closing_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    due_day: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="finance_credit_cards")
    billing_account: Mapped["FinanceBankAccount | None"] = relationship(back_populates="credit_cards")
    entries: Mapped[list["FinanceEntry"]] = relationship(back_populates="credit_card")
    invoices: Mapped[list["FinanceCreditCardInvoice"]] = relationship(back_populates="credit_card")


class TenantFinancePaymentFee(Base):
    """Tabela de taxas por meio/provedor e número de parcelas (ex.: Stone 1x..12x)."""

    __tablename__ = "tenant_finance_payment_fees"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "provider_name",
            "payment_method",
            "installments",
            name="uq_fin_payment_fee_tenant_provider_method_installments",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    provider_name: Mapped[str] = mapped_column(String(80), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(40), nullable=False, default="credit_card")
    installments: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    fee_percent: Mapped[float] = mapped_column(Numeric(7, 4), nullable=False, default=0)
    fee_fixed_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="finance_payment_fees")


class TenantFinanceGateway(Base):
    """Credenciais de gateway de pagamento por workspace (cifrado no servidor)."""

    __tablename__ = "tenant_finance_gateways"
    __table_args__ = (UniqueConstraint("tenant_id", "provider", name="uq_tenant_finance_gateway_provider"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[FinanceGatewayProvider] = mapped_column(
        Enum(
            FinanceGatewayProvider,
            name="finance_gateway_provider",
            values_callable=lambda items: [item.value for item in items],
        ),
        nullable=False,
    )
    asaas_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    asaas_sandbox: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    asaas_webhook_path_token: Mapped[str | None] = mapped_column(String(48), nullable=True, unique=True)
    asaas_webhook_auth_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    asaas_webhook_remote_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    asaas_webhook_last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_validation_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    account_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mercadopago_access_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    mercadopago_public_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    mercadopago_sandbox: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mercadopago_webhook_path_token: Mapped[str | None] = mapped_column(String(48), nullable=True, unique=True, index=True)
    mercadopago_webhook_signature_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    mercadopago_products_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    mercadopago_cached_balance: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    mercadopago_mp_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mercadopago_finance_bank_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("finance_bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    stone_secret_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    stone_public_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    stone_sandbox: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    stone_webhook_path_token: Mapped[str | None] = mapped_column(String(48), nullable=True, unique=True, index=True)
    stone_finance_bank_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("finance_bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="finance_gateways")


class TenantNfseSettings(Base):
    __tablename__ = "tenant_nfse_settings"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_tenant_nfse_settings_tenant"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    mei_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    default_optante_mei: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mei_environment: Mapped[str] = mapped_column(String(20), nullable=False, default="homolog")
    mei_certificate_password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    mei_certificate_base64_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    mei_certificate_file_name: Mapped[str | None] = mapped_column(String(260), nullable=True)
    mei_portal_username_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    mei_portal_password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    mei_last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    mei_last_test_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    focus_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    focus_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    focus_environment: Mapped[str] = mapped_column(String(20), nullable=False, default="homolog")
    auto_issue_on_payment: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    default_codigo_tributacao_nacional: Mapped[str | None] = mapped_column(String(32), nullable=True)
    default_codigo_nbs: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # NFS-e nacional: inscrição municipal do prestador (tag IM), até 15 caracteres — alguns municípios exigem.
    prestador_inscricao_municipal: Mapped[str | None] = mapped_column(String(15), nullable=True)
    # Série da DPS no XML / Id (ex.: 70000 como no emissor nacional — alinhamento ao portal).
    dps_serie: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # national_mei | focus — consulta CNPJ (MEI vs demais); administrador pode alterar.
    auto_nfse_provider: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="nfse_settings")


class NfseInvoice(Base):
    __tablename__ = "nfse_invoices"
    __table_args__ = (
        UniqueConstraint("tenant_id", "service_order_id", name="uq_nfse_invoice_tenant_service_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False, index=True)
    service_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("service_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    finance_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("finance_entries.id", ondelete="SET NULL"), nullable=True, index=True
    )
    provider: Mapped[NfseProvider] = mapped_column(
        Enum(NfseProvider, values_callable=lambda items: [item.value for item in items], native_enum=False, length=20),
        nullable=False,
    )
    status: Mapped[NfseInvoiceStatus] = mapped_column(
        Enum(NfseInvoiceStatus, values_callable=lambda items: [item.value for item in items], native_enum=False, length=24),
        nullable=False,
        default=NfseInvoiceStatus.PENDING_SUBMISSION,
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    rps_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    nfse_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Chave de acesso (44–50 dígitos) quando a API retorna só a chave sem nNFSe.
    nfse_access_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    verification_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    municipal_code: Mapped[str | None] = mapped_column(String(7), nullable=True)
    request_payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="nfse_invoices")
    client: Mapped["Client"] = relationship(back_populates="nfse_invoices")
    service_order: Mapped["ServiceOrder | None"] = relationship(back_populates="nfse_invoices")
    finance_entry: Mapped["FinanceEntry | None"] = relationship()


class WhatsappMessageJob(Base):
    __tablename__ = "whatsapp_message_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    provider_slug: Mapped[str] = mapped_column(String(32), nullable=False, default="evolution")
    template_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    recipient_whatsapp: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    rendered_message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[WhatsappMessageStatus] = mapped_column(
        Enum(
            WhatsappMessageStatus,
            name="whatsapp_message_status",
            values_callable=lambda items: [item.value for item in items],
        ),
        nullable=False,
        default=WhatsappMessageStatus.QUEUED,
        index=True,
    )
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    reference_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reference_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="whatsapp_jobs")
    created_by_user: Mapped["User | None"] = relationship(back_populates="whatsapp_jobs_created")
    events: Mapped[list["WhatsappMessageEvent"]] = relationship(
        back_populates="job", cascade="all, delete-orphan", order_by="WhatsappMessageEvent.id"
    )


class WhatsappMessageEvent(Base):
    __tablename__ = "whatsapp_message_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("whatsapp_message_jobs.id", ondelete="CASCADE"), nullable=True, index=True
    )
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="whatsapp_events")
    job: Mapped["WhatsappMessageJob | None"] = relationship(back_populates="events")


class WhatsappRescheduleOption(Base):
    __tablename__ = "whatsapp_reschedule_options"
    __table_args__ = (UniqueConstraint("option_code", name="uq_whatsapp_reschedule_option_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    schedule_id: Mapped[int] = mapped_column(ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("whatsapp_message_jobs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    option_code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    technician_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    selected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="whatsapp_reschedule_options")
    schedule: Mapped["Schedule"] = relationship()
    job: Mapped["WhatsappMessageJob | None"] = relationship()
    technician: Mapped["User | None"] = relationship()


class WhatsappBotSettings(Base):
    __tablename__ = "whatsapp_bot_settings"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_whatsapp_bot_settings_tenant"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    welcome_message: Mapped[str] = mapped_column(Text, nullable=False)
    fallback_message: Mapped[str] = mapped_column(Text, nullable=False)
    handoff_message: Mapped[str] = mapped_column(Text, nullable=False)
    handoff_keywords_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    handoff_pause_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=240)
    business_hours_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="whatsapp_bot_settings")


class WhatsappBotFlow(Base):
    __tablename__ = "whatsapp_bot_flows"
    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_whatsapp_bot_flow_tenant_slug"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    trigger_type: Mapped[str] = mapped_column(String(32), nullable=False, default="keyword")
    trigger_keywords_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_event: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="whatsapp_bot_flows")
    steps: Mapped[list["WhatsappBotStep"]] = relationship(
        back_populates="flow", cascade="all, delete-orphan", order_by="WhatsappBotStep.sort_order"
    )
    sessions: Mapped[list["WhatsappBotSession"]] = relationship(back_populates="current_flow")


class WhatsappBotStep(Base):
    __tablename__ = "whatsapp_bot_steps"
    __table_args__ = (UniqueConstraint("flow_id", "step_key", name="uq_whatsapp_bot_step_flow_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    flow_id: Mapped[int] = mapped_column(ForeignKey("whatsapp_bot_flows.id", ondelete="CASCADE"), nullable=False, index=True)
    step_key: Mapped[str] = mapped_column(String(80), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="message")
    message_template: Mapped[str] = mapped_column(Text, nullable=False)
    options_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    validation_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    actions_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_step_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    flow: Mapped["WhatsappBotFlow"] = relationship(back_populates="steps")


class WhatsappBotSession(Base):
    __tablename__ = "whatsapp_bot_sessions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "client_whatsapp", name="uq_whatsapp_bot_session_tenant_client"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_whatsapp: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    current_flow_id: Mapped[int | None] = mapped_column(
        ForeignKey("whatsapp_bot_flows.id", ondelete="SET NULL"), nullable=True, index=True
    )
    current_step_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    context_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    paused_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_incoming_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_outgoing_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="whatsapp_bot_sessions")
    current_flow: Mapped["WhatsappBotFlow | None"] = relationship(back_populates="sessions")


class WhatsappBroadcastCampaign(Base):
    __tablename__ = "whatsapp_broadcast_campaigns"
    __table_args__ = (UniqueConstraint("tenant_id", "slug", name="uq_whatsapp_broadcast_campaign_tenant_slug"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    message_template: Mapped[str] = mapped_column(Text, nullable=False)
    segment_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    segment_params_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    max_recipients_per_run: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    cooldown_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_summary_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="whatsapp_broadcast_campaigns")
    runs: Mapped[list["WhatsappBroadcastCampaignRun"]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan", order_by="WhatsappBroadcastCampaignRun.id.desc()"
    )


class WhatsappBroadcastCampaignRun(Base):
    __tablename__ = "whatsapp_broadcast_campaign_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("whatsapp_broadcast_campaigns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    planned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_ok: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_cooldown: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_no_phone: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    campaign: Mapped["WhatsappBroadcastCampaign"] = relationship(back_populates="runs")


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    message_template: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft", index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    segment_kind: Mapped[str] = mapped_column(String(40), nullable=False, default="inactive_since")
    segment_params_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("campaign_assets.id", ondelete="SET NULL"), nullable=True)
    total_contacts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    asset: Mapped["CampaignAsset | None"] = relationship(foreign_keys=[asset_id])
    logs: Mapped[list["CampaignLog"]] = relationship(back_populates="campaign", cascade="all, delete-orphan")
    interactions: Mapped[list["CampaignInteraction"]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan"
    )


class CampaignLog(Base):
    __tablename__ = "campaign_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True)
    external_lead_id: Mapped[int | None] = mapped_column(
        ForeignKey("campaign_external_leads.id", ondelete="SET NULL"), nullable=True, index=True
    )
    recipient_whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    campaign: Mapped["Campaign"] = relationship(back_populates="logs")
    client: Mapped["Client | None"] = relationship()
    external_lead: Mapped["CampaignExternalLead | None"] = relationship()


class CampaignExternalLead(Base):
    __tablename__ = "campaign_external_leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    import_batch_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source_filename: Mapped[str | None] = mapped_column(String(180), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CampaignInteraction(Base):
    __tablename__ = "campaign_interactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True)
    interaction_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    campaign: Mapped["Campaign"] = relationship(back_populates="interactions")
    client: Mapped["Client | None"] = relationship()


class CampaignAsset(Base):
    __tablename__ = "campaign_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(600), nullable=False)
    s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    original_filename: Mapped[str | None] = mapped_column(String(180), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class TechnicianWorkWindow(Base):
    __tablename__ = "technician_work_windows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    technician_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[str] = mapped_column(String(5), nullable=False)
    end_time: Mapped[str] = mapped_column(String(5), nullable=False)

    technician: Mapped["User"] = relationship(back_populates="work_windows")


class TechnicianBreakWindow(Base):
    __tablename__ = "technician_break_windows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    technician_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[str] = mapped_column(String(5), nullable=False)
    end_time: Mapped[str] = mapped_column(String(5), nullable=False)

    technician: Mapped["User"] = relationship(back_populates="break_windows")


class TechnicianUnavailability(Base):
    __tablename__ = "technician_unavailability"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    technician_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(String(255))

    technician: Mapped["User"] = relationship(back_populates="unavailable_blocks")


# --- Integration Hub (migrations 20260627_0131–0133) ---


class ManufacturerPartnerStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    INACTIVE = "inactive"


class EquipmentAssetWarrantyStatus(str, enum.Enum):
    UNKNOWN = "unknown"
    ACTIVE = "active"
    EXPIRED = "expired"
    VOID = "void"


class DigitalWorkOrderValidationStatus(str, enum.Enum):
    DRAFT = "draft"
    INCOMPLETE = "incomplete"
    BLOCKED = "blocked"
    READY = "ready"


class DigitalWorkOrderSyncStatus(str, enum.Enum):
    PENDING = "pending"
    SYNCED = "synced"


class DigitalWorkOrderEvidenceType(str, enum.Enum):
    PHOTO = "photo"
    VIDEO = "video"
    DOCUMENT = "document"


class TechnicianCertificationStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"


class IntegrationProtocol(str, enum.Enum):
    JSON_REST = "json_rest"
    XML_EDI = "xml_edi"


class IntegrationAuthMode(str, enum.Enum):
    NONE = "none"
    API_KEY = "api_key"
    MTLS = "mtls"
    OAUTH2 = "oauth2"


class ManufacturerPartner(Base):
    __tablename__ = "manufacturer_partners"
    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_manufacturer_partner_tenant_code"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[ManufacturerPartnerStatus] = mapped_column(
        Enum(
            ManufacturerPartnerStatus,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=ManufacturerPartnerStatus.PENDING,
    )
    contact_email: Mapped[str | None] = mapped_column(String(254))
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class EquipmentAsset(Base):
    __tablename__ = "equipment_assets"
    __table_args__ = (UniqueConstraint("tenant_id", "serial_number", name="uq_equipment_asset_tenant_serial"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    manufacturer_partner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("manufacturer_partners.id", ondelete="SET NULL"), nullable=True, index=True
    )
    legacy_equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    client_equipment_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("client_equipments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    equipment_catalog_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("equipment_catalog.id", ondelete="SET NULL"), nullable=True, index=True
    )
    serial_number: Mapped[str] = mapped_column(String(120), nullable=False)
    model_code: Mapped[str] = mapped_column(String(120), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(120))
    installation_date: Mapped[date | None] = mapped_column(Date)
    warranty_status: Mapped[EquipmentAssetWarrantyStatus] = mapped_column(
        Enum(
            EquipmentAssetWarrantyStatus,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=24,
        ),
        nullable=False,
        default=EquipmentAssetWarrantyStatus.UNKNOWN,
    )
    manufacturer_reference: Mapped[str | None] = mapped_column(String(120))
    technical_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    warranty_records: Mapped[list["EquipmentWarrantyRecord"]] = relationship(
        back_populates="equipment_asset", cascade="all, delete-orphan"
    )


class EquipmentWarrantyRecord(Base):
    __tablename__ = "equipment_warranty_records"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    equipment_asset_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("equipment_assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    warranty_type: Mapped[str] = mapped_column(String(64), nullable=False, default="factory")
    starts_at: Mapped[date] = mapped_column(Date, nullable=False)
    ends_at: Mapped[date | None] = mapped_column(Date)
    manufacturer_reference: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    equipment_asset: Mapped["EquipmentAsset"] = relationship(back_populates="warranty_records")


class DigitalWorkOrder(Base):
    __tablename__ = "digital_work_orders"
    __table_args__ = (UniqueConstraint("service_order_id", name="uq_digital_work_order_service_order"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    service_order_id: Mapped[int] = mapped_column(
        ForeignKey("service_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    equipment_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("equipment_assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    compliance_schema_version: Mapped[str] = mapped_column(String(32), nullable=False, default="1.0")
    validation_status: Mapped[DigitalWorkOrderValidationStatus] = mapped_column(
        Enum(
            DigitalWorkOrderValidationStatus,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=DigitalWorkOrderValidationStatus.DRAFT,
    )
    required_fields_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    validation_errors: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    last_validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    offline_client_id: Mapped[str | None] = mapped_column(String(64), index=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    service_order: Mapped["ServiceOrder"] = relationship()
    measurements: Mapped[list["DigitalWorkOrderMeasurement"]] = relationship(
        back_populates="digital_work_order", cascade="all, delete-orphan"
    )
    evidences: Mapped[list["DigitalWorkOrderEvidence"]] = relationship(
        back_populates="digital_work_order", cascade="all, delete-orphan"
    )


class DigitalWorkOrderMeasurement(Base):
    __tablename__ = "digital_work_order_measurements"
    __table_args__ = (
        UniqueConstraint(
            "digital_work_order_id",
            "metric_key",
            name="uq_digital_work_order_measurement_key",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    digital_work_order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("digital_work_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    metric_key: Mapped[str] = mapped_column(String(64), nullable=False)
    value_numeric: Mapped[float | None] = mapped_column(Numeric(14, 4))
    value_text: Mapped[str | None] = mapped_column(String(120))
    unit: Mapped[str | None] = mapped_column(String(24))
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    recorded_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    recorded_offline: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sync_status: Mapped[DigitalWorkOrderSyncStatus] = mapped_column(
        Enum(
            DigitalWorkOrderSyncStatus,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=DigitalWorkOrderSyncStatus.SYNCED,
    )

    digital_work_order: Mapped["DigitalWorkOrder"] = relationship(back_populates="measurements")


class DigitalWorkOrderEvidence(Base):
    __tablename__ = "digital_work_order_evidences"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    digital_work_order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("digital_work_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    evidence_type: Mapped[DigitalWorkOrderEvidenceType] = mapped_column(
        Enum(
            DigitalWorkOrderEvidenceType,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=DigitalWorkOrderEvidenceType.PHOTO,
    )
    evidence_key: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_key: Mapped[str | None] = mapped_column(String(512))
    mime_type: Mapped[str | None] = mapped_column(String(120))
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    longitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    accuracy_meters: Mapped[float | None] = mapped_column(Numeric(10, 2))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    captured_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    captured_offline: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sync_status: Mapped[DigitalWorkOrderSyncStatus] = mapped_column(
        Enum(
            DigitalWorkOrderSyncStatus,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=DigitalWorkOrderSyncStatus.SYNCED,
    )
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")

    digital_work_order: Mapped["DigitalWorkOrder"] = relationship(back_populates="evidences")


class SyncAuditLog(Base):
    __tablename__ = "sync_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    digital_work_order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("digital_work_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_last_version: Mapped[int] = mapped_column(Integer, nullable=False)
    server_version: Mapped[int] = mapped_column(Integer, nullable=False)
    sync_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    resolution: Mapped[str] = mapped_column(String(32), nullable=False, default="field_priority")
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PartsCatalogEntry(Base):
    __tablename__ = "parts_catalog_entries"
    __table_args__ = (UniqueConstraint("tenant_id", "sku", name="uq_parts_catalog_entry_tenant_sku"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    manufacturer_partner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("manufacturer_partners.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sku: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(String(16))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    compatibilities: Mapped[list["PartsCatalogCompatibility"]] = relationship(
        back_populates="parts_catalog_entry", cascade="all, delete-orphan"
    )


class PartsCatalogCompatibility(Base):
    __tablename__ = "parts_catalog_compatibilities"
    __table_args__ = (
        UniqueConstraint(
            "parts_catalog_entry_id",
            "equipment_catalog_id",
            "model_code",
            name="uq_parts_catalog_compat_entry_catalog_model",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parts_catalog_entry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("parts_catalog_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    equipment_catalog_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("equipment_catalog.id", ondelete="SET NULL"), nullable=True, index=True
    )
    brand: Mapped[str | None] = mapped_column(String(120))
    model_code: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)

    parts_catalog_entry: Mapped["PartsCatalogEntry"] = relationship(back_populates="compatibilities")


class TechnicianCertification(Base):
    __tablename__ = "technician_certifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    technician_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    manufacturer_partner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("manufacturer_partners.id", ondelete="CASCADE"), nullable=False, index=True
    )
    certification_code: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[TechnicianCertificationStatus] = mapped_column(
        Enum(
            TechnicianCertificationStatus,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=TechnicianCertificationStatus.PENDING,
    )
    issued_at: Mapped[date | None] = mapped_column(Date)
    expires_at: Mapped[date | None] = mapped_column(Date, index=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    homologated_models: Mapped[list["TechnicianCertificationModel"]] = relationship(
        back_populates="certification", cascade="all, delete-orphan"
    )


class TechnicianCertificationModel(Base):
    __tablename__ = "technician_certification_models"
    __table_args__ = (
        UniqueConstraint(
            "certification_id",
            "equipment_catalog_id",
            "model_code",
            name="uq_technician_cert_model_cert_catalog_model",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    certification_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("technician_certifications.id", ondelete="CASCADE"), nullable=False, index=True
    )
    equipment_catalog_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("equipment_catalog.id", ondelete="SET NULL"), nullable=True, index=True
    )
    brand: Mapped[str | None] = mapped_column(String(120))
    model_code: Mapped[str] = mapped_column(String(120), nullable=False)

    certification: Mapped["TechnicianCertification"] = relationship(back_populates="homologated_models")


class ManufacturerIntegrationProfile(Base):
    __tablename__ = "manufacturer_integration_profiles"
    __table_args__ = (
        UniqueConstraint(
            "manufacturer_partner_id",
            "profile_code",
            name="uq_manufacturer_integration_profile_partner_code",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    manufacturer_partner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("manufacturer_partners.id", ondelete="CASCADE"), nullable=False, index=True
    )
    profile_code: Mapped[str] = mapped_column(String(64), nullable=False)
    protocol: Mapped[IntegrationProtocol] = mapped_column(
        Enum(
            IntegrationProtocol,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=IntegrationProtocol.JSON_REST,
    )
    auth_mode: Mapped[IntegrationAuthMode] = mapped_column(
        Enum(
            IntegrationAuthMode,
            values_callable=lambda items: [item.value for item in items],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=IntegrationAuthMode.NONE,
    )
    base_url: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    config_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    secrets_ref: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
