"""saas_plan_catalog.dashboard_tier

Revision ID: 20260626_0127
Revises: 20260625_0126
Create Date: 2026-06-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260626_0127"
down_revision = "20260625_0126"
branch_labels = None
depends_on = None

_FINANCE_TO_DASHBOARD = {
    "basic": "basic",
    "intermediate": "advanced",
    "management": "complete",
}


def upgrade() -> None:
    op.add_column(
        "saas_plan_catalog",
        sa.Column("dashboard_tier", sa.String(length=20), nullable=False, server_default="basic"),
    )
    for finance_mode, dashboard_tier in _FINANCE_TO_DASHBOARD.items():
        op.execute(
            sa.text(
                "UPDATE saas_plan_catalog SET dashboard_tier = :dashboard_tier "
                "WHERE finance_max_mode = :finance_mode"
            ).bindparams(dashboard_tier=dashboard_tier, finance_mode=finance_mode)
        )
    op.alter_column("saas_plan_catalog", "dashboard_tier", server_default=None)


def downgrade() -> None:
    op.drop_column("saas_plan_catalog", "dashboard_tier")
