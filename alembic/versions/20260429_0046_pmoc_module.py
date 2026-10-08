"""PMOC module (Lei 13.589/2018) — plan per client address, equipment sheets, schedule, executions

Revision ID: 20260429_0046
Revises: 20260429_0045
Create Date: 2026-04-29

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260429_0046"
down_revision: Union[str, None] = "20260429_0045"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pmoc_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("version_label", sa.String(length=40), nullable=False, server_default="1.0"),
        sa.Column("establishment_snapshot_json", sa.Text(), nullable=True),
        sa.Column("law_reference_note", sa.Text(), nullable=True),
        sa.Column("internal_notes", sa.Text(), nullable=True),
        sa.Column("extras_json", sa.Text(), nullable=True),
        sa.Column("total_btu_sum", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("air_analysis_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("next_air_analysis_due", sa.Date(), nullable=True),
        sa.Column("responsible_name", sa.String(length=180), nullable=True),
        sa.Column("responsible_council", sa.String(length=16), nullable=True),
        sa.Column("responsible_registration", sa.String(length=80), nullable=True),
        sa.Column("art_number", sa.String(length=120), nullable=True),
        sa.Column("art_issued_at", sa.Date(), nullable=True),
        sa.Column("art_file_s3_key", sa.String(length=255), nullable=True),
        sa.Column("art_file_url", sa.String(length=500), nullable=True),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_pmoc_plans_client_id"), "pmoc_plans", ["client_id"], unique=False)
    op.create_index(op.f("ix_pmoc_plans_tenant_id"), "pmoc_plans", ["tenant_id"], unique=False)
    op.create_index("ix_pmoc_plans_tenant_status", "pmoc_plans", ["tenant_id", "status"], unique=False)

    op.execute(
        """
        CREATE UNIQUE INDEX uq_pmoc_one_active_per_client
        ON pmoc_plans (tenant_id, client_id)
        WHERE status = 'active'
        """
    )

    op.create_table(
        "pmoc_plan_equipments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pmoc_id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ficha_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pmoc_id"], ["pmoc_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pmoc_id", "equipment_id", name="uq_pmoc_plan_equipment"),
    )
    op.create_index(op.f("ix_pmoc_plan_equipments_equipment_id"), "pmoc_plan_equipments", ["equipment_id"], unique=False)
    op.create_index(op.f("ix_pmoc_plan_equipments_pmoc_id"), "pmoc_plan_equipments", ["pmoc_id"], unique=False)

    op.create_table(
        "pmoc_scheduled_activities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pmoc_id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=True),
        sa.Column("frequency", sa.String(length=20), nullable=False),
        sa.Column("task_code", sa.String(length=40), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_system_seed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["pmoc_id"], ["pmoc_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_pmoc_scheduled_activities_pmoc_id"), "pmoc_scheduled_activities", ["pmoc_id"], unique=False
    )

    op.create_table(
        "pmoc_executions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pmoc_id", sa.Integer(), nullable=False),
        sa.Column("scheduled_activity_id", sa.Integer(), nullable=True),
        sa.Column("equipment_id", sa.Integer(), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completion_status", sa.String(length=20), nullable=False, server_default="done"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("performed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("service_order_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["performed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["pmoc_id"], ["pmoc_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scheduled_activity_id"], ["pmoc_scheduled_activities.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["service_order_id"], ["service_orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_pmoc_executions_pmoc_id"), "pmoc_executions", ["pmoc_id"], unique=False)

    op.create_table(
        "pmoc_air_quality_analyses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pmoc_id", sa.Integer(), nullable=False),
        sa.Column("analysis_date", sa.Date(), nullable=False),
        sa.Column("lab_name", sa.String(length=200), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("next_due_date", sa.Date(), nullable=True),
        sa.Column("file_s3_key", sa.String(length=255), nullable=True),
        sa.Column("file_url", sa.String(length=500), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["pmoc_id"], ["pmoc_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_pmoc_air_quality_analyses_pmoc_id"), "pmoc_air_quality_analyses", ["pmoc_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_pmoc_air_quality_analyses_pmoc_id"), table_name="pmoc_air_quality_analyses")
    op.drop_table("pmoc_air_quality_analyses")
    op.drop_index(op.f("ix_pmoc_executions_pmoc_id"), table_name="pmoc_executions")
    op.drop_table("pmoc_executions")
    op.drop_index(op.f("ix_pmoc_scheduled_activities_pmoc_id"), table_name="pmoc_scheduled_activities")
    op.drop_table("pmoc_scheduled_activities")
    op.drop_index(op.f("ix_pmoc_plan_equipments_pmoc_id"), table_name="pmoc_plan_equipments")
    op.drop_index(op.f("ix_pmoc_plan_equipments_equipment_id"), table_name="pmoc_plan_equipments")
    op.drop_table("pmoc_plan_equipments")
    op.execute("DROP INDEX IF EXISTS uq_pmoc_one_active_per_client")
    op.drop_index("ix_pmoc_plans_tenant_status", table_name="pmoc_plans")
    op.drop_index(op.f("ix_pmoc_plans_tenant_id"), table_name="pmoc_plans")
    op.drop_index(op.f("ix_pmoc_plans_client_id"), table_name="pmoc_plans")
    op.drop_table("pmoc_plans")
