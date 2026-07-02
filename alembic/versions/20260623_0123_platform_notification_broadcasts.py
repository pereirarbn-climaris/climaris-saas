"""Platform notification broadcasts (avisos para todos os clientes SaaS).

Revision ID: 20260623_0123
Revises: 20260622_0122
Create Date: 2026-06-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260623_0123"
down_revision: Union[str, None] = "20260622_0122"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platform_notification_broadcasts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("link_path", sa.String(length=255), nullable=True),
        sa.Column("recipients_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tenant_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_platform_notification_broadcasts_created_by_user_id",
        "platform_notification_broadcasts",
        ["created_by_user_id"],
    )
    op.create_index(
        "ix_platform_notification_broadcasts_created_at",
        "platform_notification_broadcasts",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_platform_notification_broadcasts_created_at", table_name="platform_notification_broadcasts")
    op.drop_index(
        "ix_platform_notification_broadcasts_created_by_user_id",
        table_name="platform_notification_broadcasts",
    )
    op.drop_table("platform_notification_broadcasts")
