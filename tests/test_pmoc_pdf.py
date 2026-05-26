from __future__ import annotations

import base64
import json
from types import SimpleNamespace

from datetime import date

from app.pmoc_pdf import (
    PMOC_LEGAL_COMPLIANCE,
    _collect_latest_signature,
    _collect_photo_evidence,
    _format_btu,
    _normalize_legal_text,
    _parse_field_inspection,
    air_analysis_required_for_btu,
    build_pmoc_report_pdf,
    format_establishment_address,
    format_rt_signature_lines,
    frequency_label_pt,
    sum_equipment_btu_from_links,
)
from models import PmocActivityFrequency, PmocExecution, PmocPlanEquipment


def _execution_with_notes(payload: dict) -> PmocExecution:
    row = PmocExecution()
    row.notes = json.dumps(payload, ensure_ascii=False)
    return row


def _equipment(btu: int | None) -> SimpleNamespace:
    return SimpleNamespace(
        capacidade_btu=btu,
        identificacao="Split",
        modelo="X",
        local_instalacao="Sala",
        installation_reference=None,
    )


def _client(**fields: str) -> SimpleNamespace:
    defaults = {
        "name": "Cliente Teste LTDA",
        "document": "12.345.678/0001-99",
        "address_street": "Rua das Flores",
        "address_number": "100",
        "address_district": "Centro",
        "address_city": "São Paulo",
        "address_state": "SP",
        "address_postal_code": "01310100",
    }
    defaults.update(fields)
    return SimpleNamespace(**defaults)


def test_normalize_legal_text_replaces_anvisa_re09() -> None:
    text = "Conforme RE 09 da ANVISA e Lei 13.589/2018."
    out = _normalize_legal_text(text)
    assert "RE 09" not in out
    assert "17.037" in out


def test_parse_field_inspection_from_notes() -> None:
    notes = json.dumps({"type": "field_inspection", "checklist": [], "signatureBase64": None})
    parsed = _parse_field_inspection(notes)
    assert parsed is not None
    assert parsed["type"] == "field_inspection"


def test_collect_photo_evidence_and_signature() -> None:
    tiny_png = base64.b64encode(
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xdb\x00\x00\x00\x00IEND\xaeB`\x82"
    ).decode()
    data_url = f"data:image/png;base64,{tiny_png}"
    payload = {
        "type": "field_inspection",
        "generalNotes": "Tudo ok",
        "checklist": [
            {"id": "1", "title": "Filtro de Ar", "status": "ok", "photoReference": data_url},
        ],
        "signatureBase64": data_url,
    }
    executions = [_execution_with_notes(payload)]
    photos = _collect_photo_evidence(executions)
    assert len(photos) == 1
    assert "Filtro de Ar" in photos[0].caption
    assert "OK" in photos[0].caption
    sig = _collect_latest_signature(executions)
    assert sig is not None


def test_legal_compliance_header_contains_nbr() -> None:
    assert "13.589/2018" in PMOC_LEGAL_COMPLIANCE
    assert "17.037:2023" in PMOC_LEGAL_COMPLIANCE


def test_sum_equipment_btu_from_links() -> None:
    links = [
        (PmocPlanEquipment(equipment_id=1), _equipment(9000)),
        (PmocPlanEquipment(equipment_id=2), _equipment(9000)),
        (PmocPlanEquipment(equipment_id=3), _equipment(12000)),
        (PmocPlanEquipment(equipment_id=4), _equipment(30000)),
    ]
    assert sum_equipment_btu_from_links(links) == 60_000
    assert _format_btu(60_000) == "60.000 BTUs"


def test_air_analysis_required_at_threshold() -> None:
    assert air_analysis_required_for_btu(59_999) is False
    assert air_analysis_required_for_btu(60_000) is True
    assert air_analysis_required_for_btu(120_000) is True


def test_frequency_label_pt() -> None:
    assert frequency_label_pt(PmocActivityFrequency.MONTHLY) == "Mensal"
    assert frequency_label_pt(PmocActivityFrequency.QUARTERLY) == "Trimestral"
    assert frequency_label_pt(PmocActivityFrequency.SEMIANNUAL) == "Semestral"
    assert frequency_label_pt(PmocActivityFrequency.ANNUAL) == "Anual"
    assert frequency_label_pt("monthly") == "Mensal"


def test_format_establishment_address_full() -> None:
    snap = {
        "address_street": "Av. Paulista",
        "address_number": "1000",
        "address_district": "Bela Vista",
        "address_city": "São Paulo",
        "address_state": "SP",
        "address_postal_code": "01310100",
    }
    client = _client()
    out = format_establishment_address(snap, client)
    assert out == "Av. Paulista, 1000 - Bela Vista - São Paulo/SP - CEP: 01310-100"


def test_format_rt_signature_lines_with_official_data() -> None:
    from app.pmoc_pdf import RT_PENDING_LABEL

    plan = SimpleNamespace(
        responsible_name="Eng. João Silva",
        responsible_council="CREA-SP",
        responsible_registration="123456/D",
        art_number="2026001234",
        art_issued_at=date(2026, 3, 15),
        art_file_url="https://example.com/art.pdf",
    )
    lines = format_rt_signature_lines(plan)
    assert any("Eng. João Silva" in line for line in lines)
    assert any("ART nº 2026001234" in line for line in lines)
    assert any("PDF" in line for line in lines)
    assert RT_PENDING_LABEL not in " ".join(lines)


def test_format_rt_signature_lines_pending_when_empty() -> None:
    from app.pmoc_pdf import RT_PENDING_LABEL

    plan = SimpleNamespace(
        responsible_name=None,
        responsible_council=None,
        responsible_registration=None,
        art_number=None,
        art_issued_at=None,
        art_file_url=None,
    )
    lines = format_rt_signature_lines(plan)
    assert all(RT_PENDING_LABEL in line for line in lines)


def test_build_pmoc_report_pdf_smoke() -> None:
    plan = SimpleNamespace(
        id=42,
        title="PMOC Teste",
        version_label="1.0",
        establishment_snapshot_json=json.dumps(
            {
                "address_street": "Av. Paulista",
                "address_number": "1000",
                "address_district": "Bela Vista",
                "address_city": "São Paulo",
                "address_state": "SP",
                "address_postal_code": "01310100",
            }
        ),
        law_reference_note="Lei 13.589/2018",
        total_btu_sum=0,
        air_analysis_required=False,
        responsible_name=None,
        responsible_council=None,
        responsible_registration=None,
        art_number=None,
        art_issued_at=None,
        art_file_url=None,
    )
    tenant = SimpleNamespace(name="Climaris Demo", pdf_primary_color="#006FEE", logo_url=None)
    client = _client()
    equipments = [
        (PmocPlanEquipment(equipment_id=1), _equipment(9000)),
        (PmocPlanEquipment(equipment_id=2), _equipment(9000)),
        (PmocPlanEquipment(equipment_id=3), _equipment(12000)),
        (PmocPlanEquipment(equipment_id=4), _equipment(30000)),
    ]
    activity = SimpleNamespace(title="Limpeza de filtros", frequency=PmocActivityFrequency.MONTHLY)

    pdf = build_pmoc_report_pdf(plan, tenant, client, equipments, [activity], [])
    assert isinstance(pdf, bytes)
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1500
