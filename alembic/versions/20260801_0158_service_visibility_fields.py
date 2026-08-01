"""Service visibility flags (OS, PMOC, contract) and form UI columns on model.

Revision ID: 20260801_0158
Revises: 20260731_0157
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "20260801_0158"
down_revision: Union[str, None] = "20260731_0157"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE services ADD COLUMN IF NOT EXISTS code VARCHAR(40)")
    op.execute("ALTER TABLE services ADD COLUMN IF NOT EXISTS service_type VARCHAR(40)")
    op.execute(
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS require_photo BOOLEAN NOT NULL DEFAULT FALSE"
    )
    op.execute("ALTER TABLE services ADD COLUMN IF NOT EXISTS icon_key VARCHAR(32)")
    op.execute("ALTER TABLE services ADD COLUMN IF NOT EXISTS notes TEXT")
    op.execute(
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS visible_in_service_order BOOLEAN NOT NULL DEFAULT TRUE"
    )
    op.execute(
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS visible_in_pmoc BOOLEAN NOT NULL DEFAULT TRUE"
    )
    op.execute(
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS visible_in_contract BOOLEAN NOT NULL DEFAULT TRUE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE services DROP COLUMN IF EXISTS visible_in_contract")
    op.execute("ALTER TABLE services DROP COLUMN IF EXISTS visible_in_pmoc")
    op.execute("ALTER TABLE services DROP COLUMN IF EXISTS visible_in_service_order")
    op.execute("ALTER TABLE services DROP COLUMN IF EXISTS notes")
    op.execute("ALTER TABLE services DROP COLUMN IF EXISTS icon_key")
    op.execute("ALTER TABLE services DROP COLUMN IF EXISTS require_photo")
    op.execute("ALTER TABLE services DROP COLUMN IF EXISTS service_type")
    op.execute("ALTER TABLE services DROP COLUMN IF EXISTS code")
