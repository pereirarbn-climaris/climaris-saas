"""GET /api/v1/public/website/pages/{slug}"""

from fastapi.testclient import TestClient

from app.main import app


def test_public_gestao_empresarial_page():
    client = TestClient(app)
    response = client.get("/api/v1/public/website/pages/gestao-empresarial")
    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == "gestao-empresarial"
    assert body["title"]
    assert len(body["sections"]) >= 1
    assert len(body["outcomes"]) >= 1


def test_public_agenda_comercial_page():
    client = TestClient(app)
    response = client.get("/api/v1/public/website/pages/agenda-comercial")
    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == "agenda-comercial"
    assert body["title"] == "Agenda Comercial"
    assert any(s["key"] == "calendar" for s in body["sections"])
