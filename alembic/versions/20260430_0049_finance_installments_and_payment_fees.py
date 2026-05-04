"""Finance installments fields and tenant payment fee table.

Revision ID: 20260430_0050
Revises: 20260430_0049
Create Date: 2026-04-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260430_0050"
down_revision: Union[str, None] = "20260430_0049"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("finance_entries", sa.Column("installment_group_id", sa.String(length=64), nullable=True))
    op.add_column(
        "finance_entries",
        sa.Column("installment_number", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    op.add_column(
        "finance_entries",
        sa.Column("installment_total", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    op.create_index(op.f("ix_finance_entries_installment_group_id"), "finance_entries", ["installment_group_id"], unique=False)

    op.create_table(
        "tenant_finance_payment_fees",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("provider_name", sa.String(length=80), nullable=False),
        sa.Column("payment_method", sa.String(length=40), nullable=False),
        sa.Column("installments", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("fee_percent", sa.Numeric(7, 4), nullable=False, server_default=sa.text("0")),
        sa.Column("fee_fixed_amount", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "provider_name",
            "payment_method",
            "installments",
            name="uq_fin_payment_fee_tenant_provider_method_installments",
        ),
    )
    op.create_index(op.f("ix_tenant_finance_payment_fees_tenant_id"), "tenant_finance_payment_fees", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tenant_finance_payment_fees_tenant_id"), table_name="tenant_finance_payment_fees")
    op.drop_table("tenant_finance_payment_fees")

    op.drop_index(op.f("ix_finance_entries_installment_group_id"), table_name="finance_entries")
    op.drop_column("finance_entries", "installment_total")
    op.drop_column("finance_entries", "installment_number")
    op.drop_column("finance_entries", "installment_group_id")
