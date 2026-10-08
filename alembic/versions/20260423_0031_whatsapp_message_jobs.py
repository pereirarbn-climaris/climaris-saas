"""Whatsapp message jobs and events.

Revision ID: 20260423_0031
Revises: 20260423_0030
Create Date: 2026-04-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260423_0031"
down_revision = "20260423_0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    status_enum = postgresql.ENUM(
        "queued",
        "sent",
        "delivered",
        "read",
        "failed",
        name="whatsapp_message_status",
        create_type=False,
    )
    status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "whatsapp_message_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("provider_slug", sa.String(length=32), nullable=False, server_default="evolution"),
        sa.Column("template_key", sa.String(length=80), nullable=True),
        sa.Column("recipient_whatsapp", sa.String(length=20), nullable=False),
        sa.Column("rendered_message", sa.Text(), nullable=False),
        sa.Column("status", status_enum, nullable=False, server_default="queued"),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("reference_type", sa.String(length=40), nullable=True),
        sa.Column("reference_id", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_whatsapp_message_jobs_tenant_id"), "whatsapp_message_jobs", ["tenant_id"], unique=False)
    op.create_index(
        op.f("ix_whatsapp_message_jobs_created_by_user_id"), "whatsapp_message_jobs", ["created_by_user_id"], unique=False
    )
    op.create_index(
        op.f("ix_whatsapp_message_jobs_recipient_whatsapp"), "whatsapp_message_jobs", ["recipient_whatsapp"], unique=False
    )
    op.create_index(op.f("ix_whatsapp_message_jobs_status"), "whatsapp_message_jobs", ["status"], unique=False)
    op.create_index(
        op.f("ix_whatsapp_message_jobs_provider_message_id"), "whatsapp_message_jobs", ["provider_message_id"], unique=False
    )
    op.create_index(op.f("ix_whatsapp_message_jobs_created_at"), "whatsapp_message_jobs", ["created_at"], unique=False)

    op.create_table(
        "whatsapp_message_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["whatsapp_message_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_whatsapp_message_events_job_id"), "whatsapp_message_events", ["job_id"], unique=False)
    op.create_index(op.f("ix_whatsapp_message_events_tenant_id"), "whatsapp_message_events", ["tenant_id"], unique=False)
    op.create_index(
        op.f("ix_whatsapp_message_events_event_type"), "whatsapp_message_events", ["event_type"], unique=False
    )
    op.create_index(
        op.f("ix_whatsapp_message_events_created_at"), "whatsapp_message_events", ["created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_whatsapp_message_events_created_at"), table_name="whatsapp_message_events")
    op.drop_index(op.f("ix_whatsapp_message_events_event_type"), table_name="whatsapp_message_events")
    op.drop_index(op.f("ix_whatsapp_message_events_tenant_id"), table_name="whatsapp_message_events")
    op.drop_index(op.f("ix_whatsapp_message_events_job_id"), table_name="whatsapp_message_events")
    op.drop_table("whatsapp_message_events")

    op.drop_index(op.f("ix_whatsapp_message_jobs_created_at"), table_name="whatsapp_message_jobs")
    op.drop_index(op.f("ix_whatsapp_message_jobs_provider_message_id"), table_name="whatsapp_message_jobs")
    op.drop_index(op.f("ix_whatsapp_message_jobs_status"), table_name="whatsapp_message_jobs")
    op.drop_index(op.f("ix_whatsapp_message_jobs_recipient_whatsapp"), table_name="whatsapp_message_jobs")
    op.drop_index(op.f("ix_whatsapp_message_jobs_created_by_user_id"), table_name="whatsapp_message_jobs")
    op.drop_index(op.f("ix_whatsapp_message_jobs_tenant_id"), table_name="whatsapp_message_jobs")
    op.drop_table("whatsapp_message_jobs")

    status_enum = postgresql.ENUM(
        "queued",
        "sent",
        "delivered",
        "read",
        "failed",
        name="whatsapp_message_status",
        create_type=False,
    )
    status_enum.drop(op.get_bind(), checkfirst=True)
