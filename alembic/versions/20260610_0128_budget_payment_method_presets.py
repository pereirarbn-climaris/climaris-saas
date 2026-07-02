"""budget template payment method presets

Revision ID: 20260610_0128
Revises: 20260609_0127
Create Date: 2026-06-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260610_0128"
down_revision = "20260609_0127"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("budget_template_settings", sa.Column("default_payment_method", sa.Text(), nullable=True))
    op.add_column("budget_template_settings", sa.Column("payment_method_presets_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("budget_template_settings", "payment_method_presets_json")
    op.drop_column("budget_template_settings", "default_payment_method")
