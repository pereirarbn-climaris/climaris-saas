"""Resolução de plan_key a partir de payloads Stripe (webhook vs API)."""

from unittest.mock import MagicMock

from app.stripe_billing import STRIPE_PLAN_METADATA_KEY, _plan_key_from_subscription


def test_plan_key_from_subscription_metadata():
    db = MagicMock()
    sub = {"metadata": {STRIPE_PLAN_METADATA_KEY: "basico"}, "items": {"data": []}}
    assert _plan_key_from_subscription(db, sub) == "basico"


def test_plan_key_from_subscription_price_as_string():
    db = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = "basico"
    sub = {
        "metadata": {},
        "items": {
            "data": [
                {"price": "price_abc123"},
            ]
        },
    }
    assert _plan_key_from_subscription(db, sub) == "basico"


def test_plan_key_from_subscription_price_as_object():
    db = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = "professional"
    sub = {
        "metadata": {},
        "items": {
            "data": [
                {"price": {"id": "price_xyz"}},
            ]
        },
    }
    assert _plan_key_from_subscription(db, sub) == "professional"
