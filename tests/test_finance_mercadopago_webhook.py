"""Testes leves para helpers do webhook Mercado Pago (financeiro)."""

from unittest.mock import MagicMock

from app.finance_mercadopago_webhook import _find_entry, _payment_preference_id_candidates
from app.mercadopago_client import mercadopago_preference_redirect_url


def test_payment_preference_id_candidates_top_level():
    assert _payment_preference_id_candidates({"preference_id": "pref-abc-123"}) == ["pref-abc-123"]


def test_payment_preference_id_candidates_metadata_variants():
    p = {
        "metadata": {
            "preference_id": "p1",
            "preferenceId": "p2",
            "checkout_preference_id": "p3",
        }
    }
    out = _payment_preference_id_candidates(p)
    assert out == ["p1", "p2", "p3"]


def test_payment_preference_id_candidates_truncates_long():
    long_id = "x" * 80
    out = _payment_preference_id_candidates({"preference_id": long_id})
    assert len(out[0]) == 48


def test_find_entry_by_preference_id():
    matched = object()
    res_match = MagicMock()
    res_match.scalar_one_or_none.return_value = matched
    res_miss = MagicMock()
    res_miss.scalar_one_or_none.return_value = None
    db = MagicMock()
    db.execute.side_effect = [res_miss, res_match]
    payment = {"id": "999001", "external_reference": "", "metadata": {}, "preference_id": "pref-demo-1"}
    assert _find_entry(db, 7, payment) is matched
    assert db.execute.call_count == 2


def test_mercadopago_preference_redirect_urls():
    u = mercadopago_preference_redirect_url("pref-demo-1", sandbox=False)
    assert u and "pref-demo-1" in u and "www.mercadopago.com.br" in u
    s = mercadopago_preference_redirect_url("pref-demo-1", sandbox=True)
    assert s and "sandbox.mercadopago" in s
