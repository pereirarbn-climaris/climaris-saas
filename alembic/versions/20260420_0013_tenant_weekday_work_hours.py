"""Add tenant weekday-specific work hours.

Revision ID: 20260420_0013
Revises: 20260420_0012
Create Date: 2026-04-20
"""

from alembic import op
import sqlalchemy as sa

revision = "20260420_0013"
down_revision = "20260420_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("weekday_work_hours", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "weekday_work_hours")
