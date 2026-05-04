"""AI settings enable flag and chat history table.

Revision ID: 20260430_0054
Revises: 20260430_0053
Create Date: 2026-04-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260430_0054"
down_revision: Union[str, None] = "20260430_0053"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenant_ai_settings",
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "ai_chat_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("client_whatsapp", sa.String(length=20), nullable=True),
        sa.Column("user_message", sa.Text(), nullable=False),
        sa.Column("assistant_response", sa.Text(), nullable=False),
        sa.Column("used_model", sa.String(length=80), nullable=True),
        sa.Column("used_tools_json", sa.Text(), nullable=True),
        sa.Column("system_prompt_xml", sa.Text(), nullable=True),
        sa.Column("is_mock", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_chat_history_tenant_id"), "ai_chat_history", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_ai_chat_history_client_whatsapp"), "ai_chat_history", ["client_whatsapp"], unique=False)
    op.create_index(op.f("ix_ai_chat_history_is_mock"), "ai_chat_history", ["is_mock"], unique=False)
    op.create_index(op.f("ix_ai_chat_history_created_at"), "ai_chat_history", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_chat_history_created_at"), table_name="ai_chat_history")
    op.drop_index(op.f("ix_ai_chat_history_is_mock"), table_name="ai_chat_history")
    op.drop_index(op.f("ix_ai_chat_history_client_whatsapp"), table_name="ai_chat_history")
    op.drop_index(op.f("ix_ai_chat_history_tenant_id"), table_name="ai_chat_history")
    op.drop_table("ai_chat_history")
    op.drop_column("tenant_ai_settings", "is_enabled")
