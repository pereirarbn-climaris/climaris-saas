"""Testes leves do cliente Pagar.me Core v5 (Stone)."""

from __future__ import annotations

from datetime import date

import pytest

from app.stone_pagarme_client import (
    boleto_due_at_iso_from_entry_due,
    credit_card_charge_declined_message,
    customer_block_with_br_document,
    extract_boleto_from_order,
)


def test_boleto_due_at_uses_entry_due_when_future() -> None:
    today = date(2026, 5, 1)
    due = date(2026, 5, 20)
    assert boleto_due_at_iso_from_entry_due(entry_due=due, today=today) == "2026-05-20T23:59:59.000-03:00"


def test_boleto_due_at_extends_when_overdue() -> None:
    today = date(2026, 5, 14)
    due = date(2026, 5, 1)
    assert boleto_due_at_iso_from_entry_due(entry_due=due, today=today) == "2026-05-17T23:59:59.000-03:00"


def test_customer_block_cpf() -> None:
    ok, err, c = customer_block_with_br_document(
        customer_name="João",
        customer_email="j@exemplo.com",
        payer_document="123.456.789-09",
    )
    assert ok and err is None
    assert c["type"] == "individual"
    assert c["document"] == "12345678909"


def test_customer_block_cnpj() -> None:
    ok, err, c = customer_block_with_br_document(
        customer_name="ACME",
        customer_email="f@exemplo.com",
        payer_document="12.345.678/0001-90",
    )
    assert ok and err is None
    assert c["type"] == "company"
    assert c["document"] == "12345678000190"


def test_customer_block_invalid() -> None:
    ok, err, c = customer_block_with_br_document(
        customer_name="X",
        customer_email="x@exemplo.com",
        payer_document="123",
    )
    assert not ok
    assert c == {}


def test_extract_boleto_from_order() -> None:
    order = {
        "charges": [
            {
                "id": "ch_1",
                "payment_method": "boleto",
                "last_transaction": {
                    "pdf": "https://example.com/b.pdf",
                    "line": "34191.79001 23893.212345 67890.160000 1 98770000012345",
                    "barcode": "341919700001234567890160000",
                },
            }
        ]
    }
    cid, pdf, line, barcode = extract_boleto_from_order(order)
    assert cid == "ch_1"
    assert pdf == "https://example.com/b.pdf"
    assert "34191" in (line or "")
    assert barcode == "341919700001234567890160000"


def test_credit_card_declined_message() -> None:
    order = {
        "charges": [
            {
                "payment_method": "credit_card",
                "last_transaction": {"status": "refused", "acquirer_message": "Saldo insuficiente"},
            }
        ]
    }
    assert credit_card_charge_declined_message(order) == "Saldo insuficiente"


def test_credit_card_paid_not_declined() -> None:
    order = {
        "charges": [
            {
                "payment_method": "credit_card",
                "last_transaction": {"status": "captured"},
            }
        ]
    }
    assert credit_card_charge_declined_message(order) is None


@pytest.mark.parametrize(
    "status",
    ["pending", "waiting_payment", "processing", "paid", "authorized"],
)
def test_credit_card_non_terminal_ok(status: str) -> None:
    order = {"charges": [{"payment_method": "credit_card", "last_transaction": {"status": status}}]}
    assert credit_card_charge_declined_message(order) is None
