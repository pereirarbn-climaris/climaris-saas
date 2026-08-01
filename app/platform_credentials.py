"""Resolução de credenciais da plataforma para integrações externas."""

from __future__ import annotations

import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.security import decrypt_platform_secret
from models import PlatformApiCredential

CNPJA_PROVIDER_SLUG = "cnpja"
CLAUDE_PROVIDER_SLUG = "claude"
OPENAI_PROVIDER_SLUG = "openai"
GOOGLE_OAUTH_PROVIDER_SLUG = "google-oauth"
WHATSAPP_OFFICIAL_PROVIDER_SLUG = "whatsapp-official"

# Slug salvo incorretamente no painel (data 20251201 não existe na Anthropic).
_CLAUDE_MODEL_ALIASES: dict[str, str] = {
    "claude-haiku-4-5-20251201": "claude-haiku-4-5-20251001",
}


def _decrypt_credential_secret(row: PlatformApiCredential | None) -> str | None:
    if row is None or not row.api_key_secret:
        return None
    try:
        return decrypt_platform_secret(row.api_key_secret).strip() or None
    except Exception:
        return None


def resolve_cnpja_api_key(db: Session | None = None) -> str | None:
    """CNPJA_API_KEY no ambiente tem prioridade; senão usa credencial `cnpja` da plataforma."""
    env_key = os.getenv("CNPJA_API_KEY", "").strip()
    if env_key:
        return env_key
    if db is None:
        return None
    row = db.execute(
        select(PlatformApiCredential).where(PlatformApiCredential.provider_slug == CNPJA_PROVIDER_SLUG)
    ).scalar_one_or_none()
    return _decrypt_credential_secret(row)


def resolve_claude_api_key(db: Session | None = None) -> str | None:
    """CLAUDE_API_KEY no ambiente tem prioridade; senão usa credencial `claude` da plataforma."""
    env_key = os.getenv("CLAUDE_API_KEY", "").strip()
    if env_key:
        return env_key
    if db is None:
        return None
    row = db.execute(
        select(PlatformApiCredential).where(PlatformApiCredential.provider_slug == CLAUDE_PROVIDER_SLUG)
    ).scalar_one_or_none()
    return _decrypt_credential_secret(row)


def resolve_openai_api_key(db: Session | None = None) -> str | None:
    """OPENAI_API_KEY no ambiente tem prioridade; senão usa credencial `openai` da plataforma."""
    env_key = os.getenv("OPENAI_API_KEY", "").strip()
    if env_key:
        return env_key
    if db is None:
        return None
    row = db.execute(
        select(PlatformApiCredential).where(PlatformApiCredential.provider_slug == OPENAI_PROVIDER_SLUG)
    ).scalar_one_or_none()
    return _decrypt_credential_secret(row)


def resolve_claude_model(db: Session | None = None) -> str:
    """Modelo Claude: extra_config.model na credencial da plataforma, senão CLAUDE_MODEL do .env."""
    from app.config import CLAUDE_MODEL

    if db is not None:
        row = db.execute(
            select(PlatformApiCredential).where(PlatformApiCredential.provider_slug == CLAUDE_PROVIDER_SLUG)
        ).scalar_one_or_none()
        if row and row.extra_config_json:
            try:
                import json

                parsed = json.loads(row.extra_config_json)
                if isinstance(parsed, dict):
                    raw_model = parsed.get("model")
                    if isinstance(raw_model, str) and raw_model.strip():
                        return _CLAUDE_MODEL_ALIASES.get(raw_model.strip(), raw_model.strip())
            except Exception:
                pass
    return CLAUDE_MODEL


def resolve_google_client_id(db: Session | None = None) -> str | None:
    """GOOGLE_CLIENT_ID no ambiente tem prioridade; senão usa credencial `google-oauth` da plataforma."""
    env_client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if env_client_id:
        return env_client_id
    if db is None:
        return None
    row = db.execute(
        select(PlatformApiCredential).where(PlatformApiCredential.provider_slug == GOOGLE_OAUTH_PROVIDER_SLUG)
    ).scalar_one_or_none()
    if row is None or not row.extra_config_json:
        return None
    try:
        import json

        payload = json.loads(row.extra_config_json)
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    client_id = payload.get("client_id")
    if isinstance(client_id, str) and client_id.strip():
        return client_id.strip()
    return None


def resolve_whatsapp_official_config(db: Session | None = None) -> dict[str, str | None]:
    """Credenciais da API oficial do WhatsApp com fallback no ambiente."""
    env_token = os.getenv("WHATSAPP_OFFICIAL_ACCESS_TOKEN", "").strip() or None
    env_phone_id = os.getenv("WHATSAPP_OFFICIAL_PHONE_NUMBER_ID", "").strip() or None
    env_version = os.getenv("WHATSAPP_OFFICIAL_API_VERSION", "").strip() or None

    if db is None:
        return {
            "access_token": env_token,
            "phone_number_id": env_phone_id,
            "api_version": env_version,
        }

    row = db.execute(
        select(PlatformApiCredential).where(PlatformApiCredential.provider_slug == WHATSAPP_OFFICIAL_PROVIDER_SLUG)
    ).scalar_one_or_none()
    token = env_token or _decrypt_credential_secret(row)

    phone_number_id: str | None = env_phone_id
    api_version: str | None = env_version
    if row is not None and row.extra_config_json:
        try:
            import json

            payload = json.loads(row.extra_config_json)
        except Exception:
            payload = None
        if isinstance(payload, dict):
            if phone_number_id is None:
                raw_phone_id = payload.get("phone_number_id")
                if isinstance(raw_phone_id, str) and raw_phone_id.strip():
                    phone_number_id = raw_phone_id.strip()
            if api_version is None:
                raw_version = payload.get("api_version")
                if isinstance(raw_version, str) and raw_version.strip():
                    api_version = raw_version.strip()
    return {
        "access_token": token,
        "phone_number_id": phone_number_id,
        "api_version": api_version,
    }
