"""AI pending confirmation before sensitive tools.

Revision ID: 20260430_0055
Revises: 20260430_0054
Create Date: 2026-04-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260430_0055"
down_revision: Union[str, None] = "20260430_0054"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_pending_tool_confirmations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("client_whatsapp", sa.String(length=20), nullable=False),
        sa.Column("tool_name", sa.String(length=80), nullable=False),
        sa.Column("arguments_json", sa.Text(), nullable=False),
        sa.Column("confirmation_prompt", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "client_whatsapp", name="uq_ai_pending_tool_tenant_client"),
    )
    op.create_index(
        op.f("ix_ai_pending_tool_confirmations_tenant_id"),
        "ai_pending_tool_confirmations",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ai_pending_tool_confirmations_expires_at"),
        "ai_pending_tool_confirmations",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_pending_tool_confirmations_expires_at"), table_name="ai_pending_tool_confirmations")
    op.drop_index(op.f("ix_ai_pending_tool_confirmations_tenant_id"), table_name="ai_pending_tool_confirmations")
    op.drop_table("ai_pending_tool_confirmations")
