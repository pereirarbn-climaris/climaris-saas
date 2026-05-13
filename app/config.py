"""Configuração centralizada (env) para cadastro público e CORS."""

import os

# E-mail reservado à operação Climaris (painel /operacao). Deve coincidir com o usuário marcado em `is_platform_operator`.
PLATFORM_OPERATOR_EMAIL: str = os.getenv("PLATFORM_OPERATOR_EMAIL", "contato@climaris.com.br").strip().lower()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if not raw:
        return []
    return [o.strip() for o in raw.split(",") if o.strip()]


# App nativo (Capacitor) carrega o front em outra "origem" (ex.: https://localhost) e chama
# a API pública; sem esses itens, o `fetch` falha com "Failed to fetch" no APK.
# Ver: https://capacitorjs.com/docs/apis/http#cors
_DEFAULT_CAPACITOR_CORS_ORIGINS: tuple[str, ...] = (
    "https://localhost",
    "http://localhost",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "capacitor://localhost",
    "ionic://localhost",
)

# Produção Climaris (SPA + Evolution Manager em subdomínios distintos). Sobrescreva/estenda com CORS_ORIGINS.
_DEFAULT_CLIMARIS_PROD_CORS_ORIGINS: tuple[str, ...] = (
    "https://app.climaris.com.br",
    "https://evo.climaris.com.br",
)


def _merged_cors_origins() -> list[str]:
    from_env = _cors_origins()
    out: list[str] = []
    seen: set[str] = set()
    merged = (
        from_env
        + list(_DEFAULT_CLIMARIS_PROD_CORS_ORIGINS)
        + list(_DEFAULT_CAPACITOR_CORS_ORIGINS)
    )
    for o in merged:
        if o not in seen:
            seen.add(o)
            out.append(o)
    return out


# JWT de sessão (Bearer). Mínimo 5 minutos.
JWT_EXPIRE_MINUTES: int = max(5, int(os.getenv("JWT_EXPIRE_MINUTES", "60")))
# Opcional: se definido (ex.: 1440), usuários admin usam este TTL; demais perfis usam JWT_EXPIRE_MINUTES.
_jwt_admin_ttl_raw = os.getenv("JWT_EXPIRE_MINUTES_ADMIN", "").strip()
JWT_EXPIRE_MINUTES_ADMIN: int | None = int(_jwt_admin_ttl_raw) if _jwt_admin_ttl_raw else None

# Refresh token opaco (armazenado com hash) para renovar access JWT sem novo login.
REFRESH_TOKEN_ENABLED: bool = _env_bool("REFRESH_TOKEN_ENABLED", True)
REFRESH_TOKEN_DAYS: int = max(1, int(os.getenv("REFRESH_TOKEN_DAYS", "14")))

# Cadastro inicial público (POST /api/v1/auth/register). Desligue em ambientes só bootstrap.
PUBLIC_REGISTER_ENABLED: bool = _env_bool("PUBLIC_REGISTER_ENABLED", True)

# CORS: CORS_ORIGINS (env) primeiro, depois defaults produção Climaris + Capacitor.
# Webhooks server→server não usam CORS; isto atende requisições do browser (SPA / painéis).
CORS_ORIGINS: list[str] = _merged_cors_origins()

# Base pública usada em links de confirmação de e-mail (frontend).
APP_PUBLIC_URL: str = os.getenv("APP_PUBLIC_URL", "http://127.0.0.1:5173").strip().rstrip("/")

# URL pública da API (mesmo host que recebe /api/v1 em produção). Usada para registrar webhooks Asaas
# (POST …/api/v1/webhooks/asaas/{token}). Ex.: https://app.climaris.com.br
API_PUBLIC_BASE_URL: str = os.getenv("API_PUBLIC_BASE_URL", "").strip().rstrip("/")


def public_api_base_url() -> str:
    """
    Base pública para montar /api/v1/... (webhooks, notification_url do MP/Asaas).

    Ordem: API_PUBLIC_BASE_URL; se vazio, APP_PUBLIC_URL em HTTPS e não-localhost
    (produção comum: Nginx no mesmo host do SPA encaminha /api/v1 para a API).
    """
    if API_PUBLIC_BASE_URL:
        return API_PUBLIC_BASE_URL
    app = APP_PUBLIC_URL.strip().rstrip("/")
    if not app:
        return ""
    low = app.lower()
    if "127.0.0.1" in low or "localhost" in low:
        return ""
    if low.startswith("https://"):
        return app
    return ""


# Quando true, webhooks Mercado Pago de contas **não sandbox** exigem segredo de assinatura
# (x-signature) configurado no tenant; caso contrário o endpoint responde 503.
# Em produção defina MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE=true e configure o segredo no painel MP + Contas e carteiras.
MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE: bool = _env_bool("MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE", False)


def mercadopago_webhook_signature_enforced(*, gateway_sandbox: bool) -> bool:
    """True se este deployment exige validação x-signature para credenciais de produção (não sandbox)."""
    return bool(MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE) and not bool(gateway_sandbox)


# SMTP (ex.: Hostinger) para envio de confirmação de e-mail.
SMTP_HOST: str = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM_EMAIL: str = os.getenv("SMTP_FROM_EMAIL", SMTP_USERNAME).strip()
SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "Climaris").strip()
SMTP_USE_STARTTLS: bool = _env_bool("SMTP_USE_STARTTLS", True)
SMTP_USE_SSL: bool = _env_bool("SMTP_USE_SSL", False)
SMTP_ALLOW_DB_OVERRIDE: bool = _env_bool("SMTP_ALLOW_DB_OVERRIDE", False)

# Tempo de expiração do token de confirmação.
EMAIL_VERIFICATION_TOKEN_TTL_HOURS: int = int(os.getenv("EMAIL_VERIFICATION_TOKEN_TTL_HOURS", "24"))

# Evolution API (WhatsApp) - fase inicial de notificações.
EVOLUTION_API_BASE_URL: str = os.getenv("EVOLUTION_API_BASE_URL", "").strip().rstrip("/")
EVOLUTION_API_KEY: str = os.getenv("EVOLUTION_API_KEY", "").strip()
# Origin enviado nas chamadas server→Evolution. A Evolution aplica CORS mesmo sem browser;
# sem header Origin ela recebe `undefined` e responde 500 "Not allowed by CORS" se CORS_ORIGIN não for *.
# Deve ser igual a uma origem permitida em CORS_ORIGIN da Evolution (ex.: https://app.seudominio.com.br).
EVOLUTION_CORS_REQUEST_ORIGIN: str = (
    os.getenv("EVOLUTION_CORS_REQUEST_ORIGIN", "").strip().rstrip("/") or APP_PUBLIC_URL
)
EVOLUTION_INSTANCE: str = os.getenv("EVOLUTION_INSTANCE", "").strip()
# Token estático no path/query do webhook (ex.: ?token=...). A Evolution pode enviar JWT em vez de string fixa.
EVOLUTION_WEBHOOK_TOKEN: str = os.getenv("EVOLUTION_WEBHOOK_TOKEN", "").strip()
# Validação HS256 do JWT que a Evolution envia em ?token= ou Authorization: Bearer (mesmo valor que jwt_key no webhook da Evolution).
EVOLUTION_WEBHOOK_JWT_SECRET: str = os.getenv("EVOLUTION_WEBHOOK_JWT_SECRET", "").strip()
# Se true, tenta validar o JWT também com EVOLUTION_API_KEY (quando o jwt_key na Evolution = AUTHENTICATION_API_KEY).
EVOLUTION_WEBHOOK_JWT_USE_APIKEY: bool = _env_bool("EVOLUTION_WEBHOOK_JWT_USE_APIKEY", False)
WHATSAPP_WEBHOOK_ENABLED: bool = _env_bool("WHATSAPP_WEBHOOK_ENABLED", False)

# Mensagens interativas (botões reply) — lembretes de agenda; preventiva usa só texto.
WHATSAPP_INTERACTIVE_BUTTONS_ENABLED: bool = _env_bool("WHATSAPP_INTERACTIVE_BUTTONS_ENABLED", False)
WHATSAPP_REMINDER_WORKER_ENABLED: bool = _env_bool("WHATSAPP_REMINDER_WORKER_ENABLED", True)
WHATSAPP_REMINDER_WORKER_INTERVAL_SECONDS: int = int(os.getenv("WHATSAPP_REMINDER_WORKER_INTERVAL_SECONDS", "60"))
# Lembrete preventivo automático (vencimento = hoje), mesmo ciclo do worker de agenda.
WHATSAPP_PREVENTIVE_WORKER_ENABLED: bool = _env_bool("WHATSAPP_PREVENTIVE_WORKER_ENABLED", False)

# Opcional: permite chamar POST /api/v1/preventive-maintenance/run-due-cron com header
# X-Preventive-Cron-Secret (mesmo valor) sem JWT — útil para cron externo.
PREVENTIVE_CRON_SECRET: str = os.getenv("PREVENTIVE_CRON_SECRET", "").strip()

# IA fica reservada para a V2 do bot WhatsApp. A V1 deve usar apenas fluxos determinísticos
# configuráveis por tenant. Mesmo que WHATSAPP_AI_INCOMING_ENABLED esteja true no .env,
# a resposta automática por IA só liga quando AI_ASSISTANT_V2_ENABLED também estiver true.
AI_ASSISTANT_V2_ENABLED: bool = _env_bool("AI_ASSISTANT_V2_ENABLED", False)
# Resposta automática no WhatsApp via webhook Evolution → Anthropic Claude (`app.ai_assistant.generate_ai_response`).
WHATSAPP_AI_INCOMING_ENABLED: bool = AI_ASSISTANT_V2_ENABLED and _env_bool("WHATSAPP_AI_INCOMING_ENABLED", False)
CLAUDE_API_KEY: str = os.getenv("CLAUDE_API_KEY", "").strip()
# Haiku 4.5 (economia); sobrescreva com CLAUDE_MODEL no .env se precisar de outro ID da Anthropic.
HAUKU_ECONOMY_MODEL: str = "claude-haiku-4-5-20251201"
CLAUDE_MODEL: str = (os.getenv("CLAUDE_MODEL", "").strip() or HAUKU_ECONOMY_MODEL)

# 2FA por e-mail no login de administradores. Só é aplicado se houver SMTP configurado (.env ou credencial `smtp` no painel com SMTP_ALLOW_DB_OVERRIDE).
LOGIN_ADMIN_TWO_FACTOR_ENABLED: bool = _env_bool("LOGIN_ADMIN_TWO_FACTOR_ENABLED", True)
# Lembrar dispositivo (cookie HTTP-only + tabela login_trusted_devices) após 2FA.
LOGIN_ADMIN_TRUST_DEVICE_ENABLED: bool = _env_bool("LOGIN_ADMIN_TRUST_DEVICE_ENABLED", True)

TRUST_DEVICE_DAYS: int = max(1, int(os.getenv("TRUST_DEVICE_DAYS", "60")))
TRUST_COOKIE_NAME: str = (os.getenv("TRUST_COOKIE_NAME", "climaris_tf_trust").strip() or "climaris_tf_trust")
_trust_domain_raw = os.getenv("TRUST_COOKIE_DOMAIN", "").strip()
TRUST_COOKIE_DOMAIN: str | None = _trust_domain_raw if _trust_domain_raw else None


def _trust_cookie_secure_default() -> bool:
    raw = os.getenv("TRUST_COOKIE_SECURE", "").strip().lower()
    if raw in ("0", "false", "no"):
        return False
    if raw in ("1", "true", "yes"):
        return True
    return APP_PUBLIC_URL.lower().startswith("https://")


TRUST_COOKIE_SECURE: bool = _trust_cookie_secure_default()
