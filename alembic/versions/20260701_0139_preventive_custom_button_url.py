"""URL opcional no botão personalizado da preventiva.

Revision ID: 20260701_0139
Revises: 20260701_0138
Create Date: 2026-07-01 20:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260701_0139"
down_revision = "20260701_0138"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("preventive_button_custom_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "preventive_button_custom_url")
