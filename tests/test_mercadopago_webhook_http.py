"""Contrato HTTP do webhook Mercado Pago (fluxo ponta-a-ponta na camada API, sem browser)."""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

MP_WEBHOOK_PREFIX = "/api/v1/webhooks/mercadopago"


@patch("app.routers.webhooks_mercadopago.process_mercadopago_webhook_payload")
@patch("app.routers.webhooks_mercadopago.resolve_mercadopago_gateway_by_path_token")
def test_mp_webhook_payment_notification_ok(mock_resolve, mock_process):
    row = MagicMock()
    row.tenant_id = 1
    row.mercadopago_sandbox = False
    row.mercadopago_webhook_signature_secret_encrypted = None
    mock_resolve.return_value = row
    mock_process.return_value = {"received": True, "matched": True, "entry_id": 42}

    client = TestClient(app)
    body = {"type": "payment", "data": {"id": "123456789"}}
    res = client.post(f"{MP_WEBHOOK_PREFIX}/path-token-at-least-8-chars", json=body)

    assert res.status_code == 200
    assert res.json().get("received") is True
    mock_process.assert_called_once()


@patch("app.routers.webhooks_mercadopago.resolve_mercadopago_gateway_by_path_token")
def test_mp_webhook_unknown_path_token_404(mock_resolve):
    mock_resolve.return_value = None
    client = TestClient(app)
    res = client.post(
        f"{MP_WEBHOOK_PREFIX}/path-token-at-least-8-chars",
        json={"type": "payment", "data": {"id": "1"}},
    )
    assert res.status_code == 404


@patch("app.routers.webhooks_mercadopago.resolve_mercadopago_gateway_by_path_token")
def test_mp_webhook_invalid_json_400(mock_resolve):
    row = MagicMock()
    row.tenant_id = 1
    row.mercadopago_sandbox = False
    row.mercadopago_webhook_signature_secret_encrypted = None
    mock_resolve.return_value = row

    client = TestClient(app)
    res = client.post(
        f"{MP_WEBHOOK_PREFIX}/path-token-at-least-8-chars",
        content=b"not-json",
        headers={"Content-Type": "application/json"},
    )
    assert res.status_code == 400
