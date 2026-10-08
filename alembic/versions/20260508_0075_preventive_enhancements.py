"""Manutenção preventiva: lembrete antecipado, opt-out do cliente.

Revision ID: 0075
Revises: 0074
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0075"
down_revision = "0074"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("preventive_auto_remind_days_before", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "clients",
        sa.Column("preventive_campaign_opt_out", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.alter_column("tenants", "preventive_auto_remind_days_before", server_default=None)
    op.alter_column("clients", "preventive_campaign_opt_out", server_default=None)


def downgrade() -> None:
    op.drop_column("clients", "preventive_campaign_opt_out")
    op.drop_column("tenants", "preventive_auto_remind_days_before")
