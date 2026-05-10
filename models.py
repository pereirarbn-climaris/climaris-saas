from __future__ import annotations

import enum
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
    func,
)
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


class ScheduleStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class StockMovementReason(str, enum.Enum):
    OS_CONSUMPTION = "os_consumption"
    MANUAL_ADJUST = "manual_adjust"


class FinanceEntryType(str, enum.Enum):
    INCOME = "income"
    EXPENSE = "expense"


class FinanceEntryStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class FinanceGatewayProvider(str, enum.Enum):
    ASAAS = "asaas"
    MERCADOPAGO = "mercadopago"


class FinanceAccountType(str, enum.Enum):
    CHECKING = "checking"
    SAVINGS = "savings"
    INVESTMENT = "investment"
    DIGITAL_WALLET = "digital_wallet"
    OTHER = "other"


class EquipmentType(str, enum.Enum):
    AR_CONDICIONADO = "AR_CONDICIONADO"


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
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    whatsapp_instance_name: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True)
    whatsapp_connection_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    whatsapp_connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    whatsapp_appointment_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    whatsapp_appointment_confirm_keyword: Mapped[str | None] = mapped_column(String(20), nullable=True)
    whatsapp_appointment_reschedule_keyword: Mapped[str | None] = mapped_column(String(20), nullable=True)
    whatsapp_reminder_offsets_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    whatsapp_reminder_custom_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    logo_s3_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    logo_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pdf_primary_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#0B7FAF")
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
    services: Mapped[list["Service"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    service_orders: Mapped[list["ServiceOrder"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    budgets: Mapped[list["Budget"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    schedules: Mapped[list["Schedule"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    holidays: Mapped[list["TenantHoliday"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    api_keys: Mapped[list["TenantApiKey"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    finance_categories: Mapped[list["FinanceCategory"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan"
    )
    finance_entries: Mapped[list["FinanceEntry"]] = relationship(
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


class Client(Base):
    __tablename__ = "clients"
    __table_args__ = (
        UniqueConstraint("tenant_id", "document", name="uq_clients_tenant_document"),
        UniqueConstraint("tenant_id", "phone", name="uq_clients_tenant_phone"),
        UniqueConstraint("tenant_id", "whatsapp", name="uq_clients_tenant_whatsapp"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # CPF (11) ou CNPJ (14), somente dígitos — alinhado a cpf_destinatario / cnpj_destinatario (Focus NFe NFe).
    document: Mapped[str | None] = mapped_column(String(20), nullable=True)
    tax_id_kind: Mapped[str] = mapped_column(String(8), nullable=False, default="cnpj")
    phone: Mapped[str | None] = mapped_column(String(20))
    whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255))
    # Nome fantasia (PJ); opcional.
    trade_name: Mapped[str | None] = mapped_column(String(150))
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
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
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
    pmoc_plans: Mapped[list["PmocPlan"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="PmocPlan.id.desc()"
    )


class Equipment(Base):
    __tablename__ = "equipments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
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
    public_token: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    client: Mapped["Client"] = relationship(back_populates="equipments")
    service_items: Mapped[list["ServiceOrderServiceItem"]] = relationship(back_populates="equipment")
    documents: Mapped[list["EquipmentDocument"]] = relationship(
        back_populates="equipment", cascade="all, delete-orphan", order_by="EquipmentDocument.id.desc()"
    )
    pmoc_plan_links: Mapped[list["PmocPlanEquipment"]] = relationship(
        back_populates="equipment", cascade="all, delete-orphan"
    )


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
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="products")
    order_items: Mapped[list["ServiceOrderProductItem"]] = relationship(back_populates="product")
    service_inputs: Mapped[list["ServiceProductInput"]] = relationship(back_populates="product")
    stock_movements: Mapped[list["StockMovement"]] = relationship(back_populates="product")
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="ProductImage.sort_order"
    )
    mercado_livre_link: Mapped["MercadoLivreProductLink | None"] = relationship(
        back_populates="product", uselist=False, cascade="all, delete-orphan"
    )


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
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="services")
    order_items: Mapped[list["ServiceOrderServiceItem"]] = relationship(back_populates="service")
    product_inputs: Mapped[list["ServiceProductInput"]] = relationship(
        back_populates="service", cascade="all, delete-orphan"
    )

    @property
    def estimated_material_cost(self) -> float:
        return float(sum(float(item.unit_cost) * float(item.quantity) for item in self.product_inputs))

    @property
    def estimated_profit(self) -> float:
        return float(self.price) - self.estimated_material_cost


class ServiceOrder(Base):
    __tablename__ = "service_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False, index=True)
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
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stock_consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant: Mapped["Tenant"] = relationship(back_populates="service_orders")
    client: Mapped["Client"] = relationship(back_populates="service_orders")
    technicians: Mapped[list["ServiceOrderTechnician"]] = relationship(
        back_populates="service_order", cascade="all, delete-orphan"
    )
    service_items: Mapped[list["ServiceOrderServiceItem"]] = relationship(
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
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="stock_movements")
    product: Mapped["Product"] = relationship(back_populates="stock_movements")
    service_order: Mapped["ServiceOrder | None"] = relationship(back_populates="stock_movements")


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False, index=True)
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
    validity_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    tenant: Mapped["Tenant"] = relationship(back_populates="budgets")
    client: Mapped["Client"] = relationship(back_populates="budgets")
    service_items: Mapped[list["BudgetServiceItem"]] = relationship(
        back_populates="budget", cascade="all, delete-orphan"
    )
    product_items: Mapped[list["BudgetProductItem"]] = relationship(
        back_populates="budget", cascade="all, delete-orphan"
    )
    generated_service_order: Mapped["ServiceOrder | None"] = relationship(back_populates="source_budget", uselist=False)


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


class ServiceOrderServiceItem(Base):
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
    def total_cost(self) -> float:
        return float(self.unit_cost) * float(self.quantity)


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
    installment_group_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    installment_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    installment_total: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    competence_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_settlement_date: Mapped[date] = mapped_column(Date, nullable=False)
    settlement_plan: Mapped[str | None] = mapped_column(String(32), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="finance_gateways")


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
