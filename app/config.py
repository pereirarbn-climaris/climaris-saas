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
    "capacitor://localhost",
    "ionic://localhost",
)


def _merged_cors_origins() -> list[str]:
    from_env = _cors_origins()
    out: list[str] = []
    seen: set[str] = set()
    for o in from_env + list(_DEFAULT_CAPACITOR_CORS_ORIGINS):
        if o not in seen:
            seen.add(o)
            out.append(o)
    return out


# Cadastro inicial público (POST /api/v1/auth/register). Desligue em ambientes só bootstrap.
PUBLIC_REGISTER_ENABLED: bool = _env_bool("PUBLIC_REGISTER_ENABLED", True)

# CORS: env (ex. dev) + app nativo Capacitor. Antes: só env; vazio = sem CORS (ok para SPA
# e API no mesmo host no browser, mas o APK precisa de origens acima.
CORS_ORIGINS: list[str] = _merged_cors_origins()

# Base pública usada em links de confirmação de e-mail (frontend).
APP_PUBLIC_URL: str = os.getenv("APP_PUBLIC_URL", "http://127.0.0.1:5173").strip().rstrip("/")

# URL pública da API (mesmo host que recebe /api/v1 em produção). Usada para registrar webhooks Asaas
# (POST …/api/v1/webhooks/asaas/{token}). Ex.: https://app.climaris.com.br
API_PUBLIC_BASE_URL: str = os.getenv("API_PUBLIC_BASE_URL", "").strip().rstrip("/")

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
EVOLUTION_WEBHOOK_TOKEN: str = os.getenv("EVOLUTION_WEBHOOK_TOKEN", "").strip()
WHATSAPP_WEBHOOK_ENABLED: bool = _env_bool("WHATSAPP_WEBHOOK_ENABLED", False)

# Mensagens interativas (botões) na Evolution podem variar por versão/provider.
# Deixe desativado para priorizar entrega estável por texto simples.
WHATSAPP_INTERACTIVE_BUTTONS_ENABLED: bool = _env_bool("WHATSAPP_INTERACTIVE_BUTTONS_ENABLED", False)
WHATSAPP_REMINDER_WORKER_ENABLED: bool = _env_bool("WHATSAPP_REMINDER_WORKER_ENABLED", True)
WHATSAPP_REMINDER_WORKER_INTERVAL_SECONDS: int = int(os.getenv("WHATSAPP_REMINDER_WORKER_INTERVAL_SECONDS", "60"))

# 2FA por e-mail no login de administradores. Só é aplicado se houver SMTP configurado (.env ou credencial `smtp` no painel com SMTP_ALLOW_DB_OVERRIDE).
LOGIN_ADMIN_TWO_FACTOR_ENABLED: bool = _env_bool("LOGIN_ADMIN_TWO_FACTOR_ENABLED", True)
