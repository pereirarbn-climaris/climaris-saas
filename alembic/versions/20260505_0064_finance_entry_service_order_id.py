"""Adiciona service_order_id em finance_entries para vincular receita à OS.

Revision ID: 20260505_0064
Revises: 20260505_0063
Create Date: 2026-05-05
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260505_0064"
down_revision: Union[str, None] = "20260505_0063"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "finance_entries",
        sa.Column("service_order_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_finance_entries_service_order_id",
        "finance_entries",
        ["service_order_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_finance_entries_service_order_id",
        "finance_entries",
        "service_orders",
        ["service_order_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_finance_entries_service_order_id", "finance_entries", type_="foreignkey")
    op.drop_index("ix_finance_entries_service_order_id", table_name="finance_entries")
    op.drop_column("finance_entries", "service_order_id")
