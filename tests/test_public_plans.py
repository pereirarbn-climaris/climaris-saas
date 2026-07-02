"""GET /api/v1/public/plans — catálogo para o site institucional."""

from fastapi.testclient import TestClient

from app.main import app


def test_list_public_plans_from_catalog():
    client = TestClient(app)
    response = client.get("/api/v1/public/plans")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    keys = {row["plan_key"] for row in body}
    assert "free_30d" in keys
    for row in body:
        assert "display_name" in row
        assert "monthly_price_brl" in row or row.get("is_free_trial")
        assert row["website_tier"] == row["display_name"]
