"""Testes leves do motor determinístico do Bot WhatsApp."""

from datetime import date
from pathlib import Path

import pytest


def _bot_module():
    return pytest.importorskip("app.whatsapp_bot")


def test_source_declares_core_bot_actions():
    source = Path("app/whatsapp_bot.py").read_text(encoding="utf-8")
    assert "create_budget_draft" in source
    assert "create_schedule_request" in source
    assert "finance_open_entries" in source
    assert "register_nf_request" in source
    assert "register_satisfaction_feedback" in source


def test_template_render_missing_variables_are_blank():
    bot = _bot_module()
    assert bot._render_template("Oi {nome_cliente} - {ausente}", {"nome_cliente": "Maria"}) == "Oi Maria -"


def test_money_and_date_formatting_pt_br():
    bot = _bot_module()
    assert bot._money_brl(1234.5) == "R$ 1.234,50"
    assert bot._date_br(date(2026, 5, 10)) == "10/05/2026"


def test_default_flows_include_core_business_actions():
    bot = _bot_module()
    flows = {flow["slug"]: flow for flow in bot.DEFAULT_FLOW_TEMPLATES}
    assert flows["orcamento-valores"]["steps"][-1]["actions"]["builtin"] == "create_budget_draft"
    assert flows["agendamento-visita"]["steps"][-1]["actions"]["builtin"] == "create_schedule_request"
    assert flows["financeiro-pagamentos"]["steps"][1]["actions"]["builtin"] == "finance_open_entries"
    assert flows["nota-fiscal"]["steps"][-1]["actions"]["builtin"] == "register_nf_request"
    assert flows["pesquisa-satisfacao"]["steps"][-1]["actions"]["builtin"] == "register_satisfaction_feedback"


def test_option_match_uses_aliases():
    bot = _bot_module()
    step = type(
        "Step",
        (),
        {
            "options_json": bot._json_dumps(
                [
                    {"key": "1", "label": "Orçamento", "aliases": ["valor", "preço"]},
                ]
            )
        },
    )()
    assert bot._match_option(step, "preço")["key"] == "1"
