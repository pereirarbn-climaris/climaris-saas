"""PMOC fase 2: normalização de edificação, ambientes, medições e consumíveis.

Revision ID: 20260627_0134
Revises: 20260627_0133
Create Date: 2026-06-27
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260627_0134"
down_revision: Union[str, None] = "20260627_0133"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pmoc_building_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pmoc_id", sa.Integer(), nullable=False),
        sa.Column("legal_representative", sa.String(length=180), nullable=True),
        sa.Column("state_registration", sa.String(length=40), nullable=True),
        sa.Column("activity_exercised", sa.String(length=180), nullable=True),
        sa.Column("contact_phone", sa.String(length=30), nullable=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("total_climatized_area_m2", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("floors_count", sa.Integer(), nullable=True),
        sa.Column("avg_occupants", sa.Integer(), nullable=True),
        sa.Column("operation_hours", sa.String(length=180), nullable=True),
        sa.Column("occupancy_type", sa.String(length=120), nullable=True),
        sa.Column("power_outage_procedure", sa.Text(), nullable=True),
        sa.Column("critical_failure_procedure", sa.Text(), nullable=True),
        sa.Column("annual_load_review_due", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["pmoc_id"], ["pmoc_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pmoc_id", name="uq_pmoc_building_profile_pmoc"),
    )
    op.create_index("ix_pmoc_building_profiles_pmoc_id", "pmoc_building_profiles", ["pmoc_id"])

    op.create_table(
        "pmoc_environments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pmoc_id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("environment_name", sa.String(length=180), nullable=False),
        sa.Column("area_m2", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("ceiling_height_m", sa.Numeric(precision=8, scale=3), nullable=True),
        sa.Column("air_volume_m3", sa.Numeric(precision=12, scale=3), nullable=True),
        sa.Column("avg_occupants", sa.Integer(), nullable=True),
        sa.Column("activity_type", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["pmoc_id"], ["pmoc_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pmoc_environments_pmoc_id", "pmoc_environments", ["pmoc_id"])

    op.create_table(
        "pmoc_execution_measurements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pmoc_execution_id", sa.Integer(), nullable=False),
        sa.Column("metric_group", sa.String(length=40), nullable=False),
        sa.Column("metric_key", sa.String(length=80), nullable=False),
        sa.Column("value_numeric", sa.Numeric(precision=14, scale=4), nullable=True),
        sa.Column("value_text", sa.String(length=255), nullable=True),
        sa.Column("unit", sa.String(length=24), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["pmoc_execution_id"], ["pmoc_executions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_pmoc_execution_measurements_pmoc_execution_id",
        "pmoc_execution_measurements",
        ["pmoc_execution_id"],
    )

    op.create_table(
        "pmoc_execution_service_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pmoc_execution_id", sa.Integer(), nullable=False),
        sa.Column("technician_name", sa.String(length=180), nullable=True),
        sa.Column("executed_service", sa.Text(), nullable=True),
        sa.Column("worked_hours", sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column("observations", sa.Text(), nullable=True),
        sa.Column("legal_signature_provider", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["pmoc_execution_id"], ["pmoc_executions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pmoc_execution_id", name="uq_pmoc_execution_service_log_execution"),
    )
    op.create_index(
        "ix_pmoc_execution_service_logs_pmoc_execution_id",
        "pmoc_execution_service_logs",
        ["pmoc_execution_id"],
    )

    op.create_table(
        "pmoc_execution_consumables",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pmoc_execution_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("lot_number", sa.String(length=120), nullable=True),
        sa.Column("validity_date", sa.Date(), nullable=True),
        sa.Column("quantity", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["pmoc_execution_id"], ["pmoc_executions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_pmoc_execution_consumables_pmoc_execution_id",
        "pmoc_execution_consumables",
        ["pmoc_execution_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_pmoc_execution_consumables_pmoc_execution_id", table_name="pmoc_execution_consumables")
    op.drop_table("pmoc_execution_consumables")

    op.drop_index("ix_pmoc_execution_service_logs_pmoc_execution_id", table_name="pmoc_execution_service_logs")
    op.drop_table("pmoc_execution_service_logs")

    op.drop_index("ix_pmoc_execution_measurements_pmoc_execution_id", table_name="pmoc_execution_measurements")
    op.drop_table("pmoc_execution_measurements")

    op.drop_index("ix_pmoc_environments_pmoc_id", table_name="pmoc_environments")
    op.drop_table("pmoc_environments")

    op.drop_index("ix_pmoc_building_profiles_pmoc_id", table_name="pmoc_building_profiles")
    op.drop_table("pmoc_building_profiles")
