"""OS digital — versionamento otimista e log de conflitos de sincronização.

Revision ID: 20260627_0133
Revises: 20260627_0132
Create Date: 2026-06-27
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260627_0133"
down_revision: Union[str, None] = "20260627_0132"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "digital_work_orders",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.alter_column("digital_work_orders", "version", server_default=None)

    op.create_table(
        "sync_audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "digital_work_order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("digital_work_orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_last_version", sa.Integer(), nullable=False),
        sa.Column("server_version", sa.Integer(), nullable=False),
        sa.Column("sync_kind", sa.String(length=32), nullable=False),
        sa.Column("resolution", sa.String(length=32), nullable=False, server_default="field_priority"),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "actor_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sync_audit_logs_tenant_id", "sync_audit_logs", ["tenant_id"])
    op.create_index("ix_sync_audit_logs_digital_work_order_id", "sync_audit_logs", ["digital_work_order_id"])


def downgrade() -> None:
    op.drop_index("ix_sync_audit_logs_digital_work_order_id", table_name="sync_audit_logs")
    op.drop_index("ix_sync_audit_logs_tenant_id", table_name="sync_audit_logs")
    op.drop_table("sync_audit_logs")
    op.drop_column("digital_work_orders", "version")
