"""whatsapp reminder rules and reschedule options

Revision ID: 20260424_0035
Revises: 20260423_0034
Create Date: 2026-04-24 09:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260424_0035"
down_revision = "20260423_0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("whatsapp_reminder_offsets_json", sa.Text(), nullable=True))
    op.add_column("tenants", sa.Column("whatsapp_reminder_custom_minutes", sa.Integer(), nullable=True))

    op.create_table(
        "whatsapp_reschedule_options",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("schedule_id", sa.Integer(), sa.ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("whatsapp_message_jobs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("option_code", sa.String(length=40), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("technician_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("selected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("option_code", name="uq_whatsapp_reschedule_option_code"),
    )
    op.create_index("ix_whatsapp_reschedule_options_tenant_id", "whatsapp_reschedule_options", ["tenant_id"])
    op.create_index("ix_whatsapp_reschedule_options_schedule_id", "whatsapp_reschedule_options", ["schedule_id"])
    op.create_index("ix_whatsapp_reschedule_options_job_id", "whatsapp_reschedule_options", ["job_id"])
    op.create_index("ix_whatsapp_reschedule_options_option_code", "whatsapp_reschedule_options", ["option_code"])
    op.create_index("ix_whatsapp_reschedule_options_expires_at", "whatsapp_reschedule_options", ["expires_at"])
    op.create_index("ix_whatsapp_reschedule_options_created_at", "whatsapp_reschedule_options", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_reschedule_options_created_at", table_name="whatsapp_reschedule_options")
    op.drop_index("ix_whatsapp_reschedule_options_expires_at", table_name="whatsapp_reschedule_options")
    op.drop_index("ix_whatsapp_reschedule_options_option_code", table_name="whatsapp_reschedule_options")
    op.drop_index("ix_whatsapp_reschedule_options_job_id", table_name="whatsapp_reschedule_options")
    op.drop_index("ix_whatsapp_reschedule_options_schedule_id", table_name="whatsapp_reschedule_options")
    op.drop_index("ix_whatsapp_reschedule_options_tenant_id", table_name="whatsapp_reschedule_options")
    op.drop_table("whatsapp_reschedule_options")
    op.drop_column("tenants", "whatsapp_reminder_custom_minutes")
    op.drop_column("tenants", "whatsapp_reminder_offsets_json")
