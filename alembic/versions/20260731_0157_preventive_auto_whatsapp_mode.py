"""tenants: preventive_auto_whatsapp_mode (days_before | month_first_business_day)

Revision ID: 20260731_0157
Revises: 20260729_0156
Create Date: 2026-07-31
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260731_0157"
down_revision: Union[str, None] = "20260729_0156"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column(
            "preventive_auto_whatsapp_mode",
            sa.String(length=32),
            nullable=False,
            server_default="days_before",
        ),
    )
    op.alter_column("tenants", "preventive_auto_whatsapp_mode", server_default=None)


def downgrade() -> None:
    op.drop_column("tenants", "preventive_auto_whatsapp_mode")
