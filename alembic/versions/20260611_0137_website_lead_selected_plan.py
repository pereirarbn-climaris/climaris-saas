"""website lead selected plan"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260611_0137"
down_revision = "20260611_0136"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("website_leads", sa.Column("selected_plan", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("website_leads", "selected_plan")
