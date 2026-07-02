"""Botões de ação opcionais na mensagem preventiva WhatsApp.

Revision ID: 20260701_0138
Revises: 20260701_0137
Create Date: 2026-07-01 18:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260701_0138"
down_revision = "20260701_0137"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column(
            "preventive_action_buttons_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "tenants",
        sa.Column(
            "preventive_button_schedule_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "tenants",
        sa.Column(
            "preventive_button_custom_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "tenants",
        sa.Column(
            "preventive_button_custom_result",
            sa.String(length=16),
            nullable=False,
            server_default="lead",
        ),
    )
    op.add_column(
        "tenants",
        sa.Column("preventive_button_custom_reply_text", sa.Text(), nullable=True),
    )
    op.alter_column("tenants", "preventive_action_buttons_enabled", server_default=None)
    op.alter_column("tenants", "preventive_button_schedule_enabled", server_default=None)
    op.alter_column("tenants", "preventive_button_custom_enabled", server_default=None)
    op.alter_column("tenants", "preventive_button_custom_result", server_default=None)


def downgrade() -> None:
    op.drop_column("tenants", "preventive_button_custom_reply_text")
    op.drop_column("tenants", "preventive_button_custom_result")
    op.drop_column("tenants", "preventive_button_custom_enabled")
    op.drop_column("tenants", "preventive_button_schedule_enabled")
    op.drop_column("tenants", "preventive_action_buttons_enabled")
