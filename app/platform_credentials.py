"""Resolução de credenciais da plataforma para integrações externas."""

from __future__ import annotations

import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.security import decrypt_platform_secret
from models import PlatformApiCredential

CNPJA_PROVIDER_SLUG = "cnpja"
CLAUDE_PROVIDER_SLUG = "claude"

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
