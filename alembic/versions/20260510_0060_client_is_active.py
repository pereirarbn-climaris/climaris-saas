"""add active flag to clients

Revision ID: 20260510_0060
Revises: 20260510_0059
Create Date: 2026-05-10 18:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260510_0060"
down_revision = "20260510_0059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clients",
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("clients", "is_active")
