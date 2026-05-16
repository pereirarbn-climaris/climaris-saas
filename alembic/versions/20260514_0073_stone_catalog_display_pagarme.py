"""Rótulo do catálogo: Stone passa a indicar Pagar.me no wizard.

Revision ID: 20260514_0073
Revises: 20260514_0072
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260514_0073"
down_revision: Union[str, None] = "20260514_0072"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE finance_bank_catalog SET display_label = :dl WHERE slug = :slug"
        ),
        {"slug": "stone", "dl": "Stone / Pagar.me"},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE finance_bank_catalog SET display_label = :dl WHERE slug = :slug"
        ),
        {"slug": "stone", "dl": "Stone"},
    )
