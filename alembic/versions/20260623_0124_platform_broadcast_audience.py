"""Platform broadcast audience segment.

Revision ID: 20260623_0124
Revises: 20260623_0123
Create Date: 2026-06-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260623_0124"
down_revision: Union[str, None] = "20260623_0123"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "platform_notification_broadcasts",
        sa.Column("audience", sa.String(length=40), nullable=False, server_default="all"),
    )
    op.create_index(
        "ix_platform_notification_broadcasts_audience",
        "platform_notification_broadcasts",
        ["audience"],
    )


def downgrade() -> None:
    op.drop_index("ix_platform_notification_broadcasts_audience", table_name="platform_notification_broadcasts")
    op.drop_column("platform_notification_broadcasts", "audience")
