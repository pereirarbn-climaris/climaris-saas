"""Testes de integridade de armazenamento (status de orçamento e vínculos QR)."""

from __future__ import annotations

from app.storage_integrity import normalize_budget_status
from models import BudgetStatus


def test_normalize_budget_status_portuguese_aliases():
    assert normalize_budget_status("Enviado") == BudgetStatus.SENT
    assert normalize_budget_status("visualizado") == BudgetStatus.SENT
    assert normalize_budget_status("Reprovado") == BudgetStatus.REJECTED
    assert normalize_budget_status("") is None
    assert normalize_budget_status(None) is None


def test_normalize_budget_status_english():
    assert normalize_budget_status("draft") == BudgetStatus.DRAFT
    assert normalize_budget_status(BudgetStatus.APPROVED) == BudgetStatus.APPROVED
