"""Add UI fields for service form (code, type, icon, photo, notes).

Revision ID: 20260718_0146
Revises: 20260708_0145
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260718_0146"
down_revision: Union[str, None] = "20260708_0145"
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


def downgrade() -> None:
    op.execute("ALTER TABLE services DROP COLUMN IF EXISTS notes")
    op.execute("ALTER TABLE services DROP COLUMN IF EXISTS icon_key")
    op.execute("ALTER TABLE services DROP COLUMN IF EXISTS require_photo")
    op.execute("ALTER TABLE services DROP COLUMN IF EXISTS service_type")
    op.execute("ALTER TABLE services DROP COLUMN IF EXISTS code")
