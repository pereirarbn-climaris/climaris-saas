"""SaaS plan catalog for operational editing (matrix + finance cap).

Revision ID: 20260430_0049
Revises: 20260430_0048
Create Date: 2026-04-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260430_0049"
down_revision: Union[str, None] = "20260430_0048"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saas_plan_catalog",
        sa.Column("plan_key", sa.String(length=80), nullable=False),
        sa.Column("display_name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("footnote", sa.Text(), nullable=False),
        sa.Column("finance_max_mode", sa.String(length=20), nullable=False),
        sa.Column("max_users", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_beta_internal", sa.Boolean(), nullable=False),
        sa.Column("can_contract", sa.Boolean(), nullable=False),
        sa.Column("is_selectable_for_tenants", sa.Boolean(), nullable=False),
        sa.Column("show_in_matrix", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("plan_key"),
    )
    op.bulk_insert(
        sa.table(
            "saas_plan_catalog",
            sa.column("plan_key", sa.String),
            sa.column("display_name", sa.String),
            sa.column("description", sa.Text),
            sa.column("footnote", sa.Text),
            sa.column("finance_max_mode", sa.String),
            sa.column("max_users", sa.Integer),
            sa.column("sort_order", sa.Integer),
            sa.column("is_beta_internal", sa.Boolean),
            sa.column("can_contract", sa.Boolean),
            sa.column("is_selectable_for_tenants", sa.Boolean),
            sa.column("show_in_matrix", sa.Boolean),
        ),
        [
            {
                "plan_key": "free_30d",
                "display_name": "Free 30 dias",
                "description": "Inclui Financeiro Básico.",
                "footnote": "Upsell sugerido: add-on finance-intermediate na loja.",
                "finance_max_mode": "basic",
                "max_users": 2,
                "sort_order": 10,
                "is_beta_internal": False,
                "can_contract": True,
                "is_selectable_for_tenants": True,
                "show_in_matrix": True,
            },
            {
                "plan_key": "basic",
                "display_name": "Basic",
                "description": "Inclui Financeiro Básico.",
                "footnote": "Upsell sugerido: add-on finance-intermediate na loja.",
                "finance_max_mode": "basic",
                "max_users": 2,
                "sort_order": 20,
                "is_beta_internal": False,
                "can_contract": True,
                "is_selectable_for_tenants": True,
                "show_in_matrix": True,
            },
            {
                "plan_key": "professional",
                "display_name": "Professional",
                "description": "Inclui Financeiro Intermediário.",
                "footnote": "Upsell sugerido: add-on finance-management na loja.",
                "finance_max_mode": "intermediate",
                "max_users": 5,
                "sort_order": 30,
                "is_beta_internal": False,
                "can_contract": True,
                "is_selectable_for_tenants": True,
                "show_in_matrix": True,
            },
            {
                "plan_key": "enterprise",
                "display_name": "Enterprise",
                "description": "Inclui Gestão Financeira Completa.",
                "footnote": "Upsell: módulos complementares (integrações, automações).",
                "finance_max_mode": "management",
                "max_users": None,
                "sort_order": 40,
                "is_beta_internal": False,
                "can_contract": True,
                "is_selectable_for_tenants": True,
                "show_in_matrix": True,
            },
            {
                "plan_key": "beta_internal",
                "display_name": "Developer (uso interno)",
                "description": "Acesso completo ao financeiro (modo gestão) e demais recursos para testes.",
                "footnote": "Plano interno, não disponível para contratação externa.",
                "finance_max_mode": "management",
                "max_users": None,
                "sort_order": 50,
                "is_beta_internal": True,
                "can_contract": False,
                "is_selectable_for_tenants": True,
                "show_in_matrix": True,
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("saas_plan_catalog")
