"""Sincronização de saldos de contas com gateways externos (melhor esforço)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.finance_mercadopago_service import sync_mercadopago_balance_snapshot
from models import FinanceGatewayProvider, TenantFinanceGateway


def sync_external_finance_account_balances(db: Session, tenant_id: int) -> list[dict[str, Any]]:
    """Atualiza saldos via APIs conectadas. Retorna um item por tentativa de sync."""
    results: list[dict[str, Any]] = []
    mp_row = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.MERCADOPAGO,
        )
    ).scalar_one_or_none()
    if mp_row is None or not mp_row.mercadopago_access_token_encrypted:
        return results
    acc_id = mp_row.mercadopago_finance_bank_account_id
    before = float(mp_row.mercadopago_cached_balance or 0) if mp_row.mercadopago_cached_balance is not None else None
    try:
        sync_mercadopago_balance_snapshot(db, mp_row)
        db.flush()
        after = float(mp_row.mercadopago_cached_balance) if mp_row.mercadopago_cached_balance is not None else None
        ok = after is not None or before is not None
        results.append(
            {
                "provider": "mercadopago",
                "account_id": acc_id,
                "balance": after,
                "ok": ok,
                "message": None if ok else "Não foi possível obter saldo no Mercado Pago.",
            }
        )
    except Exception as exc:
        results.append(
            {
                "provider": "mercadopago",
                "account_id": acc_id,
                "balance": None,
                "ok": False,
                "message": str(exc)[:240],
            }
        )
    return results
