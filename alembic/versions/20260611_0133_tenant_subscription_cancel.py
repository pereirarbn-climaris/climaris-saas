"""tenant subscription cancel fields"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260611_0133"
down_revision = "20260610_0132"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("subscription_cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "tenants",
        sa.Column("subscription_ends_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "subscription_ends_at")
    op.drop_column("tenants", "subscription_cancel_at_period_end")
