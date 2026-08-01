"""Client commercial contracts + PMOC validity dates.

Revision ID: 20260708_0145
Revises: 20260702_0143

Nota: a revisão original desta migration ("20260707_0144") referenciava um
arquivo intermediário que não existe mais no repositório. Como o banco já
tinha essa migration aplicada antes da perda do arquivo, apontamos a cadeia
diretamente para a revisão anterior existente (20260702_0143) para destravar
o `alembic upgrade heads` sem tentar reaplicar nada já efetivado no banco.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260708_0145"
down_revision: Union[str, None] = "20260702_0143"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pmoc_plans", sa.Column("validity_start", sa.Date(), nullable=True))
    op.add_column("pmoc_plans", sa.Column("validity_end", sa.Date(), nullable=True))

    op.create_table(
        "client_contracts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_site_id", sa.Integer(), sa.ForeignKey("client_sites.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("budget_id", sa.Integer(), sa.ForeignKey("budgets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("pmoc_plan_id", sa.Integer(), sa.ForeignKey("pmoc_plans.id", ondelete="SET NULL"), nullable=True),
        sa.Column("responsible_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contract_number", sa.String(length=40), nullable=False),
        sa.Column("display_number", sa.String(length=60), nullable=True),
        sa.Column("contract_year", sa.Integer(), nullable=True),
        sa.Column("contract_type", sa.String(length=80), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False, server_default="sob_demanda"),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("recurrence", sa.String(length=20), nullable=False, server_default="annual"),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("value_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_due_date", sa.Date(), nullable=True),
        sa.Column("payment_method", sa.String(length=40), nullable=True),
        sa.Column("due_day", sa.Integer(), nullable=True),
        sa.Column("adjustment_index", sa.String(length=40), nullable=True),
        sa.Column("adjustment_period", sa.String(length=20), nullable=True),
        sa.Column("late_fee_percent", sa.Numeric(6, 2), nullable=True),
        sa.Column("interest_percent", sa.Numeric(6, 2), nullable=True),
        sa.Column("auto_renewal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("expiry_notice_days", sa.Integer(), nullable=True),
        sa.Column("coverage_location", sa.Text(), nullable=True),
        sa.Column("billing_notes", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("form_category_label", sa.String(length=40), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("tenant_id", "contract_number", name="uq_client_contracts_tenant_number"),
    )
    op.create_index("ix_client_contracts_tenant_id", "client_contracts", ["tenant_id"])
    op.create_index("ix_client_contracts_client_id", "client_contracts", ["client_id"])
    op.create_index("ix_client_contracts_client_site_id", "client_contracts", ["client_site_id"])
    op.create_index("ix_client_contracts_budget_id", "client_contracts", ["budget_id"])
    op.create_index("ix_client_contracts_pmoc_plan_id", "client_contracts", ["pmoc_plan_id"])
    op.create_index("ix_client_contracts_responsible_user_id", "client_contracts", ["responsible_user_id"])

    op.create_table(
        "client_contract_equipments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "client_contract_id",
            sa.Integer(),
            sa.ForeignKey("client_contracts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "client_equipment_id",
            sa.Uuid(),
            sa.ForeignKey("client_equipments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("client_contract_id", "client_equipment_id", name="uq_client_contract_equipment"),
    )
    op.create_index(
        "ix_client_contract_equipments_client_contract_id",
        "client_contract_equipments",
        ["client_contract_id"],
    )
    op.create_index(
        "ix_client_contract_equipments_client_equipment_id",
        "client_contract_equipments",
        ["client_equipment_id"],
    )

    op.create_table(
        "client_contract_services",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "client_contract_id",
            sa.Integer(),
            sa.ForeignKey("client_contracts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("service_name", sa.String(length=200), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index(
        "ix_client_contract_services_client_contract_id",
        "client_contract_services",
        ["client_contract_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_client_contract_services_client_contract_id", table_name="client_contract_services")
    op.drop_table("client_contract_services")
    op.drop_index("ix_client_contract_equipments_client_equipment_id", table_name="client_contract_equipments")
    op.drop_index("ix_client_contract_equipments_client_contract_id", table_name="client_contract_equipments")
    op.drop_table("client_contract_equipments")
    op.drop_index("ix_client_contracts_responsible_user_id", table_name="client_contracts")
    op.drop_index("ix_client_contracts_pmoc_plan_id", table_name="client_contracts")
    op.drop_index("ix_client_contracts_budget_id", table_name="client_contracts")
    op.drop_index("ix_client_contracts_client_site_id", table_name="client_contracts")
    op.drop_index("ix_client_contracts_client_id", table_name="client_contracts")
    op.drop_index("ix_client_contracts_tenant_id", table_name="client_contracts")
    op.drop_table("client_contracts")
    op.drop_column("pmoc_plans", "validity_end")
    op.drop_column("pmoc_plans", "validity_start")
