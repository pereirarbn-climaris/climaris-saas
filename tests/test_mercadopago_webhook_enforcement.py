"""Regra MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE + webhook HTTP."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

import app.config as cfg
from app.main import app
from app.routers.finance import patch_finance_gateway_mercadopago_webhook_signature
from app.schemas import FinanceGatewayMercadoPagoWebhookSignatureUpdate

MP_WEBHOOK_PREFIX = "/api/v1/webhooks/mercadopago"


def test_mercadopago_webhook_signature_enforced_helper(monkeypatch):
    monkeypatch.setattr(cfg, "MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE", True)
    assert cfg.mercadopago_webhook_signature_enforced(gateway_sandbox=False) is True
    assert cfg.mercadopago_webhook_signature_enforced(gateway_sandbox=True) is False
    monkeypatch.setattr(cfg, "MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE", False)
    assert cfg.mercadopago_webhook_signature_enforced(gateway_sandbox=False) is False


@patch("app.routers.webhooks_mercadopago.resolve_mercadopago_gateway_by_path_token")
def test_mp_webhook_503_when_signature_required_but_not_configured(mock_resolve, monkeypatch):
    monkeypatch.setattr(cfg, "MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE", True)
    row = MagicMock()
    row.tenant_id = 1
    row.mercadopago_sandbox = False
    row.mercadopago_webhook_signature_secret_encrypted = None
    mock_resolve.return_value = row

    client = TestClient(app)
    res = client.post(f"{MP_WEBHOOK_PREFIX}/path-token-at-least-8-chars", json={"type": "payment", "data": {"id": "1"}})
    assert res.status_code == 503
    payload = res.json()
    msg = payload.get("detail") or (payload.get("error") or {}).get("message") or ""
    assert "assinatura" in str(msg).lower()


@patch("app.routers.webhooks_mercadopago.resolve_mercadopago_gateway_by_path_token")
def test_mp_webhook_sandbox_skips_global_signature_requirement(mock_resolve, monkeypatch):
    monkeypatch.setattr(cfg, "MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE", True)
    row = MagicMock()
    row.tenant_id = 1
    row.mercadopago_sandbox = True
    row.mercadopago_webhook_signature_secret_encrypted = None
    mock_resolve.return_value = row

    with patch("app.routers.webhooks_mercadopago.process_mercadopago_webhook_payload") as mock_process:
        mock_process.return_value = {"received": True}
        client = TestClient(app)
        res = client.post(f"{MP_WEBHOOK_PREFIX}/path-token-at-least-8-chars", json={"type": "payment", "data": {"id": "1"}})
        assert res.status_code == 200


@patch("app.routers.finance._effective_finance_mode", return_value=("management", "management", "management"))
@patch("app.routers.finance._get_tenant_or_404")
def test_patch_mp_webhook_clear_secret_400_when_signature_enforced(mock_get_tenant, _mock_eff, monkeypatch):
    """Com MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE e conta produção, não pode limpar o segredo via API."""
    monkeypatch.setattr(cfg, "MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE", True)
    tenant = MagicMock()
    tenant.finance_enabled = True
    mock_get_tenant.return_value = tenant

    mp_row = MagicMock()
    mp_row.mercadopago_access_token_encrypted = "enc-token"
    mp_row.mercadopago_sandbox = False
    mp_row.mercadopago_webhook_signature_secret_encrypted = b"blob"

    db = MagicMock()
    call_idx = {"n": 0}

    def exec_side_effect(*_a, **_kw):
        m = MagicMock()
        i = call_idx["n"]
        call_idx["n"] += 1
        m.scalar_one_or_none.return_value = mp_row if i == 0 else None
        return m

    db.execute.side_effect = exec_side_effect

    user = MagicMock()
    user.tenant_id = 1
    payload = FinanceGatewayMercadoPagoWebhookSignatureUpdate(clear_webhook_signature_secret=True)

    req = Request(
        {
            "type": "http",
            "method": "PATCH",
            "path": "/api/v1/finance/gateways/mercadopago/webhook-signature",
            "headers": [],
        }
    )
    with pytest.raises(HTTPException) as exc_info:
        patch_finance_gateway_mercadopago_webhook_signature(
            request=req,
            payload=payload,
            db=db,
            current_user=user,
        )
    assert exc_info.value.status_code == 400
    assert "remover" in (exc_info.value.detail or "").lower()
