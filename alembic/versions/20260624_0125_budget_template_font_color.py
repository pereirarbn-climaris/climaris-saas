"""budget template font color

Revision ID: 20260624_0125
Revises: 20260623_0124
Create Date: 2026-06-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260624_0125"
down_revision = "20260623_0124"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "budget_template_settings",
        sa.Column("font_color", sa.String(length=7), nullable=False, server_default="#000000"),
    )


def downgrade() -> None:
    op.drop_column("budget_template_settings", "font_color")
