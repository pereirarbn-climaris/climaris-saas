"""Service preventive interval: enabled, type (days/months/years), value 1-12.

Revision ID: 20260605_0100
Revises: 20260604_0099
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260605_0100"
down_revision = "20260604_0099"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "services",
        sa.Column("preventive_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "services",
        sa.Column("preventive_interval_type", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "services",
        sa.Column("preventive_interval_value", sa.Integer(), nullable=True),
    )

    op.execute(
        """
        UPDATE services
        SET preventive_enabled = true,
            preventive_interval_type = 'months',
            preventive_interval_value = periodicidade_meses
        WHERE periodicidade_meses IS NOT NULL
        """
    )

    op.drop_constraint("ck_services_periodicidade_meses", "services", type_="check")
    op.create_check_constraint(
        "ck_services_periodicidade_meses",
        "services",
        sa.text("periodicidade_meses IS NULL OR (periodicidade_meses >= 1 AND periodicidade_meses <= 144)"),
    )
    op.create_check_constraint(
        "ck_services_preventive_interval",
        "services",
        sa.text(
            "(preventive_enabled = false AND preventive_interval_type IS NULL AND preventive_interval_value IS NULL) "
            "OR (preventive_enabled = true AND preventive_interval_type IN ('days', 'months', 'years') "
            "AND preventive_interval_value IS NOT NULL AND preventive_interval_value >= 1)"
        ),
    )


def downgrade() -> None:
    op.drop_constraint("ck_services_preventive_interval", "services", type_="check")
    op.drop_constraint("ck_services_periodicidade_meses", "services", type_="check")
    op.create_check_constraint(
        "ck_services_periodicidade_meses",
        "services",
        sa.text("periodicidade_meses IS NULL OR periodicidade_meses IN (6, 12)"),
    )
    op.drop_column("services", "preventive_interval_value")
    op.drop_column("services", "preventive_interval_type")
    op.drop_column("services", "preventive_enabled")
