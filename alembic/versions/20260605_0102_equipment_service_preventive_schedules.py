"""Persistência de prazos preventivos por equipamento + serviço (ficha do aparelho).

Revision ID: 20260605_0102
Revises: 20260605_0101
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260605_0102"
down_revision = "20260605_0101"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "equipment_service_preventive_schedules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column("interval_value", sa.Integer(), nullable=False),
        sa.Column("interval_type", sa.String(length=16), nullable=False),
        sa.Column("last_performed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_service_order_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["last_service_order_id"], ["service_orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("equipment_id", "service_id", name="uq_equipment_service_preventive_schedule"),
    )
    op.create_index(
        "ix_equipment_service_preventive_schedules_equipment_id",
        "equipment_service_preventive_schedules",
        ["equipment_id"],
    )
    op.create_index(
        "ix_equipment_service_preventive_schedules_service_id",
        "equipment_service_preventive_schedules",
        ["service_id"],
    )
    op.create_index(
        "ix_equipment_service_preventive_schedules_next_due_at",
        "equipment_service_preventive_schedules",
        ["next_due_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_equipment_service_preventive_schedules_next_due_at", table_name="equipment_service_preventive_schedules")
    op.drop_index("ix_equipment_service_preventive_schedules_service_id", table_name="equipment_service_preventive_schedules")
    op.drop_index("ix_equipment_service_preventive_schedules_equipment_id", table_name="equipment_service_preventive_schedules")
    op.drop_table("equipment_service_preventive_schedules")
