"""Helpers Stone / Pagar.me (token de URL do webhook)."""

from __future__ import annotations

import secrets

from models import TenantFinanceGateway


def ensure_stone_webhook_secrets(row: TenantFinanceGateway) -> str:
    if not row.stone_webhook_path_token or len(row.stone_webhook_path_token) < 12:
        row.stone_webhook_path_token = secrets.token_urlsafe(32)[:48]
    return row.stone_webhook_path_token
