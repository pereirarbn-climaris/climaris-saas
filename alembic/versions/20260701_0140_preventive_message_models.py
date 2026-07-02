"""Modelos de mensagem preventiva nomeáveis (até 4).

Revision ID: 20260701_0140
Revises: 20260701_0139
Create Date: 2026-07-01 21:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260701_0140"
down_revision = "20260701_0139"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("preventive_message_models_json", sa.Text(), nullable=True))
    op.add_column(
        "tenants",
        sa.Column("preventive_default_template_model_id", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "preventive_default_template_model_id")
    op.drop_column("tenants", "preventive_message_models_json")
