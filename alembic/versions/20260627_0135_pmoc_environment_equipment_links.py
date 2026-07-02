"""PMOC ambientes N:N com equipamentos.

Revision ID: 20260627_0135
Revises: 20260627_0134
Create Date: 2026-06-27 02:10:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260627_0135"
down_revision = "20260627_0134"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pmoc_environment_equipments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pmoc_environment_id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pmoc_environment_id"], ["pmoc_environments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pmoc_environment_id", "equipment_id", name="uq_pmoc_environment_equipment"),
    )
    op.create_index(
        "ix_pmoc_environment_equipments_pmoc_environment_id",
        "pmoc_environment_equipments",
        ["pmoc_environment_id"],
        unique=False,
    )
    op.create_index(
        "ix_pmoc_environment_equipments_equipment_id",
        "pmoc_environment_equipments",
        ["equipment_id"],
        unique=False,
    )

    op.execute(
        """
        INSERT INTO pmoc_environment_equipments (pmoc_environment_id, equipment_id)
        SELECT id, equipment_id
        FROM pmoc_environments
        WHERE equipment_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_pmoc_environment_equipments_equipment_id", table_name="pmoc_environment_equipments")
    op.drop_index("ix_pmoc_environment_equipments_pmoc_environment_id", table_name="pmoc_environment_equipments")
    op.drop_table("pmoc_environment_equipments")
