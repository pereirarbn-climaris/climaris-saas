from __future__ import annotations

from datetime import date, datetime
import json
import re
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field, computed_field, field_validator, model_validator

from app.plan_rules import get_plan_definition, normalize_plan_key
from models import (
    BudgetStatus,
    EquipmentType,
    FinanceEntryStatus,
    FinanceEntryType,
    ServiceOrderServiceItem,
    StockMovementReason,
    TenantStatus,
    UserRole,
)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool = False
    tenant_id: int = Field(description="Workspace ao qual o token pertence (sempre preenchido no login).")
    is_platform_operator: bool = Field(
        default=False,
        description="True se o usuário é operador da plataforma (painel de operação, não o app cliente).",
    )
    two_factor_required: bool = False
    two_factor_token: str | None = None
    captcha_required: bool = False
    captcha_token: str | None = None
    captcha_question: str | None = None
    refresh_token: str | None = Field(
        default=None,
        description="Token opaco para POST /auth/refresh quando REFRESH_TOKEN_ENABLED na API.",
    )


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=20, max_length=512)


class LogoutRequest(BaseModel):
    """Revoga um refresh token conhecido (melhor esforço; usado no logout do SPA)."""

    refresh_token: str | None = Field(default=None, max_length=512)


class LoginRequest(BaseModel):
    """Login padrão: só e-mail e senha. `tenant_id` opcional se o mesmo e-mail existir em mais de uma empresa."""

    email: EmailStr
    password: str = Field(..., min_length=1, max_length=256)
    tenant_id: int | None = Field(default=None, ge=1)
    captcha_token: str | None = Field(default=None, min_length=10, max_length=256)
    captcha_answer: str | None = Field(default=None, min_length=1, max_length=32)
    two_factor_token: str | None = Field(default=None, min_length=20, max_length=256)
    two_factor_code: str | None = Field(default=None, min_length=4, max_length=12)
    trust_this_device: bool = Field(
        default=False,
        description="Após validar o código 2FA, criar cookie HTTP-only de dispositivo confiável (admin).",
    )


class TrustedDeviceOut(BaseModel):
    """Dispositivo/navegador confiável para pular 2FA."""

    id: int
    expires_at: datetime
    created_at: datetime
    last_used_at: datetime | None = None
    is_current_browser: bool = False


class BootstrapAdminRequest(BaseModel):
    tenant_id: int
    full_name: str
    email: EmailStr
    password: str


class BootstrapTenantAdminRequest(BaseModel):
    tenant_name: str
    tax_id_kind: Literal["cnpj", "cpf"] = "cnpj"
    tax_document: str = Field(..., validation_alias=AliasChoices("tax_document", "cnpj"))
    active_plan: str = "free_30d"
    full_name: str
    email: EmailStr
    password: str
    timezone: str = "UTC"
    business_days: list[int] = [0, 1, 2, 3, 4]

    @model_validator(mode="after")
    def _normalize_tax_document(self) -> BootstrapTenantAdminRequest:
        from app.tax_id import normalize_and_validate_tax_document

        try:
            normalized = normalize_and_validate_tax_document(self.tax_document, self.tax_id_kind)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        self.tax_document = normalized
        return self


class PublicRegisterRequest(BaseModel):
    """Cadastro público: etapa 1 exige tenant_name, full_name, email, password. Telefones opcionais (somente dígitos após normalização). Documento fiscal é opcional (ou via chave legada `cnpj`)."""

    model_config = ConfigDict(extra="ignore")

    tenant_name: str
    full_name: str
    email: EmailStr
    password: str
    phone: str | None = None
    whatsapp: str | None = None
    tax_document: str | None = None
    tax_id_kind: Literal["cnpj", "cpf"] = "cnpj"
    active_plan: str = "free_30d"
    timezone: str = "America/Sao_Paulo"
    business_days: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])

    @model_validator(mode="before")
    @classmethod
    def _merge_legacy_cnpj_into_tax_document(cls, data: Any) -> Any:
        """Aceita JSON com `cnpj` no lugar de `tax_document` sem alias no campo (evita 422 \"cnpj obrigatório\" em alguns clientes/Pydantic)."""
        if not isinstance(data, dict):
            return data
        if "tax_document" in data:
            return data
        if "cnpj" in data:
            return {**data, "tax_document": data.get("cnpj")}
        return data

    @model_validator(mode="after")
    def _normalize_tax_optional(self) -> PublicRegisterRequest:
        if self.tax_document is None:
            return self
        raw = str(self.tax_document).strip()
        if not raw:
            self.tax_document = None
            return self
        from app.tax_id import normalize_and_validate_tax_document

        try:
            self.tax_document = normalize_and_validate_tax_document(raw, self.tax_id_kind)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        return self

    @field_validator("phone", "whatsapp", mode="after")
    @classmethod
    def _normalize_register_phones(cls, v: str | None) -> str | None:
        from app.phone_br import normalize_br_phone_optional

        return normalize_br_phone_optional(v)


class CompleteTenantFiscalRequest(BaseModel):
    """Conclui PF/PJ e documento quando o tenant ainda está com cadastro fiscal pendente."""

    tax_id_kind: Literal["cnpj", "cpf"]
    tax_document: str = Field(..., validation_alias=AliasChoices("tax_document", "cnpj"))

    @model_validator(mode="after")
    def _normalize_tax_document(self) -> CompleteTenantFiscalRequest:
        from app.tax_id import normalize_and_validate_tax_document

        try:
            normalized = normalize_and_validate_tax_document(self.tax_document, self.tax_id_kind)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        self.tax_document = normalized
        return self


class UserCreateRequest(BaseModel):
    tenant_id: int
    full_name: str
    email: EmailStr
    role: UserRole = UserRole.RECEPTIONIST


class UserAdminUpdateRequest(BaseModel):
    full_name: str | None = Field(None, max_length=150)
    email: EmailStr | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    phone: str | None = None
    whatsapp: str | None = None

    @field_validator("full_name")
    @classmethod
    def _full_name_strip(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if not s:
            raise ValueError("Nome completo não pode ser vazio.")
        return s[:150]

    @field_validator("phone", "whatsapp", mode="after")
    @classmethod
    def _normalize_admin_user_phones(cls, v: str | None) -> str | None:
        from app.phone_br import normalize_br_phone_optional

        return normalize_br_phone_optional(v)

    @model_validator(mode="after")
    def _at_least_one(self) -> UserAdminUpdateRequest:
        if (
            self.full_name is None
            and self.email is None
            and self.role is None
            and self.is_active is None
            and self.phone is None
            and self.whatsapp is None
        ):
            raise ValueError("Informe ao menos um campo para atualizar.")
        return self


class UserSelfUpdateRequest(BaseModel):
    """Atualização do próprio perfil (sem papel nem status)."""

    full_name: str | None = Field(None, max_length=150)
    email: EmailStr | None = None
    phone: str | None = None
    whatsapp: str | None = None

    @field_validator("full_name")
    @classmethod
    def _full_name_strip(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if not s:
            raise ValueError("Nome completo não pode ser vazio.")
        return s[:150]

    @field_validator("phone", "whatsapp", mode="after")
    @classmethod
    def _normalize_self_phones(cls, v: str | None) -> str | None:
        from app.phone_br import normalize_br_phone_optional

        return normalize_br_phone_optional(v)

    @model_validator(mode="after")
    def _at_least_one(self) -> UserSelfUpdateRequest:
        if self.full_name is None and self.email is None and self.phone is None and self.whatsapp is None:
            raise ValueError("Informe ao menos um campo para atualizar.")
        return self


class TenantAdminUpdateRequest(BaseModel):
    """Atualização geral da empresa (admin do tenant). Campos omitidos permanecem inalterados."""

    name: str | None = Field(None, max_length=150)
    active_plan: str | None = Field(None, max_length=80)
    finance_enabled: bool | None = None
    finance_mode: Literal["basic", "intermediate", "management"] | None = None
    timezone: str | None = Field(None, max_length=64)
    business_days: str | None = Field(None, max_length=32)
    workday_start: str | None = Field(None, max_length=5)
    workday_end: str | None = Field(None, max_length=5)
    weekday_work_hours: dict[str, dict[str, str]] | None = None
    block_national_holidays: bool | None = None
    status: TenantStatus | None = None
    tax_id_kind: Literal["cpf", "cnpj"] | None = None
    tax_document: str | None = Field(None, validation_alias=AliasChoices("tax_document", "cnpj"))
    address_street: str | None = Field(None, max_length=255)
    address_number: str | None = Field(None, max_length=20)
    address_complement: str | None = Field(None, max_length=120)
    address_district: str | None = Field(None, max_length=100)
    address_city: str | None = Field(None, max_length=100)
    address_state: str | None = Field(None, max_length=2)
    address_postal_code: str | None = Field(None, max_length=12)
    address_country: str | None = Field(None, max_length=60)
    address_ibge_code: str | None = Field(None, max_length=7)
    phone: str | None = Field(None, max_length=20)
    email: str | None = Field(None, max_length=255)
    website: str | None = Field(None, max_length=255)
    pdf_primary_color: str | None = Field(None, max_length=7)

    @field_validator("name", "active_plan", "timezone", "address_country", "phone", "email", "website")
    @classmethod
    def _strip_optional(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        return s or None

    @field_validator("active_plan")
    @classmethod
    def _normalize_active_plan(cls, v: str | None) -> str | None:
        if v is None:
            return None
        plan = get_plan_definition(v)
        if plan.is_beta_internal:
            raise ValueError("Plano beta interno só pode ser gerenciado no painel SaaS.")
        return plan.key

    @field_validator("pdf_primary_color")
    @classmethod
    def _pdf_color_hex(cls, v: str | None) -> str | None:
        if v is None:
            return None
        color = v.strip().upper()
        if not re.fullmatch(r"#[0-9A-F]{6}", color):
            raise ValueError("Cor do PDF deve estar no formato hexadecimal, ex.: #0B7FAF.")
        return color

    @field_validator("name")
    @classmethod
    def _name_nonempty(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not v.strip():
            raise ValueError("Nome da empresa não pode ser vazio.")
        return v.strip()[:150]

    @field_validator("business_days")
    @classmethod
    def _business_days_ok(cls, v: str | None) -> str | None:
        if v is None:
            return None
        parts = [p.strip() for p in v.split(",") if p.strip() != ""]
        if not parts:
            raise ValueError("Informe ao menos um dia útil (0=segunda … 6=domingo).")
        days: list[int] = []
        for p in parts:
            try:
                d = int(p)
            except ValueError as exc:
                raise ValueError("Dias úteis devem ser números de 0 a 6 separados por vírgula.") from exc
            if d < 0 or d > 6:
                raise ValueError("Cada dia útil deve estar entre 0 (segunda) e 6 (domingo).")
            days.append(d)
        return ",".join(str(x) for x in sorted(set(days)))

    @field_validator("workday_start", "workday_end")
    @classmethod
    def _workday_time_ok(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if len(s) != 5 or s[2] != ":":
            raise ValueError("Horários devem estar no formato HH:MM.")
        try:
            hh = int(s[:2])
            mm = int(s[3:])
        except ValueError as exc:
            raise ValueError("Horários devem estar no formato HH:MM.") from exc
        if hh < 0 or hh > 23 or mm < 0 or mm > 59:
            raise ValueError("Horários devem estar no formato HH:MM.")
        return f"{hh:02d}:{mm:02d}"

    @field_validator("address_state", mode="before")
    @classmethod
    def _upper_uf(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        return v.strip().upper()[:2]

    @field_validator("address_ibge_code", mode="before")
    @classmethod
    def _digits_ibge(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        from app.tax_id import digits_only

        d = digits_only(v)
        if len(d) != 7:
            raise ValueError("Código IBGE do município deve ter 7 dígitos.")
        return d

    @model_validator(mode="after")
    def _at_least_one_field(self) -> TenantAdminUpdateRequest:
        if (
            self.name is None
            and self.active_plan is None
            and self.finance_enabled is None
            and self.finance_mode is None
            and self.timezone is None
            and self.business_days is None
            and self.workday_start is None
            and self.workday_end is None
            and self.weekday_work_hours is None
            and self.block_national_holidays is None
            and self.status is None
            and self.tax_id_kind is None
            and self.tax_document is None
            and self.address_street is None
            and self.address_number is None
            and self.address_complement is None
            and self.address_district is None
            and self.address_city is None
            and self.address_state is None
            and self.address_postal_code is None
            and self.address_country is None
            and self.address_ibge_code is None
        ):
            raise ValueError("Informe ao menos um campo para atualizar.")
        if self.workday_start is not None and self.workday_end is not None and self.workday_end <= self.workday_start:
            raise ValueError("Horário final deve ser maior que o horário inicial.")
        if self.weekday_work_hours is not None:
            normalized: dict[str, dict[str, str]] = {}
            for k, v in self.weekday_work_hours.items():
                try:
                    weekday = int(str(k))
                except ValueError as exc:
                    raise ValueError("Dias de horário específico devem estar entre 0 e 6.") from exc
                if weekday < 0 or weekday > 6:
                    raise ValueError("Dias de horário específico devem estar entre 0 e 6.")
                if not isinstance(v, dict):
                    raise ValueError("Horário específico por dia deve conter start e end.")
                start = str(v.get("start", "")).strip()
                end = str(v.get("end", "")).strip()
                if len(start) != 5 or len(end) != 5 or start[2] != ":" or end[2] != ":":
                    raise ValueError("Horário específico deve estar no formato HH:MM.")
                if end <= start:
                    raise ValueError("No horário específico, o fim deve ser maior que o início.")
                normalized[str(weekday)] = {"start": start, "end": end}
            self.weekday_work_hours = normalized
        return self


class ChangeTemporaryPasswordRequest(BaseModel):
    tenant_id: int
    email: EmailStr
    temporary_password: str
    new_password: str


class ChangeMyPasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=256)
    new_password: str = Field(..., min_length=1, max_length=256)

    @model_validator(mode="after")
    def _new_password_differs(self) -> ChangeMyPasswordRequest:
        if self.current_password == self.new_password:
            raise ValueError("A nova senha deve ser diferente da senha atual.")
        return self


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=512)


class ResendVerificationEmailRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=512)
    new_password: str = Field(..., min_length=8, max_length=256)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    full_name: str
    email: EmailStr
    role: UserRole
    is_active: bool
    must_change_password: bool
    is_platform_operator: bool = False
    phone: str | None = None
    whatsapp: str | None = None


class UserProvisionOut(UserOut):
    temporary_password: str


class PlatformSessionOut(BaseModel):
    """Confirma sessão de operador da plataforma (GET /platform/session)."""

    is_platform_operator: bool = True
    email: EmailStr
    full_name: str
    tenant_id: int


class PlatformTenantListItemOut(BaseModel):
    id: int
    name: str
    tax_id_kind: Literal["cnpj", "cpf", "pending"]
    tax_document: str
    status: TenantStatus
    active_plan: str
    timezone: str
    created_at: datetime
    registration_email: str | None = None
    users_count: int = 0
    base_user_limit: int | None = None
    extra_user_seats: int = 0
    total_user_limit: int | None = None
    clients_count: int = 0
    service_orders_count: int = 0
    schedules_count: int = 0


class PlatformTenantPlanChangeLogOut(BaseModel):
    id: int
    previous_plan: str
    new_plan: str
    changed_by_user_id: int | None = None
    changed_by_email: str | None = None
    changed_at: datetime


class PlatformLoginAttemptAuditOut(BaseModel):
    id: int
    email: str
    tenant_id: int | None = None
    user_id: int | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    device_fingerprint: str | None = None
    outcome: str
    reason: str | None = None
    created_at: datetime


class PlatformTenantDetailOut(PlatformTenantListItemOut):
    business_days: str
    workday_start: str
    workday_end: str
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    address_city: str | None = None
    address_state: str | None = None
    plan_change_logs: list[PlatformTenantPlanChangeLogOut] = []


class PlatformTenantPlanUpdateRequest(BaseModel):
    active_plan: str = Field(..., min_length=1, max_length=80)

    @field_validator("active_plan")
    @classmethod
    def _active_plan_strip(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Informe o plano.")
        return normalize_plan_key(s[:80])


FinanceModeCap = Literal["basic", "intermediate", "management"]


class SaasPlanCatalogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    plan_key: str
    display_name: str
    description: str
    footnote: str
    finance_max_mode: FinanceModeCap
    max_users: int | None
    sort_order: int
    is_beta_internal: bool
    can_contract: bool
    is_selectable_for_tenants: bool
    show_in_matrix: bool
    created_at: datetime
    updated_at: datetime


class SaasPlanCatalogCreate(BaseModel):
    plan_key: str = Field(..., min_length=1, max_length=80, pattern=r"^[a-z0-9_\-]+$")
    display_name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    footnote: str = ""
    finance_max_mode: FinanceModeCap = "basic"
    max_users: int | None = None
    sort_order: int = 0
    is_beta_internal: bool = False
    can_contract: bool = True
    is_selectable_for_tenants: bool = True
    show_in_matrix: bool = True

    @field_validator("max_users")
    @classmethod
    def _max_users_range(cls, v: int | None) -> int | None:
        if v is None:
            return v
        if v < 1 or v > 100_000:
            raise ValueError("Limite de usuários deve estar entre 1 e 100000.")
        return v


class SaasPlanCatalogUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    footnote: str | None = None
    finance_max_mode: FinanceModeCap | None = None
    max_users: int | None = None
    sort_order: int | None = None
    is_beta_internal: bool | None = None
    can_contract: bool | None = None
    is_selectable_for_tenants: bool | None = None
    show_in_matrix: bool | None = None

    @field_validator("max_users")
    @classmethod
    def _max_users_range_u(cls, v: int | None) -> int | None:
        if v is None:
            return v
        if v < 1 or v > 100_000:
            raise ValueError("Limite de usuários deve estar entre 1 e 100000.")
        return v


class PlatformApiCredentialUpsertRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=120)
    api_key: str | None = Field(
        default=None,
        description="Se enviado, atualiza/rotaciona a chave. Em branco mantém a chave atual.",
    )
    api_base_url: str | None = Field(default=None, max_length=255)
    aws_access_key_id: str | None = Field(
        default=None,
        description="Se enviado, atualiza o AWS_ACCESS_KEY_ID. Em branco mantém o valor atual.",
    )
    aws_secret_access_key: str | None = Field(
        default=None,
        description="Se enviado, atualiza o AWS_SECRET_ACCESS_KEY. Em branco mantém o valor atual.",
    )
    extra_config: dict[str, Any] | None = None
    clear_api_key: bool = False
    clear_aws_keys: bool = False

    @field_validator("display_name")
    @classmethod
    def _display_name_strip(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Informe o nome de exibição.")
        return s[:120]

    @field_validator("api_key")
    @classmethod
    def _api_key_strip(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        return s or None

    @field_validator("api_base_url")
    @classmethod
    def _api_base_url_strip(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        return s or None

    @field_validator("aws_access_key_id", "aws_secret_access_key")
    @classmethod
    def _aws_key_strip(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        return s or None


class PlatformApiCredentialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    provider_slug: str
    display_name: str
    api_base_url: str | None = None
    has_api_key: bool
    api_key_preview: str | None = None
    has_aws_access_key_id: bool = False
    aws_access_key_id_preview: str | None = None
    has_aws_secret_access_key: bool = False
    aws_secret_access_key_preview: str | None = None
    aws_keys_updated_at: datetime | None = None
    extra_config: dict[str, Any] | None = None
    key_updated_at: datetime | None = None
    updated_at: datetime


class TenantApiKeyCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Informe um nome para a chave.")
        return s[:120]


class TenantApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    key_prefix: str
    created_at: datetime
    revoked_at: datetime | None = None
    last_used_at: datetime | None = None


class TenantApiKeyCreatedResponse(TenantApiKeyOut):
    """Inclui o segredo uma única vez na criação."""

    api_key: str = Field(..., description="Copie agora; não será exibido novamente.")


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    cnpj: str
    tax_id_kind: Literal["cnpj", "cpf", "pending"]
    active_plan: str
    finance_enabled: bool
    finance_mode: Literal["basic", "intermediate", "management"]
    timezone: str
    business_days: str
    workday_start: str
    workday_end: str
    weekday_work_hours: dict[str, dict[str, str]] | None = None
    block_national_holidays: bool
    status: TenantStatus
    address_street: str | None = None
    address_number: str | None = None
    address_complement: str | None = None
    address_district: str | None = None
    address_city: str | None = None
    address_state: str | None = None
    address_postal_code: str | None = None
    address_country: str = "Brasil"
    address_ibge_code: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    whatsapp_instance_name: str | None = None
    whatsapp_connection_status: str | None = None
    whatsapp_connected_at: datetime | None = None
    logo_s3_key: str | None = None
    logo_url: str | None = None
    logo_content_type: str | None = None
    logo_updated_at: datetime | None = None
    pdf_primary_color: str = "#0B7FAF"

    @field_validator("weekday_work_hours", mode="before")
    @classmethod
    def _parse_weekday_work_hours(cls, v: Any) -> dict[str, dict[str, str]] | None:
        if v is None or v == "":
            return None
        if isinstance(v, dict):
            return v
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
            except json.JSONDecodeError:
                return None
            if isinstance(parsed, dict):
                return parsed
        return None

    @computed_field
    @property
    def tax_document(self) -> str:
        """Mesmo valor que `cnpj` na API (coluna única no banco para CPF ou CNPJ)."""
        return self.cnpj

    @computed_field
    @property
    def registration_complete(self) -> bool:
        return self.tax_id_kind != "pending"


class CnpjAddressOut(BaseModel):
    street: str | None = None
    number: str | None = None
    details: str | None = None
    district: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None


class CnpjLookupOut(BaseModel):
    """Dados normalizados da consulta CNPJá (cadastro / visão resumida)."""

    source: Literal["open", "commercial", "brasilapi"]
    tax_id: str
    company_name: str
    trade_name: str | None = None
    status_text: str | None = None
    founded: str | None = None
    main_activity: str | None = None
    address: CnpjAddressOut | None = None
    optante_mei: bool | None = None


class CnpjRegisterLookupOut(BaseModel):
    """Cadastro: primeiro verifica se o CNPJ já é tenant; senão consulta CNPJá."""

    already_registered: bool
    registered_tenant_name: str | None = None
    lookup: CnpjLookupOut | None = None
    external_unavailable: bool = False
    lookup_hint: str | None = None


class CnpjCommercialLookupOut(CnpjLookupOut):
    """Resposta comercial; `full` traz o JSON completo para integrações (ex.: NF)."""

    full: dict | None = None


class CepLookupOut(BaseModel):
    """Endereço normalizado a partir do ViaCEP (CEP de 8 dígitos)."""

    source: Literal["viacep"] = "viacep"
    cep: str = Field(description="CEP formatado (00000-000).")
    address_street: str | None = None
    address_complement: str | None = None
    address_district: str | None = None
    address_city: str | None = None
    address_state: str | None = Field(default=None, max_length=2)
    address_postal_code: str | None = Field(default=None, description="Mesmo CEP formatado para o formulário.")
    address_ibge_code: str | None = Field(default=None, max_length=7)


class ClientCreate(BaseModel):
    """Cadastro de cliente; endereço e IE alinhados ao destinatário NFe / tomador NFSe (Focus NFe)."""

    name: str
    document: str | None = None
    tax_id_kind: Literal["cpf", "cnpj"] | None = None
    optante_mei: bool = False
    phone: str | None = None
    whatsapp: str | None = None
    email: EmailStr | None = None
    trade_name: str | None = None
    contact_person_name: str | None = Field(
        default=None,
        max_length=150,
        description="Pessoa com quem se fala na empresa (PJ).",
    )
    state_registration: str | None = None
    ie_indicator: Literal["1", "2", "9"] | None = Field(
        default=None,
        description="NFe indicador IE destinatário: 1 contribuinte ICMS, 2 isento, 9 não contribuinte.",
    )
    municipal_registration: str | None = None
    address_street: str | None = None
    address_number: str | None = None
    address_complement: str | None = None
    address_district: str | None = None
    address_city: str | None = None
    address_state: str | None = Field(default=None, max_length=2)
    address_postal_code: str | None = None
    address_country: str | None = "Brasil"
    address_ibge_code: str | None = Field(default=None, max_length=7)
    preventive_campaign_opt_out: bool = False
    is_active: bool = True

    @field_validator("contact_person_name", mode="before")
    @classmethod
    def _strip_contact_create(cls, v: str | None) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v.strip()[:150] if isinstance(v, str) else v

    @model_validator(mode="after")
    def _normalize_document(self) -> ClientCreate:
        from app.tax_id import digits_only, normalize_and_validate_tax_document

        raw = (self.document or "").strip()
        if not raw:
            self.document = None
            return self
        d = digits_only(raw)
        kind = self.tax_id_kind
        if kind is None:
            if len(d) == 11:
                kind = "cpf"
            elif len(d) == 14:
                kind = "cnpj"
            else:
                raise ValueError("Informe tax_id_kind ou um documento com 11 (CPF) ou 14 (CNPJ) dígitos.")
        self.tax_id_kind = kind
        try:
            self.document = normalize_and_validate_tax_document(raw, kind)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        return self

    @field_validator("address_state", mode="before")
    @classmethod
    def _upper_uf(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        return v.strip().upper()[:2]

    @field_validator("address_ibge_code", mode="before")
    @classmethod
    def _digits_ibge(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        from app.tax_id import digits_only

        d = digits_only(v)
        if len(d) != 7:
            raise ValueError("Código IBGE do município deve ter 7 dígitos.")
        return d


class ClientUpdate(BaseModel):
    name: str | None = None
    document: str | None = None
    tax_id_kind: Literal["cpf", "cnpj"] | None = None
    optante_mei: bool | None = None
    phone: str | None = None
    whatsapp: str | None = None
    email: EmailStr | None = None
    trade_name: str | None = None
    contact_person_name: str | None = Field(default=None, max_length=150)
    state_registration: str | None = None
    ie_indicator: Literal["1", "2", "9"] | None = None
    municipal_registration: str | None = None
    address_street: str | None = None
    address_number: str | None = None
    address_complement: str | None = None
    address_district: str | None = None
    address_city: str | None = None
    address_state: str | None = Field(default=None, max_length=2)
    address_postal_code: str | None = None
    address_country: str | None = None
    address_ibge_code: str | None = Field(default=None, max_length=7)
    preventive_campaign_opt_out: bool | None = None
    is_active: bool | None = None

    @field_validator("contact_person_name", mode="before")
    @classmethod
    def _strip_contact_person(cls, v: str | None) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v.strip()[:150] if isinstance(v, str) else v

    @field_validator("address_state", mode="before")
    @classmethod
    def _upper_uf_update(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        return v.strip().upper()[:2]

    @field_validator("address_ibge_code", mode="before")
    @classmethod
    def _digits_ibge_update(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        from app.tax_id import digits_only

        d = digits_only(v)
        if len(d) != 7:
            raise ValueError("Código IBGE do município deve ter 7 dígitos.")
        return d


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    document: str | None = None
    tax_id_kind: str
    optante_mei: bool = False
    phone: str | None = None
    whatsapp: str | None = None
    email: EmailStr | None = None
    trade_name: str | None = None
    contact_person_name: str | None = None
    state_registration: str | None = None
    ie_indicator: str | None = None
    municipal_registration: str | None = None
    address_street: str | None = None
    address_number: str | None = None
    address_complement: str | None = None
    address_district: str | None = None
    address_city: str | None = None
    address_state: str | None = None
    address_postal_code: str | None = None
    address_country: str
    address_ibge_code: str | None = None
    preventive_campaign_opt_out: bool = False
    is_active: bool = True


class ClientAuditEntryOut(BaseModel):
    """Histórico de alterações no cadastro do cliente."""

    id: int
    user_id: int | None = None
    user_name: str | None = None
    action: str
    changes: dict[str, Any]
    created_at: datetime


class ClientCountOut(BaseModel):
    total: int


class ClientImportSummaryOut(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[str]


class EquipmentCreate(BaseModel):
    tipo: EquipmentType = EquipmentType.AR_CONDICIONADO
    identificacao: str = Field(..., min_length=1, max_length=120)
    fabricante: str | None = Field(default=None, max_length=120)
    modelo: str | None = Field(default=None, max_length=120)
    serial: str | None = Field(default=None, max_length=120)
    capacidade_btu: int | None = Field(default=None, ge=1)
    capacidade_tr: float | None = Field(default=None, ge=0)
    categoria_instalacao: str | None = Field(
        default=None, max_length=32, description="Split, Cassete, Piso-Teto, etc."
    )
    modelo_evaporadora: str | None = Field(default=None, max_length=120)
    modelo_condensadora: str | None = Field(default=None, max_length=120)
    tipo_gas: str | None = Field(default=None, max_length=40)
    voltagem: str | None = Field(default=None, max_length=20)
    tecnologia_ciclo: Literal["on_off", "inverter"] | None = None
    local_instalacao: str | None = Field(default=None, max_length=180)
    ambiente_nome: str | None = Field(default=None, max_length=180)
    ambiente_tipo: str | None = Field(default=None, max_length=120)
    area_m2: float | None = Field(default=None, ge=0)
    ocupacao_fixa: int | None = Field(default=None, ge=0)
    ocupacao_flutuante: int | None = Field(default=None, ge=0)
    carga_termica_total: str | None = Field(default=None, max_length=200)
    massa_gas_kg: float | None = Field(default=None, ge=0)
    corrente_nominal_a: float | None = Field(default=None, ge=0)
    filtro_tipo: str | None = Field(default=None, max_length=80)
    filtro_quantidade: int | None = Field(default=None, ge=0)
    filtro_dimensoes: str | None = Field(default=None, max_length=120)
    filtro_periodicidade_limpeza: str | None = Field(default=None, max_length=120)
    ativo: bool = True


class EquipmentUpdate(BaseModel):
    tipo: EquipmentType | None = None
    identificacao: str | None = Field(default=None, min_length=1, max_length=120)
    fabricante: str | None = Field(default=None, max_length=120)
    modelo: str | None = Field(default=None, max_length=120)
    serial: str | None = Field(default=None, max_length=120)
    capacidade_btu: int | None = Field(default=None, ge=1)
    capacidade_tr: float | None = Field(default=None, ge=0)
    categoria_instalacao: str | None = Field(default=None, max_length=32)
    modelo_evaporadora: str | None = Field(default=None, max_length=120)
    modelo_condensadora: str | None = Field(default=None, max_length=120)
    tipo_gas: str | None = Field(default=None, max_length=40)
    voltagem: str | None = Field(default=None, max_length=20)
    tecnologia_ciclo: Literal["on_off", "inverter"] | None = None
    local_instalacao: str | None = Field(default=None, max_length=180)
    ambiente_nome: str | None = Field(default=None, max_length=180)
    ambiente_tipo: str | None = Field(default=None, max_length=120)
    area_m2: float | None = Field(default=None, ge=0)
    ocupacao_fixa: int | None = Field(default=None, ge=0)
    ocupacao_flutuante: int | None = Field(default=None, ge=0)
    carga_termica_total: str | None = Field(default=None, max_length=200)
    massa_gas_kg: float | None = Field(default=None, ge=0)
    corrente_nominal_a: float | None = Field(default=None, ge=0)
    filtro_tipo: str | None = Field(default=None, max_length=80)
    filtro_quantidade: int | None = Field(default=None, ge=0)
    filtro_dimensoes: str | None = Field(default=None, max_length=120)
    filtro_periodicidade_limpeza: str | None = Field(default=None, max_length=120)
    ativo: bool | None = None


class EquipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    public_token: str
    tipo: EquipmentType
    identificacao: str
    fabricante: str | None = None
    modelo: str | None = None
    serial: str | None = None
    capacidade_btu: int | None = None
    capacidade_tr: float | None = None
    categoria_instalacao: str | None = None
    modelo_evaporadora: str | None = None
    modelo_condensadora: str | None = None
    tipo_gas: str | None = None
    voltagem: str | None = None
    tecnologia_ciclo: str | None = None
    local_instalacao: str | None = None
    ambiente_nome: str | None = None
    ambiente_tipo: str | None = None
    area_m2: float | None = None
    ocupacao_fixa: int | None = None
    ocupacao_flutuante: int | None = None
    carga_termica_total: str | None = None
    massa_gas_kg: float | None = None
    corrente_nominal_a: float | None = None
    filtro_tipo: str | None = None
    filtro_quantidade: int | None = None
    filtro_dimensoes: str | None = None
    filtro_periodicidade_limpeza: str | None = None
    ativo: bool
    created_at: datetime
    updated_at: datetime


class EquipmentDocumentCreate(BaseModel):
    document_type: Literal["pmoc", "technical_report", "hygiene_report"]
    title: str = Field(..., min_length=3, max_length=180)
    status: Literal["draft", "issued", "signed", "expired", "cancelled"] = "draft"
    issued_at: datetime | None = None
    valid_until: date | None = None
    next_due_at: date | None = None
    service_order_id: int | None = Field(default=None, ge=1)
    technician_id: int | None = Field(default=None, ge=1)
    notes: str | None = None
    schema_version: str = Field(default="v1", min_length=1, max_length=20)
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("title")
    @classmethod
    def _title_strip(cls, v: str) -> str:
        s = v.strip()
        if len(s) < 3:
            raise ValueError("Título deve ter pelo menos 3 caracteres.")
        return s[:180]

    @field_validator("notes")
    @classmethod
    def _notes_strip(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        return s or None


class EquipmentDocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=180)
    status: Literal["draft", "issued", "signed", "expired", "cancelled"] | None = None
    issued_at: datetime | None = None
    valid_until: date | None = None
    next_due_at: date | None = None
    service_order_id: int | None = Field(default=None, ge=1)
    technician_id: int | None = Field(default=None, ge=1)
    notes: str | None = None
    schema_version: str | None = Field(default=None, min_length=1, max_length=20)
    payload: dict[str, Any] | None = None

    @field_validator("title")
    @classmethod
    def _title_strip(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if len(s) < 3:
            raise ValueError("Título deve ter pelo menos 3 caracteres.")
        return s[:180]

    @field_validator("notes")
    @classmethod
    def _notes_strip(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        return s or None

    @model_validator(mode="after")
    def _at_least_one(self) -> "EquipmentDocumentUpdate":
        if (
            self.title is None
            and self.status is None
            and self.issued_at is None
            and self.valid_until is None
            and self.next_due_at is None
            and self.service_order_id is None
            and self.technician_id is None
            and self.notes is None
            and self.schema_version is None
            and self.payload is None
        ):
            raise ValueError("Informe ao menos um campo para atualizar.")
        return self


class EquipmentDocumentOut(BaseModel):
    id: int
    tenant_id: int
    equipment_id: int
    service_order_id: int | None = None
    responsible_user_id: int | None = None
    technician_id: int | None = None
    document_type: Literal["pmoc", "technical_report", "hygiene_report"]
    status: Literal["draft", "issued", "signed", "expired", "cancelled"]
    document_number: int
    title: str
    issued_at: datetime | None = None
    valid_until: date | None = None
    next_due_at: date | None = None
    notes: str | None = None
    schema_version: str = "v1"
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class EquipmentDocumentWithEquipmentOut(EquipmentDocumentOut):
    """Documento com identificação do equipamento (lista agregada por cliente)."""

    equipment_identificacao: str


class EquipmentDocumentAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    file_type: str
    file_name: str | None = None
    file_s3_key: str | None = None
    file_url: str | None = None
    uploaded_by_user_id: int | None = None
    created_at: datetime


class EquipmentDocumentEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    event_type: str
    actor_user_id: int | None = None
    metadata_json: str | None = None
    created_at: datetime


# --- PMOC (Lei 13.589/2018) ---------------------------------------------------------------------------

PmocPlanStatusApi = Literal["draft", "active", "inactive", "archived"]
PmocFrequencyApi = Literal["monthly", "quarterly", "semiannual", "annual", "custom"]
PmocExecutionCompletionApi = Literal["done", "partial", "skipped"]


class PmocClientSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    trade_name: str | None = None
    document: str | None = None
    address_city: str | None = None
    address_state: str | None = None


class PmocPlanOut(BaseModel):
    """Montado na API a partir de `PmocPlan` + cliente opcional."""

    id: int
    tenant_id: int
    client_id: int
    status: PmocPlanStatusApi
    title: str
    version_label: str
    establishment_snapshot: dict[str, Any] = Field(default_factory=dict)
    law_reference_note: str | None = None
    internal_notes: str | None = None
    extras: dict[str, Any] = Field(default_factory=dict)
    total_btu_sum: int
    air_analysis_required: bool
    next_air_analysis_due: date | None = None
    responsible_name: str | None = None
    responsible_council: str | None = None
    responsible_registration: str | None = None
    art_number: str | None = None
    art_issued_at: date | None = None
    art_file_url: str | None = None
    activated_at: datetime | None = None
    deactivated_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    client: PmocClientSummaryOut | None = None


class PmocPlanCreate(BaseModel):
    client_id: int = Field(ge=1)
    title: str = Field(..., min_length=3, max_length=200)

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str) -> str:
        s = v.strip()
        if len(s) < 3:
            raise ValueError("Informe um título com pelo menos 3 caracteres.")
        return s[:200]


class PmocPlanUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    version_label: str | None = Field(default=None, max_length=40)
    law_reference_note: str | None = None
    internal_notes: str | None = None
    extras: dict[str, Any] | None = None
    responsible_name: str | None = Field(default=None, max_length=180)
    responsible_council: str | None = Field(default=None, max_length=16)
    responsible_registration: str | None = Field(default=None, max_length=80)
    art_number: str | None = Field(default=None, max_length=120)
    art_issued_at: date | None = None
    next_air_analysis_due: date | None = None


class PmocPlanEquipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pmoc_id: int
    equipment_id: int
    sort_order: int
    ficha_notes: str | None = None
    identificacao: str | None = None
    modelo: str | None = None
    capacidade_btu: int | None = None
    local_instalacao: str | None = None


class PmocPlanEquipmentsReplace(BaseModel):
    equipment_ids: list[int] = Field(default_factory=list, max_length=500)


class PmocScheduledActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pmoc_id: int
    equipment_id: int | None = None
    frequency: PmocFrequencyApi
    task_code: str | None = None
    title: str
    description: str | None = None
    sort_order: int
    is_system_seed: bool


class PmocScheduledActivityCreate(BaseModel):
    equipment_id: int | None = Field(default=None, ge=1)
    frequency: PmocFrequencyApi
    task_code: str | None = Field(default=None, max_length=40)
    title: str = Field(..., min_length=2, max_length=200)
    description: str | None = None
    sort_order: int = 0


class PmocScheduledActivityUpdate(BaseModel):
    equipment_id: int | None = Field(default=None, ge=1)
    frequency: PmocFrequencyApi | None = None
    task_code: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = None
    sort_order: int | None = None


class PmocExecutionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pmoc_id: int
    scheduled_activity_id: int | None = None
    equipment_id: int | None = None
    executed_at: datetime
    completion_status: PmocExecutionCompletionApi
    notes: str | None = None
    performed_by_user_id: int | None = None
    service_order_id: int | None = None
    created_at: datetime


class PmocExecutionCreate(BaseModel):
    scheduled_activity_id: int | None = Field(default=None, ge=1)
    equipment_id: int | None = Field(default=None, ge=1)
    executed_at: datetime | None = None
    completion_status: PmocExecutionCompletionApi = "done"
    notes: str | None = None
    service_order_id: int | None = Field(default=None, ge=1)


class PmocAirQualityAnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pmoc_id: int
    analysis_date: date
    lab_name: str | None = None
    summary: str | None = None
    next_due_date: date | None = None
    file_url: str | None = None
    created_by_user_id: int | None = None
    created_at: datetime


class PmocAirQualityAnalysisCreate(BaseModel):
    analysis_date: date
    lab_name: str | None = Field(default=None, max_length=200)
    summary: str | None = None
    next_due_date: date | None = None


class ProductCreate(BaseModel):
    name: str
    sku: str
    purchase_price: float = 0
    sale_price: float = 0
    stock_quantity: float = Field(default=0, ge=0)
    compatible_equipment_tags: str | None = Field(default=None, max_length=400)
    btu_min: int | None = Field(default=None, ge=0)
    btu_max: int | None = Field(default=None, ge=0)
    application_scope: str | None = Field(default=None, max_length=20)
    is_active: bool = True


class ProductUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    purchase_price: float | None = None
    sale_price: float | None = None
    stock_quantity: float | None = Field(default=None, ge=0)
    compatible_equipment_tags: str | None = Field(default=None, max_length=400)
    btu_min: int | None = Field(default=None, ge=0)
    btu_max: int | None = Field(default=None, ge=0)
    application_scope: str | None = Field(default=None, max_length=20)
    is_active: bool | None = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    sku: str
    purchase_price: float
    sale_price: float
    unit_price: float
    stock_quantity: float
    compatible_equipment_tags: str | None = None
    btu_min: int | None = None
    btu_max: int | None = None
    application_scope: str | None = None
    is_active: bool


class ProductImportRow(BaseModel):
    row_number: int = Field(..., ge=2)
    name: str
    sku: str
    purchase_price: float = 0
    sale_price: float = 0
    stock_quantity: float = Field(default=0, ge=0)
    is_active: bool = True


class ProductImportRequest(BaseModel):
    items: list[ProductImportRow] = Field(default_factory=list, max_length=500)


class ProductImportErrorOut(BaseModel):
    row_number: int
    sku: str | None = None
    message: str


class ProductImportResultOut(BaseModel):
    created_count: int
    skipped_count: int
    error_count: int
    errors: list[ProductImportErrorOut] = Field(default_factory=list)
    created_products: list[ProductOut] = Field(default_factory=list)


class ProductImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    public_url: str
    sort_order: int
    created_at: datetime


class ProductDetailOut(ProductOut):
    images: list[ProductImageOut] = Field(default_factory=list)


class ProductImagesReorderRequest(BaseModel):
    image_ids: list[int] = Field(..., min_length=1)


class MercadoLivreOAuthCompleteRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=512)


class MercadoLivreStatusOut(BaseModel):
    """Estado da integração ML + OAuth no servidor."""

    oauth_app_configured: bool
    entitlement_active: bool
    connected: bool
    nickname: str | None = None
    ml_user_id: str | None = None
    site_id: str | None = None
    access_expires_at: datetime | None = None


class MercadoLivreLinkUpsert(BaseModel):
    ml_category_id: str | None = Field(default=None, max_length=32)
    listing_type_id: str | None = Field(default=None, max_length=40)


class MercadoLivrePublishRequest(BaseModel):
    ml_category_id: str | None = Field(default=None, max_length=32)
    listing_type_id: str | None = Field(default=None, max_length=40)


class MercadoLivreProductLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product_name: str
    product_sku: str
    ml_item_id: str | None
    permalink: str | None
    ml_category_id: str | None
    listing_type_id: str | None
    sync_status: str
    last_sync_at: datetime | None
    last_error: str | None
    ml_item_status: str | None


class InventoryProductRowOut(BaseModel):
    product_id: int
    name: str
    sku: str
    stock_quantity: float
    reserved_quantity: float
    available_quantity: float
    is_active: bool


class StockMovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    product_id: int
    quantity_delta: float
    reason: StockMovementReason
    service_order_id: int | None = None
    notes: str | None = None
    created_at: datetime


class StockAdjustmentCreate(BaseModel):
    product_id: int = Field(ge=1)
    quantity_delta: float = Field(
        ...,
        description="Positivo entra estoque, negativo sai (ajuste manual).",
    )
    notes: str | None = Field(default=None, max_length=500)


class ServiceOrderStatusUpdate(BaseModel):
    status: Literal["in_progress", "done", "cancelled"]
    schedule_notes: str | None = Field(default=None, max_length=4000)


class ServiceProductInput(BaseModel):
    product_id: int
    quantity: float = 1


class ServiceProductInputOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    quantity: float
    unit_cost: float
    total_cost: float


class ServiceCreate(BaseModel):
    name: str
    description: str | None = None
    price: float = 0
    duration_minutes: int
    equipment_type_tags: str | None = Field(default=None, max_length=400)
    btu_min: int | None = Field(default=None, ge=0)
    btu_max: int | None = Field(default=None, ge=0)
    service_category: str | None = Field(default=None, max_length=40)
    applies_residential: bool = True
    applies_commercial: bool = True
    is_active: bool = True
    nfse_codigo_tributacao_nacional: str | None = Field(default=None, max_length=32)
    nfse_codigo_nbs: str | None = Field(default=None, max_length=32)
    periodicidade_meses: Literal[6, 12] | None = Field(
        default=None,
        description="Periodicidade para alertas de manutenção preventiva (meses). Null desliga o rastreamento.",
    )
    product_inputs: list[ServiceProductInput] = []


class ServiceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: float | None = None
    duration_minutes: int | None = None
    equipment_type_tags: str | None = Field(default=None, max_length=400)
    btu_min: int | None = Field(default=None, ge=0)
    btu_max: int | None = Field(default=None, ge=0)
    service_category: str | None = Field(default=None, max_length=40)
    applies_residential: bool | None = None
    applies_commercial: bool | None = None
    is_active: bool | None = None
    nfse_codigo_tributacao_nacional: str | None = Field(default=None, max_length=32)
    nfse_codigo_nbs: str | None = Field(default=None, max_length=32)
    periodicidade_meses: Literal[6, 12] | None = None
    product_inputs: list[ServiceProductInput] | None = None


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    description: str | None = None
    price: float
    duration_minutes: int
    equipment_type_tags: str | None = None
    btu_min: int | None = None
    btu_max: int | None = None
    service_category: str | None = None
    applies_residential: bool = True
    applies_commercial: bool = True
    is_active: bool
    nfse_codigo_tributacao_nacional: str | None = None
    nfse_codigo_nbs: str | None = None
    periodicidade_meses: Literal[6, 12] | None = None
    product_inputs: list[ServiceProductInputOut] = []
    estimated_material_cost: float = 0
    estimated_profit: float = 0


class ServiceOrderServiceItemInput(BaseModel):
    service_id: int
    quantity: int = 1
    equipment_id: int | None = None


class ServiceOrderProductItemInput(BaseModel):
    product_id: int
    quantity: int = 1


class BudgetServiceItemInput(BaseModel):
    service_id: int
    quantity: int = 1


class BudgetProductItemInput(BaseModel):
    product_id: int
    quantity: int = 1


class BudgetCreate(BaseModel):
    client_id: int
    observation: str | None = None
    payment_method: str | None = None
    payment_terms: str | None = None
    warranty_terms: str | None = None
    validity_days: int = 7
    services: list[BudgetServiceItemInput]
    products: list[BudgetProductItemInput] = []


class BudgetSendRequest(BaseModel):
    sent_at: datetime | None = None


class BudgetRejectRequest(BaseModel):
    reason: str | None = None


class BudgetServiceItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    service_id: int
    quantity: int
    unit_price: float
    duration_minutes: int


class BudgetProductItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    quantity: int
    unit_price: float


class BudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    client_id: int
    observation: str | None = None
    status: str
    payment_method: str | None = None
    payment_terms: str | None = None
    warranty_terms: str | None = None
    validity_days: int
    sent_at: datetime | None = None
    approved_at: datetime | None = None
    created_at: datetime
    generated_service_order_id: int | None = None
    service_items: list[BudgetServiceItemOut]
    product_items: list[BudgetProductItemOut]


class FinanceCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    color: str | None = Field(default=None, max_length=7)


class FinanceCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    color: str | None = None
    created_at: datetime


class FinanceCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    color: str | None = Field(default=None, max_length=7)


class FinanceEntryCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=180)
    entry_type: FinanceEntryType
    amount: float = Field(..., gt=0)
    payment_method: str | None = Field(default=None, max_length=40)
    payment_provider: str | None = Field(default=None, max_length=80)
    finance_account_id: int | None = Field(default=None, ge=1)
    credit_card_id: int | None = Field(default=None, ge=1)
    fee_fixed_amount: float = Field(default=0, ge=0)
    fee_percent: float = Field(default=0, ge=0)
    fee_amount: float = Field(default=0, ge=0)
    recipient_whatsapp: str | None = Field(default=None, max_length=20)
    installments: int = Field(default=1, ge=1, le=24)
    installment_interval_months: int = Field(default=1, ge=1, le=12)
    due_date: date
    competence_date: date | None = Field(
        default=None,
        description="Data de competência (reconhecimento da receita). Padrão: primeiro vencimento.",
    )
    settlement_plan: Literal["same_as_due", "next_business_day"] | None = Field(
        default=None,
        description="Previsão de crédito na conta por parcela (maquininha).",
    )
    category_id: int | None = None
    status: FinanceEntryStatus = FinanceEntryStatus.PENDING
    notes: str | None = None
    service_order_id: int | None = Field(default=None, ge=1)

    @field_validator("recipient_whatsapp", mode="after")
    @classmethod
    def _normalize_recipient_whatsapp_create(cls, v: str | None) -> str | None:
        from app.phone_br import normalize_br_phone_optional

        return normalize_br_phone_optional(v)


class FinanceEntryUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=180)
    amount: float | None = Field(default=None, gt=0)
    payment_method: str | None = Field(default=None, max_length=40)
    payment_provider: str | None = Field(default=None, max_length=80)
    finance_account_id: int | None = Field(default=None, ge=1)
    credit_card_id: int | None = Field(default=None, ge=1)
    edit_scope: Literal["single", "future", "all"] = "single"
    fee_fixed_amount: float | None = Field(default=None, ge=0)
    fee_percent: float | None = Field(default=None, ge=0)
    fee_amount: float | None = Field(default=None, ge=0)
    recipient_whatsapp: str | None = Field(default=None, max_length=20)
    gateway_payment_id: str | None = Field(default=None, max_length=48)
    gateway_preference_id: str | None = Field(default=None, max_length=48)
    installment_group_id: str | None = Field(default=None, max_length=64)
    installment_number: int | None = Field(default=None, ge=1, le=24)
    installment_total: int | None = Field(default=None, ge=1, le=24)
    due_date: date | None = None
    competence_date: date | None = None
    settlement_plan: Literal["same_as_due", "next_business_day"] | None = None
    category_id: int | None = None
    status: FinanceEntryStatus | None = None
    notes: str | None = None

    @field_validator("recipient_whatsapp", mode="after")
    @classmethod
    def _normalize_recipient_whatsapp_update(cls, v: str | None) -> str | None:
        from app.phone_br import normalize_br_phone_optional

        return normalize_br_phone_optional(v)


class FinanceEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    category_id: int | None = None
    category_name: str | None = None
    description: str
    entry_type: FinanceEntryType
    status: FinanceEntryStatus
    amount: float
    payment_method: str | None = None
    payment_provider: str | None = None
    finance_account_id: int | None = None
    credit_card_id: int | None = None
    fee_fixed_amount: float = 0
    fee_percent: float = 0
    fee_amount: float = 0
    recipient_whatsapp: str | None = None
    gateway_payment_id: str | None = None
    gateway_preference_id: str | None = None
    mercadopago_archived_preference_id: str | None = None
    mercadopago_preapproval_id: str | None = None
    mp_reversal_at: datetime | None = None
    mp_reversal_status: str | None = None
    installment_group_id: str | None = None
    installment_number: int = 1
    installment_total: int = 1
    net_amount: float
    due_date: date
    competence_date: date
    expected_settlement_date: date
    settlement_plan: str | None = None
    paid_at: datetime | None = None
    notes: str | None = None
    service_order_id: int | None = None
    linked_payer_email: str | None = None
    linked_payer_name: str | None = None
    linked_payer_document: str | None = None
    created_at: datetime
    updated_at: datetime


class FinanceSummaryOut(BaseModel):
    period_start: date
    period_end: date
    incomes: float
    incomes_net: float
    expenses: float
    total_fees: float
    net: float
    pending_count: int
    overdue_count: int
    total_count: int


class FinanceSettingsOut(BaseModel):
    finance_enabled: bool
    selected_mode: Literal["basic", "intermediate", "management"]
    effective_mode: Literal["basic", "intermediate", "management"]
    max_available_mode: Literal["basic", "intermediate", "management"]
    can_use_marketplace_upgrade: bool = False
    requires_marketplace_slug: str | None = None


class FinanceSettingsUpdate(BaseModel):
    finance_enabled: bool
    finance_mode: Literal["basic", "intermediate", "management"]


class NfseSettingsOut(BaseModel):
    mei_opt_in: bool
    default_optante_mei: bool
    mei_environment: Literal["homolog", "producao"]
    has_mei_certificate: bool
    mei_certificate_file_name: str | None = None
    has_mei_portal_credentials: bool
    mei_last_tested_at: datetime | None = None
    mei_last_test_error: str | None = None
    focus_opt_in: bool
    has_focus_api_key: bool
    focus_environment: Literal["homolog", "producao"]
    auto_issue_on_payment: bool
    default_codigo_tributacao_nacional: str | None = None
    default_codigo_nbs: str | None = None
    prestador_inscricao_municipal: str | None = None
    dps_serie: str | None = Field(
        default=None,
        max_length=20,
        description="Série da DPS (tag serie / Id), ex. 70000 — alinhada ao cadastro no Sefin.",
    )
    auto_nfse_provider: Literal["national_mei", "focus"] | None = None


class NfseSettingsUpdate(BaseModel):
    mei_opt_in: bool | None = None
    default_optante_mei: bool | None = None
    mei_environment: Literal["homolog", "producao"] | None = None
    mei_certificate_base64: str | None = None
    mei_certificate_password: str | None = None
    mei_certificate_file_name: str | None = Field(default=None, max_length=260)
    mei_portal_username: str | None = None
    mei_portal_password: str | None = None
    clear_mei_certificate: bool = False
    clear_mei_portal_credentials: bool = False
    focus_opt_in: bool | None = None
    focus_api_key: str | None = None
    focus_environment: Literal["homolog", "producao"] | None = None
    clear_focus_api_key: bool = False
    auto_issue_on_payment: bool | None = None
    default_codigo_tributacao_nacional: str | None = Field(default=None, max_length=32)
    default_codigo_nbs: str | None = Field(default=None, max_length=32)
    prestador_inscricao_municipal: str | None = Field(default=None, max_length=15)
    dps_serie: str | None = Field(default=None, max_length=20)
    auto_nfse_provider: Literal["national_mei", "focus"] | None = None


class NfseTributacaoNacionalItemOut(BaseModel):
    codigo: str
    descricao: str
    nbs_sugerido: str | None = None


class NfseMeiTestRequest(BaseModel):
    mei_certificate_base64: str | None = None
    mei_certificate_password: str | None = None
    mei_portal_username: str | None = None
    mei_portal_password: str | None = None
    test_sefin_connectivity: bool = True


class NfseMeiTestOut(BaseModel):
    ok: bool
    certificate_ok: bool
    portal_credentials_present: bool
    message: str
    sefin_ok: bool | None = None
    sefin_message: str | None = None


class NfseIssueRequest(BaseModel):
    service_order_id: int | None = Field(default=None, ge=1)
    finance_entry_id: int | None = Field(default=None, ge=1)
    force_provider: Literal["national_mei", "focus"] | None = None
    codigo_tributacao_nacional: str | None = Field(default=None, max_length=32)
    codigo_nbs: str | None = Field(default=None, max_length=32)
    client_id: int | None = Field(default=None, ge=1)
    amount: float | None = Field(default=None, gt=0)
    service_description: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def validate_issue_mode(self) -> NfseIssueRequest:
        linked = self.service_order_id is not None or self.finance_entry_id is not None
        desc = (self.service_description or "").strip()
        standalone = (
            self.client_id is not None
            and self.amount is not None
            and self.amount > 0
            and len(desc) >= 5
        )
        if linked and (self.client_id is not None or self.amount is not None or bool(desc)):
            raise ValueError(
                "Para emitir por OS ou lançamento, não informe cliente, valor ou descrição avulsa. "
                "Use outra requisição só com emissão avulsa."
            )
        if not linked and not standalone:
            raise ValueError(
                "Informe ordem de serviço ou lançamento financeiro, ou emissão avulsa: client_id, amount e service_description (mín. 5 caracteres)."
            )
        return self


class NfseInvoicePatch(BaseModel):
    service_order_id: int | None = Field(default=None, ge=1)
    finance_entry_id: int | None = Field(default=None, ge=1)


class NfseInvoiceOut(BaseModel):
    id: int
    tenant_id: int
    client_id: int
    client_name: str | None = None
    service_order_id: int | None = None
    finance_entry_id: int | None = None
    provider: Literal["national_mei", "focus"]
    status: Literal["pending_submission", "issued", "failed", "cancelled"]
    amount: float
    rps_number: str | None = None
    nfse_number: str | None = None
    nfse_access_key: str | None = None
    verification_code: str | None = None
    municipal_code: str | None = None
    request_payload_json: str | None = None
    response_payload_json: str | None = None
    import_display: dict[str, Any] | None = None
    error_message: str | None = None
    issued_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class NfseImportXmlRequest(BaseModel):
    client_id: int | None = Field(default=None, ge=1)
    associate_client_id: int | None = Field(default=None, ge=1)
    auto_create_client_if_missing: bool = False
    service_order_id: int | None = Field(default=None, ge=1)
    finance_entry_id: int | None = Field(default=None, ge=1)
    provider: Literal["national_mei", "focus"] = "national_mei"
    xml_content: str = Field(..., min_length=20)
    amount: float | None = Field(default=None, ge=0)


class NfseImportXmlBatchRequest(BaseModel):
    client_id: int | None = Field(default=None, ge=1)
    associate_client_id: int | None = Field(default=None, ge=1)
    auto_create_client_if_missing: bool = False
    service_order_id: int | None = Field(default=None, ge=1)
    finance_entry_id: int | None = Field(default=None, ge=1)
    provider: Literal["national_mei", "focus"] = "national_mei"
    xml_items: list[str] = Field(default_factory=list, min_length=1, max_length=200)
    amount: float | None = Field(default=None, ge=0)
    file_names: list[str] | None = None


class NfseImportXmlBatchItemOut(BaseModel):
    index: int
    file_name: str | None = None
    ok: bool
    message: str
    invoice_id: int | None = None
    nfse_number: str | None = None


class NfseImportXmlBatchOut(BaseModel):
    total: int
    imported: int
    failed: int
    items: list[NfseImportXmlBatchItemOut]


class FinanceGatewayAsaasUpsert(BaseModel):
    api_key: str = Field(..., min_length=8, max_length=220)
    sandbox: bool = False


class FinanceGatewayAsaasTest(BaseModel):
    api_key: str = Field(..., min_length=8, max_length=220)
    sandbox: bool = False


class FinanceGatewayMercadoPagoProducts(BaseModel):
    checkout_pro: bool = False
    pix: bool = False
    boleto: bool = False
    subscriptions: bool = False
    payment_link: bool = False


class FinanceGatewayMercadoPagoTest(BaseModel):
    access_token: str = Field(..., min_length=10, max_length=600)
    public_key: str = Field(..., min_length=8, max_length=600)
    sandbox: bool = False


class FinanceGatewayMercadoPagoUpsert(BaseModel):
    access_token: str = Field(..., min_length=10, max_length=600)
    public_key: str = Field(..., min_length=8, max_length=600)
    sandbox: bool = False
    finance_bank_account_id: int = Field(..., ge=1)
    products: FinanceGatewayMercadoPagoProducts | None = None


class FinanceGatewayMercadoPagoProductsUpdate(BaseModel):
    checkout_pro: bool = False
    pix: bool = False
    boleto: bool = False
    subscriptions: bool = False
    payment_link: bool = False


class FinanceGatewayMercadoPagoWebhookSignatureUpdate(BaseModel):
    """Segredo exibido no painel MP (Suas integrações → Webhooks) para validar x-signature."""

    webhook_signature_secret: str | None = Field(default=None, max_length=256)
    clear_webhook_signature_secret: bool = False


class FinanceGatewayStoneTest(BaseModel):
    """Chave secreta Pagar.me (sk_test_… / sk_live_…) da conta Stone."""

    secret_key: str = Field(..., min_length=16, max_length=220)


class FinanceGatewayStoneUpsert(BaseModel):
    """Atualiza Stone/Pagar.me. `secret_key` vazio mantém a chave atual se já houver integração."""

    secret_key: str = Field(default="", max_length=220)
    sandbox: bool = False
    finance_bank_account_id: int = Field(..., ge=1)
    public_key: str = Field(
        default="",
        max_length=220,
        description="Chave pública pk_test_/pk_live_; vazio remove a chave salva.",
    )


class FinanceEntryStoneChargeCreate(BaseModel):
    customer_email: EmailStr | None = None
    customer_name: str | None = Field(default=None, max_length=120)
    payer_document: str | None = Field(
        default=None,
        max_length=22,
        description="CPF/CNPJ do pagador; recomendado — muitas contas Pagar.me exigem para PIX.",
    )


class FinanceEntryStoneBoletoChargeCreate(BaseModel):
    customer_email: EmailStr | None = None
    customer_name: str | None = Field(default=None, max_length=120)
    payer_document: str | None = Field(default=None, max_length=22)
    instructions: str | None = Field(default=None, max_length=256)


class FinanceEntryStoneCardChargeCreate(BaseModel):
    customer_email: EmailStr | None = None
    customer_name: str | None = Field(default=None, max_length=120)
    payer_document: str | None = Field(default=None, max_length=22)
    card_token: str = Field(..., min_length=16, max_length=200)
    installments: int = Field(default=1, ge=1, le=12)


class FinanceOfxMatchItem(BaseModel):
    line_id: int = Field(..., ge=1)
    finance_entry_id: int = Field(..., ge=1)


class FinanceOfxApplyMatches(BaseModel):
    matches: list[FinanceOfxMatchItem] = Field(..., min_length=1, max_length=200)


class FinanceEntryAsaasChargeCreate(BaseModel):
    customer_id: str = Field(..., min_length=4, max_length=48)
    billing_type: Literal["PIX", "BOLETO"] = "PIX"


class FinanceEntryMercadoPagoChargeCreate(BaseModel):
    payer_email: EmailStr
    payer_first_name: str | None = Field(default=None, max_length=80)
    payer_last_name: str | None = Field(default=None, max_length=80)


class FinanceEntryMercadoPagoBoletoChargeCreate(BaseModel):
    payer_email: EmailStr
    payer_cpf: str = Field(..., min_length=11, max_length=14)
    payer_first_name: str | None = Field(default=None, max_length=80)
    payer_last_name: str | None = Field(default=None, max_length=80)


class FinanceEntryMercadoPagoPreferenceCreate(BaseModel):
    mode: Literal["checkout_pro", "payment_link", "subscription"] = "checkout_pro"
    payer_email: EmailStr | None = None
    success_url: str | None = Field(default=None, max_length=400)
    failure_url: str | None = Field(default=None, max_length=400)
    pending_url: str | None = Field(default=None, max_length=400)
    subscription_frequency: int = Field(default=1, ge=1, le=365)
    subscription_frequency_type: Literal["months", "days"] = "months"


class FinancePaymentFeeCreate(BaseModel):
    provider_name: str = Field(..., min_length=1, max_length=80)
    payment_method: str = Field(default="credit_card", min_length=1, max_length=40)
    installments: int = Field(default=1, ge=1, le=24)
    fee_percent: float = Field(default=0, ge=0)
    fee_fixed_amount: float = Field(default=0, ge=0)
    is_active: bool = True


class FinancePaymentFeeUpdate(BaseModel):
    provider_name: str | None = Field(default=None, min_length=1, max_length=80)
    payment_method: str | None = Field(default=None, min_length=1, max_length=40)
    installments: int | None = Field(default=None, ge=1, le=24)
    fee_percent: float | None = Field(default=None, ge=0)
    fee_fixed_amount: float | None = Field(default=None, ge=0)
    is_active: bool | None = None


class FinancePaymentFeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    provider_name: str
    payment_method: str
    installments: int
    fee_percent: float
    fee_fixed_amount: float
    is_active: bool
    created_at: datetime
    updated_at: datetime


class FinanceBankCatalogPublicOut(BaseModel):
    """Bancos ativos para o wizard de contas (tenant)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    bank_name: str
    display_label: str
    sort_order: int
    logo_url: str | None = None


class FinanceBankCatalogAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    bank_name: str
    display_label: str
    sort_order: int
    is_active: bool
    logo_external_url: str | None = None
    logo_url: str | None = None
    has_uploaded_logo: bool = False


class FinanceBankCatalogAdminPatch(BaseModel):
    display_label: str | None = Field(default=None, min_length=1, max_length=80)
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=99999)
    logo_external_url: str | None = Field(default=None, max_length=2000)


class FinanceBankAccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    bank_name: str | None = Field(default=None, max_length=80)
    account_type: Literal["checking", "savings", "investment", "digital_wallet", "cash", "other"] = "checking"
    initial_balance: float = 0
    is_active: bool = True


class FinanceBankAccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    bank_name: str | None = Field(default=None, max_length=80)
    account_type: Literal["checking", "savings", "investment", "digital_wallet", "cash", "other"] | None = None
    initial_balance: float | None = None
    is_active: bool | None = None


class FinanceBankAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    bank_name: str | None = None
    account_type: str
    initial_balance: float
    is_active: bool
    created_at: datetime
    updated_at: datetime


class FinanceCreditCardCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    brand: str = Field(default="other", min_length=1, max_length=40)
    billing_account_id: int | None = Field(default=None, ge=1)
    limit_amount: float = Field(default=0, ge=0)
    closing_day: int = Field(default=1, ge=1, le=31)
    due_day: int = Field(default=10, ge=1, le=31)
    is_active: bool = True


class FinanceCreditCardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    brand: str | None = Field(default=None, min_length=1, max_length=40)
    billing_account_id: int | None = Field(default=None, ge=1)
    limit_amount: float | None = Field(default=None, ge=0)
    closing_day: int | None = Field(default=None, ge=1, le=31)
    due_day: int | None = Field(default=None, ge=1, le=31)
    is_active: bool | None = None


class FinanceCreditCardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    billing_account_id: int | None = None
    name: str
    brand: str
    limit_amount: float
    used_limit: float = 0
    available_limit: float = 0
    closing_day: int
    due_day: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class FinanceCashflowOut(BaseModel):
    period_start: date
    period_end: date
    opening_balance: float
    incomes: float
    expenses: float
    net_flow: float
    closing_balance: float


class FinanceAccountBalanceRowOut(BaseModel):
    id: int
    name: str
    initial_balance: float
    current_balance: float
    projected_balance: float


class FinanceBalanceSnapshotOut(BaseModel):
    date_basis: str
    period_end: date
    as_of: date
    initial_balance_total: float
    current_balance_total: float
    projected_balance_total: float
    accounts: list[FinanceAccountBalanceRowOut]


class FinanceCategorySummaryOut(BaseModel):
    category_id: int | None = None
    category_name: str
    income_total: float
    expense_total: float
    balance: float


class ServiceOrderCreate(BaseModel):
    client_id: int
    title: str
    description: str | None = None
    technician_ids: list[int] = []
    services: list[ServiceOrderServiceItemInput]
    products: list[ServiceOrderProductItemInput] = []
    discount_amount: float = Field(default=0, ge=0, le=9_999_999)


class ServiceOrderApprove(BaseModel):
    starts_at: datetime
    technician_ids: list[int] | None = None
    notes: str | None = None
    allow_overtime: bool = False
    split_days: int | None = Field(default=None, ge=2, le=10)


class ServiceOrderApproveOut(BaseModel):
    service_order_id: int
    schedule_id: int
    schedule_ids: list[int] = Field(default_factory=list)
    duration_minutes: int
    split_days: int | None = None


class ServiceOrderServiceItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    service_id: int
    equipment_id: int | None = None
    quantity: int
    unit_price: float
    duration_minutes: int
    service_name: str | None = None
    periodicidade_meses: int | None = None

    @model_validator(mode="before")
    @classmethod
    def _from_orm_item(cls, data: Any) -> Any:
        if isinstance(data, ServiceOrderServiceItem):
            svc = data.service
            return {
                "id": data.id,
                "service_id": data.service_id,
                "equipment_id": data.equipment_id,
                "quantity": data.quantity,
                "unit_price": float(data.unit_price),
                "duration_minutes": data.duration_minutes,
                "service_name": svc.name if svc is not None else None,
                "periodicidade_meses": svc.periodicidade_meses if svc is not None else None,
            }
        return data


class ServiceOrderItemEquipmentUpdate(BaseModel):
    equipment_id: int | None = Field(default=None, ge=1)


class ServiceOrderServiceItemQuantityPatch(BaseModel):
    quantity: int = Field(ge=1)


class ServiceOrderProductItemQuantityPatch(BaseModel):
    quantity: int = Field(ge=1)


class EquipmentUsageReportRowOut(BaseModel):
    equipment_id: int
    identificacao: str
    tipo: str
    total_servicos: int


class PublicEquipmentHistoryEntryOut(BaseModel):
    occurred_at: datetime
    kind: str
    title: str
    detail: str | None = None


class PublicEquipmentPageOut(BaseModel):
    tenant_name: str
    identificacao: str
    tipo: str
    modelo: str | None = None
    fabricante: str | None = None
    entries: list[PublicEquipmentHistoryEntryOut]


class EquipmentTokenResolveOut(BaseModel):
    equipment_id: int
    client_id: int
    identificacao: str
    public_token: str


class EquipmentHistoryRowOut(BaseModel):
    changed_at: datetime
    source: str
    previous_equipment_id: int | None = None
    new_equipment_id: int | None = None
    service_order_id: int
    service_item_id: int
    service_name: str | None = None
    changed_by_user_id: int | None = None
    changed_by_user_name: str | None = None


class ClientServiceItemLinkRowOut(BaseModel):
    service_order_id: int
    service_item_id: int
    service_id: int
    service_name: str
    order_status: str
    equipment_id: int | None = None


class ServiceOrderProductItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    quantity: int
    unit_price: float


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    client_id: int
    client_name: str | None = None
    client_phone: str | None = None
    client_whatsapp: str | None = None
    client_address: str | None = None
    service_order_id: int | None = None
    starts_at: datetime
    ends_at: datetime
    status: str
    notes: str | None = None


class ServiceOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    client_id: int
    title: str
    description: str | None = None
    discount_amount: float = 0
    status: str
    stock_consumed_at: datetime | None = None
    service_items: list[ServiceOrderServiceItemOut]
    product_items: list[ServiceOrderProductItemOut]
    schedule: ScheduleOut | None = None
    assigned_technician_name: str | None = None
    technician_ids: list[int] = Field(default_factory=list)


class ServiceOrderDiscountUpdate(BaseModel):
    discount_amount: float = Field(ge=0, le=9_999_999)


class ScheduleReschedule(BaseModel):
    starts_at: datetime
    technician_ids: list[int] | None = None
    notes: str | None = None


class ScheduleCancel(BaseModel):
    reason: str | None = None


class TechnicianAvailabilityOut(BaseModel):
    technician_id: int
    full_name: str
    busy_slots: int
    is_available: bool


class TechnicianDayAvailabilityOut(BaseModel):
    day: date
    technicians: list[TechnicianAvailabilityOut]


class SuggestedSlotOut(BaseModel):
    technician_id: int
    starts_at: datetime
    ends_at: datetime
    shift: Literal["morning", "afternoon"] | None = None


class RescheduleOptionOut(BaseModel):
    technician_id: int | None = None
    starts_at: datetime
    ends_at: datetime
    status: Literal["integral", "fracionado"]
    note: str
    continuation_starts_at: datetime | None = None
    continuation_ends_at: datetime | None = None


class TenantHolidayCreate(BaseModel):
    holiday_date: date
    description: str | None = None


class TenantHolidayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    holiday_date: date
    description: str | None = None


class TechnicianWorkWindowCreate(BaseModel):
    technician_id: int
    weekday: int
    start_time: str
    end_time: str


class TechnicianWorkWindowUpdate(BaseModel):
    weekday: int
    start_time: str
    end_time: str


class TechnicianWorkWindowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    technician_id: int
    weekday: int
    start_time: str
    end_time: str


class TechnicianBreakWindowCreate(BaseModel):
    technician_id: int
    weekday: int
    start_time: str
    end_time: str


class TechnicianBreakWindowUpdate(BaseModel):
    weekday: int
    start_time: str
    end_time: str


class TechnicianBreakWindowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    technician_id: int
    weekday: int
    start_time: str
    end_time: str


class TechnicianUnavailabilityCreate(BaseModel):
    technician_id: int
    starts_at: datetime
    ends_at: datetime
    reason: str | None = None


class TechnicianUnavailabilityUpdate(BaseModel):
    starts_at: datetime
    ends_at: datetime
    reason: str | None = None


class TechnicianUnavailabilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    technician_id: int
    starts_at: datetime
    ends_at: datetime
    reason: str | None = None


# --- Marketplace (loja de integrações / add-ons) ---


class MarketplaceCatalogItemOut(BaseModel):
    """Item do catálogo público para tenants ativos."""

    id: int
    slug: str
    display_name: str
    short_description: str
    long_description: str | None
    monthly_price_brl: float
    setup_fee_brl: float
    feature_flag_key: str
    allow_quantity: bool = False
    unit_label: str | None = None
    user_seats_per_unit: int = 0
    entitlement_status: str | None = None
    entitlement_id: int | None = None
    entitlement_quantity: int | None = None


class MarketplaceMyEntitlementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    marketplace_app_id: int
    slug: str
    display_name: str
    status: str
    quantity: int = 1
    requested_at: datetime
    activated_at: datetime | None
    tenant_notes: str | None = None


class MarketplaceRequestIn(BaseModel):
    slug: str = Field(..., min_length=1, max_length=64)
    quantity: int = Field(default=1, ge=1, le=500)
    tenant_notes: str | None = Field(default=None, max_length=4000)


class MarketplaceRequestOut(BaseModel):
    id: int
    marketplace_app_id: int
    slug: str
    status: str
    quantity: int = 1
    requested_at: datetime


class PlatformMarketplaceAppCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=64)
    display_name: str = Field(..., min_length=1, max_length=120)
    short_description: str = Field(..., min_length=1, max_length=400)
    long_description: str | None = None
    monthly_price_brl: float = Field(..., ge=0)
    setup_fee_brl: float = Field(default=0, ge=0)
    feature_flag_key: str = Field(..., min_length=1, max_length=80)
    allow_quantity: bool = False
    unit_label: str | None = Field(default=None, max_length=40)
    user_seats_per_unit: int = Field(default=0, ge=0)
    sort_order: int = 0
    is_active: bool = True


class PlatformMarketplaceAppUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    short_description: str | None = Field(default=None, min_length=1, max_length=400)
    long_description: str | None = None
    monthly_price_brl: float | None = Field(default=None, ge=0)
    setup_fee_brl: float | None = Field(default=None, ge=0)
    feature_flag_key: str | None = Field(default=None, min_length=1, max_length=80)
    allow_quantity: bool | None = None
    unit_label: str | None = Field(default=None, max_length=40)
    user_seats_per_unit: int | None = Field(default=None, ge=0)
    sort_order: int | None = None
    is_active: bool | None = None


class PlatformMarketplaceAppOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    display_name: str
    short_description: str
    long_description: str | None
    monthly_price_brl: float
    setup_fee_brl: float
    feature_flag_key: str
    allow_quantity: bool = False
    unit_label: str | None = None
    user_seats_per_unit: int = 0
    sort_order: int
    is_active: bool
    created_at: datetime


class PlatformMarketplaceEntitlementOut(BaseModel):
    id: int
    tenant_id: int
    tenant_name: str
    marketplace_app_id: int
    app_slug: str
    app_display_name: str
    status: str
    quantity: int = 1
    requested_at: datetime
    activated_at: datetime | None
    tenant_notes: str | None
    internal_notes: str | None
    updated_at: datetime


class PlatformMarketplaceEntitlementUpdate(BaseModel):
    status: Literal["requested", "active", "suspended", "cancelled"]
    quantity: int | None = Field(default=None, ge=1, le=500)
    internal_notes: str | None = Field(default=None, max_length=8000)


class DashboardHomeKpisOut(BaseModel):
    """Indicadores consolidados do painel inicial (/app)."""

    period_year: int = Field(description="Ano de referência dos KPIs.")
    period_month: int = Field(ge=1, le=12, description="Mês de referência (1–12).")
    active_service_orders: int = Field(
        description="Ordens de serviço ativas (status diferente de done/cancelled)."
    )
    active_clients: int = Field(description="Clientes/empresas cadastrados com is_active=true.")
    monthly_revenue: float = Field(
        description="Faturamento do período: receitas pagas + OS concluídas sem lançamento financeiro vinculado."
    )
    monthly_revenue_from_finance: float = Field(
        description="Parcela do faturamento proveniente de lançamentos de receita pagos."
    )
    monthly_revenue_from_service_orders: float = Field(
        description="Parcela do faturamento proveniente de OS concluídas sem receita financeira vinculada."
    )
    average_service_minutes: float | None = Field(
        default=None,
        description="Tempo médio de atendimento (opened_at → closed_at), em minutos.",
    )
    average_service_sample_size: int = Field(
        default=0,
        description="Quantidade de OS concluídas usadas no cálculo do tempo médio.",
    )


class DashboardRevenueChartPointOut(BaseModel):
    year: int
    month: int = Field(ge=1, le=12)
    month_label: str = Field(description="Rótulo curto do mês (ex.: Jan, Fev).")
    revenue: float = Field(description="Faturamento consolidado do mês.")
    target: float = Field(description="Meta dinâmica calculada para o mês.")
    revenue_from_finance: float = 0
    revenue_from_service_orders: float = 0


class DashboardRevenueChartOut(BaseModel):
    months: int = Field(description="Quantidade de meses retornados na série.")
    end_year: int
    end_month: int = Field(ge=1, le=12)
    points: list[DashboardRevenueChartPointOut]


class DashboardRecentOrderOut(BaseModel):
    id: int
    client_name: str
    technician_name: str | None = None
    status: str = Field(description="Status no formato do widget (pending, scheduled, in_progress, completed, cancelled).")
    opened_at: datetime
    total_value: float
    title: str | None = None
