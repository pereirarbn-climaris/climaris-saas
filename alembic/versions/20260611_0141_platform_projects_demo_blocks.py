"""platform projects, tasks, demo schedule blocks"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260611_0141"
down_revision = "20260611_0140"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "demo_schedule_blocks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_demo_schedule_blocks_starts_at", "demo_schedule_blocks", ["starts_at"])
    op.create_index("ix_demo_schedule_blocks_ends_at", "demo_schedule_blocks", ["ends_at"])

    op.create_table(
        "platform_projects",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("company_name", sa.String(length=160), nullable=False),
        sa.Column("contact_name", sa.String(length=120), nullable=True),
        sa.Column("contact_email", sa.String(length=254), nullable=True),
        sa.Column("contact_phone", sa.String(length=32), nullable=True),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("demo_appointment_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="lead"),
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="normal"),
        sa.Column("delivery_deadline", sa.Date(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("progress_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["demo_appointment_id"], ["demo_appointments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_platform_projects_status", "platform_projects", ["status"])
    op.create_index("ix_platform_projects_delivery_deadline", "platform_projects", ["delivery_deadline"])
    op.create_index("ix_platform_projects_tenant_id", "platform_projects", ["tenant_id"])
    op.create_index("ix_platform_projects_demo_appointment_id", "platform_projects", ["demo_appointment_id"])

    op.create_table(
        "platform_project_tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["platform_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_platform_project_tasks_project_id", "platform_project_tasks", ["project_id"])
    op.create_index("ix_platform_project_tasks_status", "platform_project_tasks", ["status"])


def downgrade() -> None:
    op.drop_index("ix_platform_project_tasks_status", table_name="platform_project_tasks")
    op.drop_index("ix_platform_project_tasks_project_id", table_name="platform_project_tasks")
    op.drop_table("platform_project_tasks")
    op.drop_index("ix_platform_projects_demo_appointment_id", table_name="platform_projects")
    op.drop_index("ix_platform_projects_tenant_id", table_name="platform_projects")
    op.drop_index("ix_platform_projects_delivery_deadline", table_name="platform_projects")
    op.drop_index("ix_platform_projects_status", table_name="platform_projects")
    op.drop_table("platform_projects")
    op.drop_index("ix_demo_schedule_blocks_ends_at", table_name="demo_schedule_blocks")
    op.drop_index("ix_demo_schedule_blocks_starts_at", table_name="demo_schedule_blocks")
    op.drop_table("demo_schedule_blocks")
