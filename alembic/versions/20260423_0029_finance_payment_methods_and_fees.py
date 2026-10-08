"""Finance entries payment methods and fee fields.

Revision ID: 20260423_0029
Revises: 20260422_0028
Create Date: 2026-04-23
"""

import sqlalchemy as sa
from alembic import op

revision = "20260423_0029"
down_revision = "20260422_0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("finance_entries", sa.Column("payment_method", sa.String(length=40), nullable=True))
    op.add_column("finance_entries", sa.Column("payment_provider", sa.String(length=80), nullable=True))
    op.add_column(
        "finance_entries",
        sa.Column("fee_fixed_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.add_column(
        "finance_entries",
        sa.Column("fee_percent", sa.Numeric(7, 4), nullable=False, server_default="0"),
    )
    op.add_column(
        "finance_entries",
        sa.Column("fee_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("finance_entries", "fee_amount")
    op.drop_column("finance_entries", "fee_percent")
    op.drop_column("finance_entries", "fee_fixed_amount")
    op.drop_column("finance_entries", "payment_provider")
    op.drop_column("finance_entries", "payment_method")
