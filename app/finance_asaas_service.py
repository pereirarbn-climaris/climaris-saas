"""Registro de webhook Asaas e segredos por tenant."""

from __future__ import annotations

import logging
import secrets
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from app.asaas_client import create_asaas_payment_webhook, delete_asaas_webhook
from app.config import public_api_base_url
from app.security import decrypt_platform_secret, encrypt_platform_secret

if TYPE_CHECKING:
    from models import TenantFinanceGateway

logger = logging.getLogger("erp.finance.asaas")


def ensure_asaas_webhook_secrets(row: "TenantFinanceGateway") -> tuple[str, str]:
    """Garante token de URL e authToken (header asaas-access-token). Retorna (path_token, auth_plain)."""
    if not row.asaas_webhook_path_token or len(row.asaas_webhook_path_token) < 12:
        row.asaas_webhook_path_token = secrets.token_urlsafe(32)[:48]
    if not row.asaas_webhook_auth_encrypted:
        plain = secrets.token_urlsafe(36)[:80]
        row.asaas_webhook_auth_encrypted = encrypt_platform_secret(plain)
    else:
        plain = decrypt_platform_secret(row.asaas_webhook_auth_encrypted)
    return row.asaas_webhook_path_token, plain


def register_asaas_webhook_after_save(
    db: Session,
    row: "TenantFinanceGateway",
    api_key_plain: str,
    sandbox: bool,
) -> None:
    """
    Cria (ou recria) o webhook no painel Asaas apontando para este servidor.
    Exige URL pública (API_PUBLIC_BASE_URL ou APP_PUBLIC_URL HTTPS não-local).
    """
    base = public_api_base_url()
    if not base:
        row.asaas_webhook_last_error = (
            "Defina API_PUBLIC_BASE_URL ou APP_PUBLIC_URL (HTTPS, ex.: https://app.exemplo.com.br) "
            "no servidor para registrar o webhook no mesmo host que expõe /api/v1."
        )
        return

    path_token, auth_plain = ensure_asaas_webhook_secrets(row)
    url = f"{base}/api/v1/webhooks/asaas/{path_token}"

    old_id = (row.asaas_webhook_remote_id or "").strip()
    if old_id:
        ok_del, err_del = delete_asaas_webhook(api_key=api_key_plain, sandbox=sandbox, webhook_id=old_id)
        if not ok_del:
            logger.warning("Asaas webhook delete falhou: %s", err_del)
        row.asaas_webhook_remote_id = None

    ok, err, wid = create_asaas_payment_webhook(
        api_key=api_key_plain,
        sandbox=sandbox,
        url=url,
        auth_token=auth_plain,
    )
    if ok and wid:
        row.asaas_webhook_remote_id = wid
        row.asaas_webhook_last_error = None
        logger.info("Webhook Asaas registrado id=%s tenant_id=%s", wid, row.tenant_id)
    else:
        row.asaas_webhook_last_error = (err or "Falha ao criar webhook no Asaas.")[:500]
        logger.warning("Webhook Asaas não criado tenant_id=%s: %s", row.tenant_id, row.asaas_webhook_last_error)

    db.add(row)


def delete_remote_asaas_webhook_if_any(row: "TenantFinanceGateway", api_key_plain: str, sandbox: bool) -> None:
    wid = (row.asaas_webhook_remote_id or "").strip()
    if not wid:
        return
    ok, err = delete_asaas_webhook(api_key=api_key_plain, sandbox=sandbox, webhook_id=wid)
    if not ok:
        logger.warning("Remoção webhook Asaas %s: %s", wid, err)
