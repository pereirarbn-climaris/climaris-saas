"""Preferências de controle de estoque por tenant (respeitando o plano SaaS)."""

from __future__ import annotations

from app.tenant_plan_products import tenant_inventory_enabled

__all__ = ["tenant_inventory_enabled"]
