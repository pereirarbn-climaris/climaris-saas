"""preventive whatsapp schedule flow tables

Revision ID: 20260601_0096
Revises: 20260601_0095
Create Date: 2026-06-01
"""

from alembic import op
import sqlalchemy as sa

revision = "20260601_0096"
down_revision = "20260601_0095"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "preventive_reminder_contexts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("whatsapp_digits", sa.String(length=20), nullable=False),
        sa.Column("whatsapp_job_id", sa.Integer(), nullable=True),
        sa.Column("group_items_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["whatsapp_job_id"], ["whatsapp_message_jobs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_preventive_reminder_contexts_tenant_id", "preventive_reminder_contexts", ["tenant_id"])
    op.create_index("ix_preventive_reminder_contexts_client_id", "preventive_reminder_contexts", ["client_id"])
    op.create_index("ix_preventive_reminder_contexts_whatsapp_digits", "preventive_reminder_contexts", ["whatsapp_digits"])
    op.create_index("ix_preventive_reminder_contexts_created_at", "preventive_reminder_contexts", ["created_at"])

    op.create_table(
        "preventive_schedule_flows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("whatsapp_digits", sa.String(length=20), nullable=False),
        sa.Column("step", sa.String(length=20), nullable=False),
        sa.Column("equipment_items_json", sa.Text(), nullable=False),
        sa.Column("selected_equipment_json", sa.Text(), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("service_order_id", sa.Integer(), nullable=True),
        sa.Column("schedule_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["schedule_id"], ["schedules.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["service_order_id"], ["service_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_preventive_schedule_flows_tenant_id", "preventive_schedule_flows", ["tenant_id"])
    op.create_index("ix_preventive_schedule_flows_whatsapp_digits", "preventive_schedule_flows", ["whatsapp_digits"])
    op.create_index("ix_preventive_schedule_flows_expires_at", "preventive_schedule_flows", ["expires_at"])

    op.create_table(
        "preventive_schedule_slot_options",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("flow_id", sa.Integer(), nullable=False),
        sa.Column("option_code", sa.String(length=48), nullable=False),
        sa.Column("option_index", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("technician_id", sa.Integer(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("selected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["flow_id"], ["preventive_schedule_flows.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["technician_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("option_code", name="uq_preventive_schedule_slot_option_code"),
    )
    op.create_index("ix_preventive_schedule_slot_options_flow_id", "preventive_schedule_slot_options", ["flow_id"])
    op.create_index("ix_preventive_schedule_slot_options_option_code", "preventive_schedule_slot_options", ["option_code"])


def downgrade() -> None:
    op.drop_index("ix_preventive_schedule_slot_options_option_code", table_name="preventive_schedule_slot_options")
    op.drop_index("ix_preventive_schedule_slot_options_flow_id", table_name="preventive_schedule_slot_options")
    op.drop_table("preventive_schedule_slot_options")
    op.drop_index("ix_preventive_schedule_flows_expires_at", table_name="preventive_schedule_flows")
    op.drop_index("ix_preventive_schedule_flows_whatsapp_digits", table_name="preventive_schedule_flows")
    op.drop_index("ix_preventive_schedule_flows_tenant_id", table_name="preventive_schedule_flows")
    op.drop_table("preventive_schedule_flows")
    op.drop_index("ix_preventive_reminder_contexts_created_at", table_name="preventive_reminder_contexts")
    op.drop_index("ix_preventive_reminder_contexts_whatsapp_digits", table_name="preventive_reminder_contexts")
    op.drop_index("ix_preventive_reminder_contexts_client_id", table_name="preventive_reminder_contexts")
    op.drop_index("ix_preventive_reminder_contexts_tenant_id", table_name="preventive_reminder_contexts")
    op.drop_table("preventive_reminder_contexts")
