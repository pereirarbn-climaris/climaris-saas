"""Unique (service_order, equipment, service) pivot + dedupe legacy rows.

Revision ID: 20260518_0083
Revises: 20260522_0082
Create Date: 2026-05-18
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "20260518_0083"
down_revision: Union[str, None] = "20260522_0082"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Mescla linhas duplicadas (mesma OS + equipamento + serviço) somando quantidade.
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                service_order_id,
                equipment_id,
                service_id,
                quantity,
                ROW_NUMBER() OVER (
                    PARTITION BY service_order_id, equipment_id, service_id
                    ORDER BY id
                ) AS rn
            FROM service_order_service_items
        ),
        merged AS (
            SELECT
                service_order_id,
                equipment_id,
                service_id,
                MIN(id) AS keep_id,
                SUM(quantity) AS total_qty
            FROM ranked
            GROUP BY service_order_id, equipment_id, service_id
            HAVING COUNT(*) > 1
        )
        UPDATE service_order_service_items AS target
        SET quantity = merged.total_qty
        FROM merged
        WHERE target.id = merged.keep_id
        """
    )
    op.execute(
        """
        DELETE FROM service_order_service_items AS target
        USING (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY service_order_id, equipment_id, service_id
                    ORDER BY id
                ) AS rn
            FROM service_order_service_items
        ) AS ranked
        WHERE target.id = ranked.id AND ranked.rn > 1
        """
    )

    op.create_index(
        "uq_so_equipment_service_linked",
        "service_order_service_items",
        ["service_order_id", "equipment_id", "service_id"],
        unique=True,
        postgresql_where="equipment_id IS NOT NULL",
    )
    op.create_index(
        "uq_so_service_unlinked",
        "service_order_service_items",
        ["service_order_id", "service_id"],
        unique=True,
        postgresql_where="equipment_id IS NULL",
    )


def downgrade() -> None:
    op.drop_index("uq_so_service_unlinked", table_name="service_order_service_items")
    op.drop_index("uq_so_equipment_service_linked", table_name="service_order_service_items")
