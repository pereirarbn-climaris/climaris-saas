"""Leads do site institucional — POST /api/v1/leads."""

from fastapi.testclient import TestClient

from app.main import app


def test_create_website_lead_ok():
    client = TestClient(app)
    response = client.post(
        "/api/v1/leads",
        json={
            "name": "Maria Silva",
            "email": "maria@example.com",
            "phone": "(11) 99999-9999",
            "company": "Ar Condicionado Silva",
            "job_title": "Sócia",
            "technicians_count": "6-15",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["id"] >= 1
    assert "demonstração" in body["message"].lower()


def test_create_website_lead_honeypot_silent():
    client = TestClient(app)
    response = client.post(
        "/api/v1/leads",
        json={
            "name": "Bot Silva",
            "email": "bot@spam.com",
            "company": "Spam Co",
            "website_url": "http://spam.example",
        },
    )
    assert response.status_code == 201
    assert response.json()["id"] == 0


def test_create_website_lead_validation():
    client = TestClient(app)
    response = client.post(
        "/api/v1/leads",
        json={
            "name": "A",
            "email": "invalid",
            "message": "curto",
        },
    )
    assert response.status_code == 422
