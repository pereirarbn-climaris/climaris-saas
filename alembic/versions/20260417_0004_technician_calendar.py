"""Add technician work windows, breaks and unavailability.

Revision ID: 20260417_0004
Revises: 20260417_0003
Create Date: 2026-04-17
"""

from alembic import op
import sqlalchemy as sa


revision = "20260417_0004"
down_revision = "20260417_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "technician_work_windows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("technician_id", sa.Integer(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.String(length=5), nullable=False),
        sa.Column("end_time", sa.String(length=5), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["technician_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_technician_work_windows_tenant_id", "technician_work_windows", ["tenant_id"], unique=False)
    op.create_index(
        "ix_technician_work_windows_technician_id", "technician_work_windows", ["technician_id"], unique=False
    )

    op.create_table(
        "technician_break_windows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("technician_id", sa.Integer(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.String(length=5), nullable=False),
        sa.Column("end_time", sa.String(length=5), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["technician_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_technician_break_windows_tenant_id", "technician_break_windows", ["tenant_id"], unique=False)
    op.create_index(
        "ix_technician_break_windows_technician_id", "technician_break_windows", ["technician_id"], unique=False
    )

    op.create_table(
        "technician_unavailability",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("technician_id", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["technician_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_technician_unavailability_tenant_id", "technician_unavailability", ["tenant_id"], unique=False)
    op.create_index(
        "ix_technician_unavailability_technician_id", "technician_unavailability", ["technician_id"], unique=False
    )
    op.create_index("ix_technician_unavailability_starts_at", "technician_unavailability", ["starts_at"], unique=False)
    op.create_index("ix_technician_unavailability_ends_at", "technician_unavailability", ["ends_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_technician_unavailability_ends_at", table_name="technician_unavailability")
    op.drop_index("ix_technician_unavailability_starts_at", table_name="technician_unavailability")
    op.drop_index("ix_technician_unavailability_technician_id", table_name="technician_unavailability")
    op.drop_index("ix_technician_unavailability_tenant_id", table_name="technician_unavailability")
    op.drop_table("technician_unavailability")

    op.drop_index("ix_technician_break_windows_technician_id", table_name="technician_break_windows")
    op.drop_index("ix_technician_break_windows_tenant_id", table_name="technician_break_windows")
    op.drop_table("technician_break_windows")

    op.drop_index("ix_technician_work_windows_technician_id", table_name="technician_work_windows")
    op.drop_index("ix_technician_work_windows_tenant_id", table_name="technician_work_windows")
    op.drop_table("technician_work_windows")
