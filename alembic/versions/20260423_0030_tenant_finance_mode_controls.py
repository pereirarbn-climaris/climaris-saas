"""Tenant finance mode and enable controls.

Revision ID: 20260423_0030
Revises: 20260423_0029
Create Date: 2026-04-23
"""

import sqlalchemy as sa
from alembic import op

revision = "20260423_0030"
down_revision = "20260423_0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("finance_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "tenants",
        sa.Column("finance_mode", sa.String(length=20), nullable=False, server_default="basic"),
    )


def downgrade() -> None:
    op.drop_column("tenants", "finance_mode")
    op.drop_column("tenants", "finance_enabled")
