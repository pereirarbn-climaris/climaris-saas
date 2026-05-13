"""Finance entries: Mercado Pago checkout preference id (audit / trace).

Revision ID: 20260511_0064
Revises: 20260511_0063
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260511_0064"
down_revision: Union[str, None] = "20260511_0063"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "finance_entries",
        sa.Column("gateway_preference_id", sa.String(length=48), nullable=True),
    )
    op.create_index(
        op.f("ix_finance_entries_gateway_preference_id"),
        "finance_entries",
        ["gateway_preference_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_finance_entries_gateway_preference_id"), table_name="finance_entries")
    op.drop_column("finance_entries", "gateway_preference_id")
