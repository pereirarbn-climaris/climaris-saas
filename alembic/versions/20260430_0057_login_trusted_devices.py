"""Login trusted devices (2FA remember this device).

Revision ID: 20260430_0057
Revises: 20260430_0056
Create Date: 2026-04-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260430_0057"
down_revision: Union[str, None] = "20260430_0056"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "login_trusted_devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("device_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_agent_hash", sa.String(length=64), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_login_trusted_devices_user_id"), "login_trusted_devices", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_login_trusted_devices_device_fingerprint"), "login_trusted_devices", ["device_fingerprint"], unique=False
    )
    op.create_index(op.f("ix_login_trusted_devices_token_hash"), "login_trusted_devices", ["token_hash"], unique=True)
    op.create_index(op.f("ix_login_trusted_devices_expires_at"), "login_trusted_devices", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_login_trusted_devices_expires_at"), table_name="login_trusted_devices")
    op.drop_index(op.f("ix_login_trusted_devices_token_hash"), table_name="login_trusted_devices")
    op.drop_index(op.f("ix_login_trusted_devices_device_fingerprint"), table_name="login_trusted_devices")
    op.drop_index(op.f("ix_login_trusted_devices_user_id"), table_name="login_trusted_devices")
    op.drop_table("login_trusted_devices")
