"""Campanhas WhatsApp (reativação / orçamentos em aberto).

Revision ID: 20260514_0074
Revises: 20260514_0073
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260514_0074"
down_revision: Union[str, None] = "20260514_0073"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_broadcast_campaigns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("message_template", sa.Text(), nullable=False),
        sa.Column("segment_kind", sa.String(length=40), nullable=False),
        sa.Column("segment_params_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("max_recipients_per_run", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("cooldown_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_summary_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "slug", name="uq_whatsapp_broadcast_campaign_tenant_slug"),
    )
    op.create_index("ix_whatsapp_broadcast_campaigns_tenant_id", "whatsapp_broadcast_campaigns", ["tenant_id"])

    op.create_table(
        "whatsapp_broadcast_campaign_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("whatsapp_broadcast_campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="running"),
        sa.Column("planned", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent_ok", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent_failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_cooldown", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_no_phone", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_whatsapp_broadcast_runs_tenant_id", "whatsapp_broadcast_campaign_runs", ["tenant_id"])
    op.create_index("ix_whatsapp_broadcast_runs_campaign_id", "whatsapp_broadcast_campaign_runs", ["campaign_id"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_broadcast_runs_campaign_id", table_name="whatsapp_broadcast_campaign_runs")
    op.drop_index("ix_whatsapp_broadcast_runs_tenant_id", table_name="whatsapp_broadcast_campaign_runs")
    op.drop_table("whatsapp_broadcast_campaign_runs")
    op.drop_index("ix_whatsapp_broadcast_campaigns_tenant_id", table_name="whatsapp_broadcast_campaigns")
    op.drop_table("whatsapp_broadcast_campaigns")
