"""Tenant toggle: auto-agendamento preventiva via WhatsApp (resposta AGENDAR).

Revision ID: 20260701_0137
Revises: 20260627_0136
Create Date: 2026-07-01 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260701_0137"
down_revision = ("20260622_0138", "20260627_0136")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column(
            "preventive_auto_schedule_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.alter_column("tenants", "preventive_auto_schedule_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("tenants", "preventive_auto_schedule_enabled")
