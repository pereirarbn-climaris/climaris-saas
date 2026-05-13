"""client audit log

Revision ID: 20260510_0061
Revises: 20260510_0060
Create Date: 2026-05-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260510_0061"
down_revision: Union[str, None] = "20260510_0060"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "client_audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("changes_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            index=True,
        ),
    )
    op.create_index("ix_client_audit_logs_client_created", "client_audit_logs", ["client_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_client_audit_logs_client_created", table_name="client_audit_logs")
    op.drop_table("client_audit_logs")
