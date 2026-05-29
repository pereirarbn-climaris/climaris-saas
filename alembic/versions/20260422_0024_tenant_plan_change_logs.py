"""Tenant plan change audit logs.

Revision ID: 20260422_0024
Revises: 20260422_0023
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op

revision = "20260422_0024"
down_revision = "20260422_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_plan_change_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("previous_plan", sa.String(length=80), nullable=False),
        sa.Column("new_plan", sa.String(length=80), nullable=False),
        sa.Column("changed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("changed_by_email", sa.String(length=255), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tenant_plan_change_logs_tenant_id"), "tenant_plan_change_logs", ["tenant_id"], unique=False)
    op.create_index(
        op.f("ix_tenant_plan_change_logs_changed_by_user_id"),
        "tenant_plan_change_logs",
        ["changed_by_user_id"],
        unique=False,
    )
    op.create_index(op.f("ix_tenant_plan_change_logs_changed_at"), "tenant_plan_change_logs", ["changed_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tenant_plan_change_logs_changed_at"), table_name="tenant_plan_change_logs")
    op.drop_index(op.f("ix_tenant_plan_change_logs_changed_by_user_id"), table_name="tenant_plan_change_logs")
    op.drop_index(op.f("ix_tenant_plan_change_logs_tenant_id"), table_name="tenant_plan_change_logs")
    op.drop_table("tenant_plan_change_logs")
