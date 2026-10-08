"""Helpers Mercado Pago (token de URL do webhook, sincronização de saldo)."""

from __future__ import annotations

import secrets

from sqlalchemy.orm import Session

from app.mercadopago_client import fetch_mercadopago_account_balance
from app.security import decrypt_platform_secret
from models import FinanceBankAccount, TenantFinanceGateway


def ensure_mercadopago_webhook_secrets(row: TenantFinanceGateway) -> str:
    if not row.mercadopago_webhook_path_token or len(row.mercadopago_webhook_path_token) < 12:
        row.mercadopago_webhook_path_token = secrets.token_urlsafe(32)[:48]
    return row.mercadopago_webhook_path_token


def sync_mercadopago_balance_snapshot(db: Session, row: TenantFinanceGateway) -> None:
    if not row.mercadopago_access_token_encrypted or not row.mercadopago_mp_user_id:
        return
    try:
        token = decrypt_platform_secret(row.mercadopago_access_token_encrypted)
    except Exception:
        return
    ok, _err, bal = fetch_mercadopago_account_balance(
        access_token=token, user_id=str(row.mercadopago_mp_user_id or "")
    )
    if not ok or bal is None:
        return
    row.mercadopago_cached_balance = bal
    db.add(row)
    acc_id = row.mercadopago_finance_bank_account_id
    if acc_id:
        acc = db.get(FinanceBankAccount, acc_id)
        if acc is not None and acc.tenant_id == row.tenant_id:
            acc.initial_balance = float(bal)
            db.add(acc)
