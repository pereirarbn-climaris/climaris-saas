"""Overrides de gestão preventiva por equipamento + serviço.

Revision ID: 20260605_0101
Revises: 20260605_0100
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260605_0101"
down_revision = "20260605_0100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "equipment_service_preventive_overrides",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column("interval_value", sa.Integer(), nullable=False),
        sa.Column("interval_type", sa.String(length=16), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("equipment_id", "service_id", name="uq_equipment_service_preventive_override"),
    )
    op.create_index(
        "ix_equipment_service_preventive_overrides_equipment_id",
        "equipment_service_preventive_overrides",
        ["equipment_id"],
    )
    op.create_index(
        "ix_equipment_service_preventive_overrides_service_id",
        "equipment_service_preventive_overrides",
        ["service_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_equipment_service_preventive_overrides_service_id", table_name="equipment_service_preventive_overrides")
    op.drop_index("ix_equipment_service_preventive_overrides_equipment_id", table_name="equipment_service_preventive_overrides")
    op.drop_table("equipment_service_preventive_overrides")
