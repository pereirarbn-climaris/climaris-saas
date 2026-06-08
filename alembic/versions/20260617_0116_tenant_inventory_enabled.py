"""Tenant flag to enable/disable product inventory tracking.

Revision ID: 20260617_0116
Revises: 20260616_0115
Create Date: 2026-06-17
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260617_0116"
down_revision: Union[str, None] = "20260616_0115"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("inventory_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("tenants", "inventory_enabled")
