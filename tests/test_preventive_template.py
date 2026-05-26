"""Testes de template preventivo com tags dinâmicas."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from app.preventive_maintenance import (
    DEFAULT_MESSAGE_TEMPLATE,
    _merge_equipment_and_historico_preventive_items,
    elapsed_preventive_interval_label,
    format_preventive_interval_label,
    group_preventive_items_by_client_and_due_month,
    render_preventive_grouped_message,
    render_preventive_message,
)


def test_format_preventive_interval_label_months():
    assert format_preventive_interval_label(months_display=6) == "6 meses"
    assert format_preventive_interval_label(interval_value=1, interval_type="months") == "1 mês"


def test_render_preventive_message_replaces_new_tags():
    tenant = SimpleNamespace(
        preventive_message_template=(
            "Olá, {cliente}! Faz {intervalo} desde {equipamento} ({marca_modelo})."
        ),
        preventive_technical_problem_hint=None,
    )
    text = render_preventive_message(
        tenant=tenant,
        client_name="Acabamentos Teto Novo",
        service_name="Higienização",
        months_display=3,
        equipment_name="Entrada inferior",
        brand_model="Ecobrisa MV60",
    )
    assert "Acabamentos Teto Novo" in text
    assert "Entrada inferior" in text
    assert "Ecobrisa MV60" in text
    assert "3 meses" in text


def test_elapsed_preventive_interval_label_recent():
    from datetime import date

    today = date(2026, 5, 20)
    assert elapsed_preventive_interval_label(last=date(2026, 5, 20), today=today) == "menos de 1 mês"
    assert elapsed_preventive_interval_label(last=date(2026, 4, 20), today=today) == "30 dias"


def test_render_preventive_message_avoids_duplicate_service_in_parens():
    tenant = SimpleNamespace(preventive_message_template=None, preventive_technical_problem_hint=None)
    text = render_preventive_message(
        tenant=tenant,
        client_name="João",
        service_name="Limpeza hi-wall",
        months_display=12,
        equipment_name="Limpeza hi-wall",
        brand_model=None,
        intervalo_label="12 meses",
    )
    assert "Limpeza hi-wall (Limpeza hi-wall)" not in text
    assert "Limpeza hi-wall" in text


def test_render_preventive_message_uses_default_when_empty():
    tenant = SimpleNamespace(preventive_message_template=None, preventive_technical_problem_hint=None)
    text = render_preventive_message(
        tenant=tenant,
        client_name="João",
        service_name="Limpeza",
        months_display=2,
        equipment_name="Split Sala",
        brand_model="Carrier 12k",
    )
    assert "{cliente}" not in text
    assert DEFAULT_MESSAGE_TEMPLATE.split("{")[0][:10] in text


def test_preventive_message_equipment_label_category_before_product():
    from app.preventive_maintenance import _preventive_message_equipment_label

    item = {
        "equipment_identificacao": "Sala · Elgin HJFI09C2WC + HJFE09C2CC · Sala",
        "equipment_tipo": "AR_CONDICIONADO",
        "equipment_fabricante": "Elgin",
        "equipment_modelo_evaporadora": "HJFI09C2WC",
        "equipment_modelo_condensadora": "HJFE09C2CC",
        "equipment_local": "Sala",
        "service_name": "Preventiva",
    }
    assert _preventive_message_equipment_label(item) == "Ar condicionado Elgin HJFI09C2WC + HJFE09C2CC"


def test_normalize_equipment_label_drops_duplicate_sala():
    from app.preventive_maintenance import _normalize_equipment_label_text, _preventive_equipment_display_name

    raw = "Sala · Elgin HJFI09C2WC + HJFE09C2CC · Sala"
    assert _normalize_equipment_label_text(raw) == "Sala · Elgin HJFI09C2WC + HJFE09C2CC"
    item = {
        "equipment_identificacao": raw,
        "equipment_tipo": "AR_CONDICIONADO",
        "service_name": "Preventiva",
    }
    assert _preventive_equipment_display_name(item) == "Ar condicionado Sala · Elgin HJFI09C2WC + HJFE09C2CC"


def test_render_preventive_grouped_message_single_item():
    tenant = SimpleNamespace(
        preventive_message_template=None,
        preventive_technical_problem_hint=None,
        timezone="America/Sao_Paulo",
    )
    items = [
        {
            "client_id": 1,
            "service_name": "Preventiva — Sala",
            "equipment_identificacao": "Sala · Elgin MV60",
            "equipment_tipo": "AR_CONDICIONADO",
            "equipment_fabricante": "Elgin",
            "equipment_modelo": "MV60",
            "equipment_local": "Sala",
            "data_ultima_realizacao": date(2026, 4, 20),
            "data_proximo_vencimento": date(2026, 5, 19),
        }
    ]
    text = render_preventive_grouped_message(tenant=tenant, client_name="Robson", items=items)
    assert "Ar condicionado Elgin MV60" in text
    assert "Sala · Elgin" not in text
    assert "24 meses" not in text


def test_group_preventive_items_by_client_and_due_month():
    items = [
        {
            "client_id": 1,
            "client_name": "Cliente A",
            "data_proximo_vencimento": date(2026, 8, 17),
            "dias_ate_vencimento": 10,
            "whatsapp_valido": True,
            "equipment_identificacao": "Sala 01",
        },
        {
            "client_id": 1,
            "client_name": "Cliente A",
            "data_proximo_vencimento": date(2026, 8, 20),
            "dias_ate_vencimento": 13,
            "whatsapp_valido": True,
            "equipment_identificacao": "Sala 02",
        },
        {
            "client_id": 1,
            "client_name": "Cliente A",
            "data_proximo_vencimento": date(2026, 11, 17),
            "dias_ate_vencimento": 90,
            "whatsapp_valido": True,
            "equipment_identificacao": "Entrada",
        },
        {
            "client_id": 2,
            "client_name": "Cliente B",
            "data_proximo_vencimento": date(2026, 8, 17),
            "dias_ate_vencimento": 10,
            "whatsapp_valido": True,
            "equipment_identificacao": "Hall",
        },
    ]
    groups = group_preventive_items_by_client_and_due_month(items)
    assert len(groups) == 3
    aug_client_a = next(g for g in groups if g["client_id"] == 1 and g["due_month"] == 8)
    assert len(aug_client_a["items"]) == 2


def test_merge_equipment_and_historico_preventive_items():
    equipment = [
        {
            "client_id": 1,
            "client_name": "Robson",
            "equipment_id": 10,
            "equipment_identificacao": "Quarto Casal",
            "dias_ate_vencimento": -100,
        },
    ]
    historico = [
        {
            "client_id": 1,
            "client_name": "Robson",
            "equipment_identificacao": "Sala",
            "historico_servico_id": 99,
            "dias_ate_vencimento": -90,
        },
        {
            "client_id": 1,
            "client_name": "Robson",
            "equipment_identificacao": "Quarto Casal",
            "historico_servico_id": 100,
            "dias_ate_vencimento": -100,
        },
    ]
    merged = _merge_equipment_and_historico_preventive_items(equipment, historico)
    assert len(merged) == 2
    idents = {m["equipment_identificacao"] for m in merged}
    assert idents == {"Quarto Casal", "Sala"}


def test_expand_preventive_group_items_uses_full_group():
    items = [
        {"client_id": 1, "historico_servico_id": 10, "data_proximo_vencimento": date(2025, 5, 28)},
    ]
    rows = [
        {
            "client_id": 1,
            "client_name": "Robson",
            "historico_servico_id": 10,
            "data_proximo_vencimento": date(2025, 5, 28),
            "whatsapp_valido": True,
            "dias_ate_vencimento": -10,
        },
        {
            "client_id": 1,
            "client_name": "Robson",
            "rule_id": 7,
            "historico_servico_id": 0,
            "data_proximo_vencimento": date(2025, 5, 28),
            "whatsapp_valido": True,
            "dias_ate_vencimento": -10,
        },
    ]

    class FakeDb:
        pass

    def fake_list(db, *, tenant_id, window_days):
        return rows

    def fake_find(db, *, tenant_id, window_days, historico_servico_id=None, rule_id=None):
        target = None
        for row in rows:
            if historico_servico_id and int(row.get("historico_servico_id") or 0) == historico_servico_id:
                target = row
                break
        if target is None:
            return None
        key = (target["client_id"], 2025, 5)
        group_items = [r for r in rows if (r["client_id"], r["data_proximo_vencimento"].year, r["data_proximo_vencimento"].month) == key]
        return {"items": group_items}

    import app.preventive_maintenance as pm

    orig_list = pm.list_preventive_items
    orig_find = pm.find_preventive_group_for_item
    pm.list_preventive_items = fake_list
    pm.find_preventive_group_for_item = fake_find
    try:
        expanded = pm.expand_preventive_group_items(FakeDb(), tenant_id=1, items=items)
        assert len(expanded) == 2
    finally:
        pm.list_preventive_items = orig_list
        pm.find_preventive_group_for_item = orig_find


def test_render_preventive_grouped_message_lists_equipments():
    tenant = SimpleNamespace(preventive_message_template=None, preventive_technical_problem_hint=None)
    items = [
        {
            "client_id": 1,
            "client_name": "Grupo ADN",
            "service_name": "Preventiva — Sala 01",
            "data_proximo_vencimento": date(2026, 8, 17),
            "data_ultima_realizacao": date(2026, 2, 17),
            "equipment_identificacao": "Sala 01",
        },
        {
            "client_id": 1,
            "client_name": "Grupo ADN",
            "service_name": "Preventiva — Sala 02",
            "data_proximo_vencimento": date(2026, 8, 20),
            "data_ultima_realizacao": date(2026, 2, 20),
            "equipment_identificacao": "Sala 02",
        },
    ]
    text = render_preventive_grouped_message(tenant=tenant, client_name="Grupo ADN", items=items)
    assert "Grupo ADN" in text
    assert "Sala 01" in text
    assert "Sala 02" in text
    assert "2 equipamentos" in text
