"""Login refresh tokens (renovar JWT sem novo login).

Revision ID: 20260512_0067
Revises: 20260511_0066
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260512_0067"
down_revision: Union[str, None] = "20260511_0066"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "login_refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_login_refresh_tokens_user_id"), "login_refresh_tokens", ["user_id"], unique=False)
    op.create_index(op.f("ix_login_refresh_tokens_token_hash"), "login_refresh_tokens", ["token_hash"], unique=True)
    op.create_index(op.f("ix_login_refresh_tokens_expires_at"), "login_refresh_tokens", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_login_refresh_tokens_expires_at"), table_name="login_refresh_tokens")
    op.drop_index(op.f("ix_login_refresh_tokens_token_hash"), table_name="login_refresh_tokens")
    op.drop_index(op.f("ix_login_refresh_tokens_user_id"), table_name="login_refresh_tokens")
    op.drop_table("login_refresh_tokens")
