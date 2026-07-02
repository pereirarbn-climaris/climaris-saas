"""User notifications (central de notificações in-app).

Revision ID: 20260622_0122
Revises: 20260621_0121
Create Date: 2026-06-22
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260622_0122"
down_revision: Union[str, None] = "20260621_0121"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("link_path", sa.String(length=255), nullable=True),
        sa.Column("entity_type", sa.String(length=40), nullable=True),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_notifications_tenant_id", "user_notifications", ["tenant_id"])
    op.create_index("ix_user_notifications_user_id", "user_notifications", ["user_id"])
    op.create_index("ix_user_notifications_kind", "user_notifications", ["kind"])
    op.create_index("ix_user_notifications_actor_user_id", "user_notifications", ["actor_user_id"])
    op.create_index("ix_user_notifications_read_at", "user_notifications", ["read_at"])
    op.create_index("ix_user_notifications_created_at", "user_notifications", ["created_at"])
    op.create_index(
        "ix_user_notifications_user_unread",
        "user_notifications",
        ["user_id", "read_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_notifications_user_unread", table_name="user_notifications")
    op.drop_index("ix_user_notifications_created_at", table_name="user_notifications")
    op.drop_index("ix_user_notifications_read_at", table_name="user_notifications")
    op.drop_index("ix_user_notifications_actor_user_id", table_name="user_notifications")
    op.drop_index("ix_user_notifications_kind", table_name="user_notifications")
    op.drop_index("ix_user_notifications_user_id", table_name="user_notifications")
    op.drop_index("ix_user_notifications_tenant_id", table_name="user_notifications")
    op.drop_table("user_notifications")
