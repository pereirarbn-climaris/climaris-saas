"""Testes de sincronização de saldos de contas financeiras."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.finance_account_balance_sync import sync_external_finance_account_balances
from models import FinanceGatewayProvider


def test_sync_external_balances_skips_when_no_mercadopago():
    db = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = None
    assert sync_external_finance_account_balances(db, tenant_id=1) == []


@patch("app.finance_account_balance_sync.sync_mercadopago_balance_snapshot")
def test_sync_external_balances_mercadopago_ok(mock_sync: MagicMock):
    db = MagicMock()
    row = MagicMock()
    row.mercadopago_access_token_encrypted = "enc"
    row.mercadopago_finance_bank_account_id = 7
    row.mercadopago_cached_balance = None

    def _apply(_db, gw):
        gw.mercadopago_cached_balance = 150.5

    mock_sync.side_effect = _apply
    db.execute.return_value.scalar_one_or_none.return_value = row

    results = sync_external_finance_account_balances(db, tenant_id=1)
    assert len(results) == 1
    assert results[0]["provider"] == "mercadopago"
    assert results[0]["account_id"] == 7
    assert results[0]["balance"] == 150.5
    assert results[0]["ok"] is True
    mock_sync.assert_called_once()
