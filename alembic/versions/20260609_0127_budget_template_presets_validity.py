"""budget template text presets and default validity

Revision ID: 20260609_0127
Revises: 20260625_0126
Create Date: 2026-06-09
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260609_0127"
down_revision = "20260625_0126"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "budget_template_settings",
        sa.Column("default_validity_days", sa.Integer(), nullable=False, server_default="30"),
    )
    op.add_column("budget_template_settings", sa.Column("warranty_presets_json", sa.Text(), nullable=True))
    op.add_column("budget_template_settings", sa.Column("payment_presets_json", sa.Text(), nullable=True))
    op.add_column("budget_template_settings", sa.Column("technical_presets_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("budget_template_settings", "technical_presets_json")
    op.drop_column("budget_template_settings", "payment_presets_json")
    op.drop_column("budget_template_settings", "warranty_presets_json")
    op.drop_column("budget_template_settings", "default_validity_days")
