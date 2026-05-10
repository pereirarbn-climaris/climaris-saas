"""whatsapp bot v1 deterministic flows

Revision ID: 20260510_0058
Revises: 20260430_0057
Create Date: 2026-05-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260510_0058"
down_revision: Union[str, None] = "20260430_0057"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_bot_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("welcome_message", sa.Text(), nullable=False),
        sa.Column("fallback_message", sa.Text(), nullable=False),
        sa.Column("handoff_message", sa.Text(), nullable=False),
        sa.Column("handoff_keywords_json", sa.Text(), nullable=True),
        sa.Column("handoff_pause_minutes", sa.Integer(), nullable=False, server_default="240"),
        sa.Column("business_hours_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", name="uq_whatsapp_bot_settings_tenant"),
    )
    op.create_index("ix_whatsapp_bot_settings_tenant_id", "whatsapp_bot_settings", ["tenant_id"])

    op.create_table(
        "whatsapp_bot_flows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("trigger_type", sa.String(length=32), nullable=False, server_default="keyword"),
        sa.Column("trigger_keywords_json", sa.Text(), nullable=True),
        sa.Column("system_event", sa.String(length=80), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "slug", name="uq_whatsapp_bot_flow_tenant_slug"),
    )
    op.create_index("ix_whatsapp_bot_flows_tenant_id", "whatsapp_bot_flows", ["tenant_id"])
    op.create_index("ix_whatsapp_bot_flows_system_event", "whatsapp_bot_flows", ["system_event"])

    op.create_table(
        "whatsapp_bot_steps",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("flow_id", sa.Integer(), sa.ForeignKey("whatsapp_bot_flows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("step_key", sa.String(length=80), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False, server_default="message"),
        sa.Column("message_template", sa.Text(), nullable=False),
        sa.Column("options_json", sa.Text(), nullable=True),
        sa.Column("validation_json", sa.Text(), nullable=True),
        sa.Column("actions_json", sa.Text(), nullable=True),
        sa.Column("next_step_key", sa.String(length=80), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("flow_id", "step_key", name="uq_whatsapp_bot_step_flow_key"),
    )
    op.create_index("ix_whatsapp_bot_steps_flow_id", "whatsapp_bot_steps", ["flow_id"])

    op.create_table(
        "whatsapp_bot_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_whatsapp", sa.String(length=20), nullable=False),
        sa.Column("current_flow_id", sa.Integer(), sa.ForeignKey("whatsapp_bot_flows.id", ondelete="SET NULL"), nullable=True),
        sa.Column("current_step_key", sa.String(length=80), nullable=True),
        sa.Column("context_json", sa.Text(), nullable=True),
        sa.Column("paused_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_incoming_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_outgoing_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "client_whatsapp", name="uq_whatsapp_bot_session_tenant_client"),
    )
    op.create_index("ix_whatsapp_bot_sessions_tenant_id", "whatsapp_bot_sessions", ["tenant_id"])
    op.create_index("ix_whatsapp_bot_sessions_client_whatsapp", "whatsapp_bot_sessions", ["client_whatsapp"])
    op.create_index("ix_whatsapp_bot_sessions_current_flow_id", "whatsapp_bot_sessions", ["current_flow_id"])
    op.create_index("ix_whatsapp_bot_sessions_paused_until", "whatsapp_bot_sessions", ["paused_until"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_bot_sessions_paused_until", table_name="whatsapp_bot_sessions")
    op.drop_index("ix_whatsapp_bot_sessions_current_flow_id", table_name="whatsapp_bot_sessions")
    op.drop_index("ix_whatsapp_bot_sessions_client_whatsapp", table_name="whatsapp_bot_sessions")
    op.drop_index("ix_whatsapp_bot_sessions_tenant_id", table_name="whatsapp_bot_sessions")
    op.drop_table("whatsapp_bot_sessions")
    op.drop_index("ix_whatsapp_bot_steps_flow_id", table_name="whatsapp_bot_steps")
    op.drop_table("whatsapp_bot_steps")
    op.drop_index("ix_whatsapp_bot_flows_system_event", table_name="whatsapp_bot_flows")
    op.drop_index("ix_whatsapp_bot_flows_tenant_id", table_name="whatsapp_bot_flows")
    op.drop_table("whatsapp_bot_flows")
    op.drop_index("ix_whatsapp_bot_settings_tenant_id", table_name="whatsapp_bot_settings")
    op.drop_table("whatsapp_bot_settings")
