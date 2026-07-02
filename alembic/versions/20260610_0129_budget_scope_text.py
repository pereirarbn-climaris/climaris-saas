"""budget technical scope text and template presets

Revision ID: 20260610_0129
Revises: 20260610_0128
Create Date: 2026-06-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260610_0129"
down_revision = "20260610_0128"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("budgets", sa.Column("scope_text", sa.Text(), nullable=True))
    op.add_column("budget_template_settings", sa.Column("default_scope_text", sa.Text(), nullable=True))
    op.add_column("budget_template_settings", sa.Column("scope_presets_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("budget_template_settings", "scope_presets_json")
    op.drop_column("budget_template_settings", "default_scope_text")
    op.drop_column("budgets", "scope_text")
