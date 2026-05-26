from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from app.config import public_app_base_url
from app.pmoc_public_validation import (
    build_public_pmoc_validation_url,
    generate_pmoc_validation_qr_png,
)


def test_build_public_pmoc_validation_url_uses_production_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.config.APP_PUBLIC_URL", "http://127.0.0.1:5173")
    assert public_app_base_url() == "https://app.climaris.com.br"
    assert build_public_pmoc_validation_url(99) == "https://app.climaris.com.br/public/pmoc-validation/99"


def test_build_public_pmoc_validation_url_uses_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.config.APP_PUBLIC_URL", "https://staging.climaris.com.br")
    assert build_public_pmoc_validation_url(7) == "https://staging.climaris.com.br/public/pmoc-validation/7"


def test_generate_pmoc_validation_qr_png_returns_png() -> None:
    blob = generate_pmoc_validation_qr_png("https://app.climaris.com.br/public/pmoc-validation/1")
    assert blob[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(blob) > 200


def test_build_pmoc_report_pdf_includes_qr_smoke() -> None:
    import json
    from types import SimpleNamespace

    from app.pmoc_pdf import build_pmoc_report_pdf
    from models import PmocActivityFrequency, PmocPlanEquipment

    plan = SimpleNamespace(
        id=99,
        title="PMOC QR",
        version_label="1.0",
        establishment_snapshot_json=json.dumps({}),
        law_reference_note="Lei 13.589/2018",
        total_btu_sum=0,
        air_analysis_required=False,
        responsible_name="Eng. Teste",
        responsible_council="CREA",
        responsible_registration="1",
        art_number="123",
        art_issued_at=date(2026, 1, 1),
        art_file_url=None,
    )
    tenant = SimpleNamespace(name="Climaris", pdf_primary_color="#006FEE", logo_url=None)
    client = SimpleNamespace(
        name="Cliente",
        document="",
        address_street="Rua",
        address_number="1",
        address_district="Centro",
        address_city="SP",
        address_state="SP",
        address_postal_code="01000000",
        trade_name=None,
    )
    eq = SimpleNamespace(
        capacidade_btu=9000,
        identificacao="Split",
        modelo="X",
        local_instalacao="Sala",
        installation_reference=None,
    )
    activity = SimpleNamespace(title="Limpeza", frequency=PmocActivityFrequency.MONTHLY)
    pdf = build_pmoc_report_pdf(plan, tenant, client, [(PmocPlanEquipment(equipment_id=1), eq)], [activity], [])
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 2000
