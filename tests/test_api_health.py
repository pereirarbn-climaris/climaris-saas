"""Smoke: app responde em /health (TestClient)."""

from fastapi.testclient import TestClient

from app.main import app


def test_health_ok():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "ok"
    assert "api_public_base_url_configured" not in body


def test_health_extended_includes_deploy_flags():
    client = TestClient(app)
    response = client.get("/health", params={"extended": "true"})
    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "ok"
    assert "public_register_enabled" in body
    assert "api_public_base_url_configured" in body
    assert "mercadopago_webhook_signature_required" in body
    assert isinstance(body["api_public_base_url_configured"], bool)
    assert isinstance(body["mercadopago_webhook_signature_required"], bool)
