"""Add tenant workday and national holiday toggle.

Revision ID: 20260420_0012
Revises: 20260420_0011
Create Date: 2026-04-20
"""

from alembic import op
import sqlalchemy as sa

revision = "20260420_0012"
down_revision = "20260420_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("workday_start", sa.String(length=5), nullable=False, server_default="08:00"))
    op.add_column("tenants", sa.Column("workday_end", sa.String(length=5), nullable=False, server_default="18:00"))
    op.add_column(
        "tenants",
        sa.Column("block_national_holidays", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.alter_column("tenants", "workday_start", server_default=None)
    op.alter_column("tenants", "workday_end", server_default=None)
    op.alter_column("tenants", "block_national_holidays", server_default=None)


def downgrade() -> None:
    op.drop_column("tenants", "block_national_holidays")
    op.drop_column("tenants", "workday_end")
    op.drop_column("tenants", "workday_start")
