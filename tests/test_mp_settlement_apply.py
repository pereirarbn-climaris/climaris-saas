"""Liquidação MP: arquivar preferência ao aprovar; estorno (chargeback/refunded); preapproval e auditoria."""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.finance_mercadopago_webhook import _apply_payment_settlement, _find_entry
from models import FinanceEntryStatus, FinanceEntryType


def _entry(**kwargs):
    e = MagicMock()
    e.id = kwargs.get("id", 1)
    e.status = kwargs.get("status", FinanceEntryStatus.PENDING)
    e.gateway_payment_id = kwargs.get("gateway_payment_id")
    e.gateway_preference_id = kwargs.get("gateway_preference_id")
    e.mercadopago_archived_preference_id = kwargs.get("mercadopago_archived_preference_id")
    e.mercadopago_preapproval_id = kwargs.get("mercadopago_preapproval_id")
    e.mp_reversal_at = kwargs.get("mp_reversal_at")
    e.mp_reversal_status = kwargs.get("mp_reversal_status")
    e.paid_at = kwargs.get("paid_at")
    e.entry_type = FinanceEntryType.INCOME
    return e


@patch("app.finance_mercadopago_webhook.sync_mercadopago_balance_snapshot")
@patch("app.finance_mercadopago_webhook._find_entry")
def test_approved_archives_preference(mock_find, _mock_sync):
    e = _entry(gateway_preference_id="pref-abc-1")
    mock_find.return_value = e
    row = MagicMock()
    row.tenant_id = 1
    row.mercadopago_mp_user_id = None
    payment = {"id": "999", "status": "approved", "external_reference": "climaris_mp_fin_1"}
    db = MagicMock()
    _apply_payment_settlement(db, row, payment, commit=False)
    assert e.status == FinanceEntryStatus.PAID
    assert e.mercadopago_archived_preference_id == "pref-abc-1"
    assert e.gateway_preference_id is None
    assert e.gateway_payment_id == "999"


@patch("app.finance_mercadopago_webhook.sync_mercadopago_balance_snapshot")
@patch("app.finance_mercadopago_webhook._find_entry")
def test_approved_sets_preapproval_from_payment_and_metadata(mock_find, _mock_sync):
    e = _entry(gateway_preference_id="pref-x")
    mock_find.return_value = e
    row = MagicMock()
    row.tenant_id = 1
    row.mercadopago_mp_user_id = None
    payment = {
        "id": "1001",
        "status": "approved",
        "preapproval_id": "preapp-xyz",
        "metadata": {"preapproval_id": "preapp-from-meta"},
    }
    db = MagicMock()
    _apply_payment_settlement(db, row, payment, commit=False)
    assert e.mercadopago_preapproval_id == "preapp-xyz"


@patch("app.finance_mercadopago_webhook.sync_mercadopago_balance_snapshot")
@patch("app.finance_mercadopago_webhook._find_entry")
def test_approved_clears_reversal_audit(mock_find, _mock_sync):
    past = datetime(2024, 1, 2, 12, 0, 0, tzinfo=timezone.utc)
    e = _entry(
        status=FinanceEntryStatus.OVERDUE,
        gateway_preference_id=None,
        mp_reversal_at=past,
        mp_reversal_status="charged_back",
    )
    mock_find.return_value = e
    row = MagicMock()
    row.tenant_id = 1
    row.mercadopago_mp_user_id = None
    payment = {"id": "2002", "status": "approved", "external_reference": "climaris_mp_fin_1"}
    db = MagicMock()
    _apply_payment_settlement(db, row, payment, commit=False)
    assert e.status == FinanceEntryStatus.PAID
    assert e.mp_reversal_at is None
    assert e.mp_reversal_status is None


@patch("app.finance_mercadopago_webhook.sync_mercadopago_balance_snapshot")
@patch("app.finance_mercadopago_webhook._find_entry")
def test_chargeback_reverts_paid_and_audits(mock_find, _mock_sync):
    e = _entry(status=FinanceEntryStatus.PAID, gateway_payment_id="999", paid_at=datetime.now(timezone.utc))
    mock_find.return_value = e
    row = MagicMock()
    row.tenant_id = 1
    row.mercadopago_mp_user_id = None
    payment = {"id": "999", "status": "charged_back"}
    db = MagicMock()
    _apply_payment_settlement(db, row, payment, commit=False)
    assert e.status == FinanceEntryStatus.OVERDUE
    assert e.paid_at is None
    assert e.mp_reversal_status == "charged_back"
    assert e.mp_reversal_at is not None


@patch("app.finance_mercadopago_webhook.sync_mercadopago_balance_snapshot")
@patch("app.finance_mercadopago_webhook._find_entry")
def test_reverted_reverts_paid_and_audits(mock_find, _mock_sync):
    e = _entry(status=FinanceEntryStatus.PAID, gateway_payment_id="999")
    mock_find.return_value = e
    row = MagicMock()
    row.mercadopago_mp_user_id = None
    payment = {"id": "999", "status": "reverted"}
    db = MagicMock()
    _apply_payment_settlement(db, row, payment, commit=False)
    assert e.status == FinanceEntryStatus.OVERDUE
    assert e.mp_reversal_status == "reverted"


@patch("app.finance_mercadopago_webhook.sync_mercadopago_balance_snapshot")
@patch("app.finance_mercadopago_webhook._find_entry")
def test_refunded_paid_reverts_and_audits(mock_find, _mock_sync):
    e = _entry(status=FinanceEntryStatus.PAID, gateway_payment_id="999")
    mock_find.return_value = e
    row = MagicMock()
    row.mercadopago_mp_user_id = None
    payment = {"id": "999", "status": "refunded"}
    db = MagicMock()
    _apply_payment_settlement(db, row, payment, commit=False)
    assert e.status == FinanceEntryStatus.OVERDUE
    assert e.mp_reversal_status == "refunded"
    assert e.mp_reversal_at is not None


@patch("app.finance_mercadopago_webhook.sync_mercadopago_balance_snapshot")
@patch("app.finance_mercadopago_webhook._find_entry")
def test_refunded_pending_cancels(mock_find, _mock_sync):
    e = _entry(status=FinanceEntryStatus.PENDING)
    mock_find.return_value = e
    row = MagicMock()
    row.mercadopago_mp_user_id = None
    payment = {"id": "111", "status": "refunded"}
    db = MagicMock()
    _apply_payment_settlement(db, row, payment, commit=False)
    assert e.status == FinanceEntryStatus.CANCELLED


def test_find_entry_matches_preapproval_id():
    """Cobrança recorrente sem preference ativa casa por mercadopago_preapproval_id."""
    entry = MagicMock()
    entry.id = 42
    db = MagicMock()
    none_r = MagicMock()
    none_r.scalar_one_or_none.return_value = None
    hit_r = MagicMock()
    hit_r.scalar_one_or_none.return_value = entry
    db.execute.side_effect = [none_r, hit_r]
    payment = {"id": "777", "status": "approved", "preapproval_id": "preapp-rec-1"}
    assert _find_entry(db, 1, payment) is entry


@patch("app.finance_mercadopago_webhook.sync_mercadopago_balance_snapshot")
@patch("app.finance_mercadopago_webhook._find_entry")
def test_in_mediation_on_paid_sets_audit(mock_find, _mock_sync):
    e = _entry(status=FinanceEntryStatus.PAID, gateway_payment_id="999")
    mock_find.return_value = e
    row = MagicMock()
    row.mercadopago_mp_user_id = None
    payment = {"id": "999", "status": "in_mediation"}
    db = MagicMock()
    _apply_payment_settlement(db, row, payment, commit=False)
    assert e.status == FinanceEntryStatus.PAID
    assert e.mp_reversal_status == "in_mediation"
    assert e.mp_reversal_at is not None


@patch("app.finance_mercadopago_webhook.sync_mercadopago_balance_snapshot")
@patch("app.finance_mercadopago_webhook._find_entry")
def test_partially_refunded_on_paid_keeps_paid_and_audits(mock_find, _mock_sync):
    e = _entry(status=FinanceEntryStatus.PAID, gateway_payment_id="999")
    mock_find.return_value = e
    row = MagicMock()
    row.mercadopago_mp_user_id = None
    payment = {"id": "999", "status": "partially_refunded"}
    db = MagicMock()
    _apply_payment_settlement(db, row, payment, commit=False)
    assert e.status == FinanceEntryStatus.PAID
    assert e.mp_reversal_status == "partially_refunded"
    assert e.mp_reversal_at is not None
