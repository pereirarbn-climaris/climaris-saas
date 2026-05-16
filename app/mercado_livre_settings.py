"""Variáveis de ambiente Mercado Livre (marketplace). Centraliza leitura para webhook, API e workers."""

from __future__ import annotations

import os


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def mercado_livre_notifications_shared_secret() -> str:
    return os.getenv("MERCADO_LIVRE_NOTIFICATIONS_SHARED_SECRET", "").strip()


def mercado_livre_webhook_apply_stock() -> bool:
    """Se true, pedido pago (ex. ``orders_v2``) pode aplicar baixa de estoque no ERP."""
    return _env_bool("MERCADO_LIVRE_WEBHOOK_APPLY_STOCK", False)


def mercado_livre_auto_push_stock_on_product_save() -> bool:
    """Se true (quando implementado), após salvar produto com vínculo ML, enviar qty/preço ao ML."""
    return _env_bool("MERCADO_LIVRE_AUTO_PUSH_STOCK_ON_PRODUCT_SAVE", False)
