"""add scheduled to order_status and migrate approved+active schedule

Revision ID: 20260424_0036
Revises: 20260424_0035
Create Date: 2026-04-24 12:00:00
"""

from __future__ import annotations

from alembic import op


revision = "20260424_0036"
down_revision = "20260424_0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL exige que o novo valor do ENUM seja commitado antes de usar em UPDATE.
    # Ver: psycopg.errors.UnsafeNewEnumValueUsage
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'scheduled'")
    op.execute(
        """
        UPDATE service_orders so
        SET status = 'scheduled'
        WHERE status = 'approved'
        AND EXISTS (
            SELECT 1 FROM schedules s
            WHERE s.service_order_id = so.id
            AND s.status != 'cancelled'
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE service_orders
        SET status = 'approved'
        WHERE status = 'scheduled'
        """
    )
    # PostgreSQL não remove valores de ENUM de forma trivial; manter 'scheduled' no tipo.
