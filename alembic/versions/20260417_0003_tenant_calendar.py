"""Add tenant timezone, business days and holidays.

Revision ID: 20260417_0003
Revises: 20260417_0002
Create Date: 2026-04-17
"""

from alembic import op
import sqlalchemy as sa


revision = "20260417_0003"
down_revision = "20260417_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("timezone", sa.String(length=64), nullable=False, server_default="UTC"))
    op.add_column("tenants", sa.Column("business_days", sa.String(length=32), nullable=False, server_default="0,1,2,3,4"))

    op.create_table(
        "tenant_holidays",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("holiday_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=200), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "holiday_date", name="uq_tenant_holiday_date"),
    )
    op.create_index("ix_tenant_holidays_tenant_id", "tenant_holidays", ["tenant_id"], unique=False)

    op.alter_column("tenants", "timezone", server_default=None)
    op.alter_column("tenants", "business_days", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_tenant_holidays_tenant_id", table_name="tenant_holidays")
    op.drop_table("tenant_holidays")
    op.drop_column("tenants", "business_days")
    op.drop_column("tenants", "timezone")
