"""Validação de cadastro completo PMOC."""

from app.pmoc_service import build_pmoc_create_validation_issues


def test_build_pmoc_create_validation_issues_all_missing():
    issues = build_pmoc_create_validation_issues(
        client_id=0,
        client_site_id=0,
        equipment_ids=[],
        responsible_name=None,
    )
    codes = {item["code"] for item in issues}
    assert "missing_client" in codes
    assert "missing_site" in codes
    assert "missing_equipment" in codes
    assert "missing_rt" in codes


def test_build_pmoc_create_validation_issues_ok():
    issues = build_pmoc_create_validation_issues(
        client_id=1,
        client_site_id=2,
        equipment_ids=[10],
        responsible_name="Eng. João Silva",
    )
    assert issues == []
