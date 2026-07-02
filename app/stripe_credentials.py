"""Resolução de credenciais Stripe da plataforma (env ou painel /operacao)."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.security import decrypt_platform_secret
from models import PlatformApiCredential

STRIPE_PROVIDER_SLUG = "stripe"


@dataclass(frozen=True)
class StripeCredentials:
    secret_key: str
    webhook_secret: str | None
    publishable_key: str | None


def _extra_config(row: PlatformApiCredential | None) -> dict:
    if row is None or not row.extra_config_json:
        return {}
    try:
        parsed = json.loads(row.extra_config_json)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def resolve_stripe_credentials(db: Session | None = None) -> StripeCredentials | None:
    """STRIPE_SECRET_KEY no ambiente tem prioridade; senão credencial `stripe` da plataforma."""
    env_secret = os.getenv("STRIPE_SECRET_KEY", "").strip()
    env_webhook = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip() or None
    env_publishable = os.getenv("STRIPE_PUBLISHABLE_KEY", "").strip() or None

    if env_secret:
        return StripeCredentials(
            secret_key=env_secret,
            webhook_secret=env_webhook,
            publishable_key=env_publishable,
        )

    if db is None:
        return None

    row = db.execute(
        select(PlatformApiCredential).where(PlatformApiCredential.provider_slug == STRIPE_PROVIDER_SLUG)
    ).scalar_one_or_none()
    if row is None or not row.api_key_secret:
        return None

    try:
        secret_key = decrypt_platform_secret(row.api_key_secret).strip()
    except Exception:
        return None
    if not secret_key:
        return None

    extra = _extra_config(row)
    webhook_secret = extra.get("webhook_secret")
    publishable_key = extra.get("publishable_key")
    return StripeCredentials(
        secret_key=secret_key,
        webhook_secret=webhook_secret.strip() if isinstance(webhook_secret, str) and webhook_secret.strip() else None,
        publishable_key=publishable_key.strip() if isinstance(publishable_key, str) and publishable_key.strip() else None,
    )


def stripe_configured(db: Session | None = None) -> bool:
    return resolve_stripe_credentials(db) is not None
