"""Agendamento de demonstrações — slots públicos e criação."""

from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from app.demo_scheduling import DEMO_SLOT_HOURS, DEMO_TZ
from app.main import app

TZ = DEMO_TZ


def _next_business_slot() -> datetime:
    """Próximo horário válido (seg–sex, com antecedência mínima)."""
    now = datetime.now(TZ)
    cursor = now + timedelta(hours=25)
    while cursor.weekday() not in {0, 1, 2, 3, 4}:
        cursor += timedelta(days=1)
    cursor = cursor.replace(
        hour=DEMO_SLOT_HOURS[0],
        minute=0,
        second=0,
        microsecond=0,
    )
    if cursor <= now + timedelta(hours=24):
        cursor += timedelta(days=1)
        while cursor.weekday() not in {0, 1, 2, 3, 4}:
            cursor += timedelta(days=1)
        cursor = cursor.replace(hour=DEMO_SLOT_HOURS[0], minute=0, second=0, microsecond=0)
    return cursor


def test_public_demo_slots_ok():
    client = TestClient(app)
    response = client.get("/api/v1/public/demo-slots?days=7")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    if body:
        assert "starts_at" in body[0]
        assert "label" in body[0]


@patch("app.routers.demo_appointments.schedule_demo_appointment_notifications")
def test_create_demo_appointment_ok(mock_notify):
    client = TestClient(app)
    slot = _next_business_slot()
    response = client.post(
        "/api/v1/demo-appointments",
        json={
            "name": "João Demo",
            "email": "joao.demo@example.com",
            "phone": "(16) 98888-7777",
            "company": "Clima Teste Ltda",
            "job_title": "Gerente",
            "technicians_count": "6-15",
            "scheduled_at": slot.isoformat(),
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["id"] >= 1
    assert "whatsapp" in body["message"].lower()
    mock_notify.assert_called_once_with(body["id"])


def test_create_demo_appointment_conflict():
    client = TestClient(app)
    slot = _next_business_slot()
    payload = {
        "name": "Maria Demo",
        "email": "maria.demo@example.com",
        "phone": "(16) 97777-6666",
        "company": "Empresa B",
        "scheduled_at": slot.isoformat(),
    }
    first = client.post("/api/v1/demo-appointments", json=payload)
    assert first.status_code == 201
    second = client.post(
        "/api/v1/demo-appointments",
        json={**payload, "name": "Outro Cliente", "email": "outro@example.com"},
    )
    assert second.status_code == 409


def test_create_demo_appointment_honeypot():
    client = TestClient(app)
    slot = _next_business_slot()
    response = client.post(
        "/api/v1/demo-appointments",
        json={
            "name": "Bot",
            "email": "bot@spam.com",
            "scheduled_at": slot.isoformat(),
            "website_url": "http://spam.example",
        },
    )
    assert response.status_code == 201
    assert response.json()["id"] == 0
