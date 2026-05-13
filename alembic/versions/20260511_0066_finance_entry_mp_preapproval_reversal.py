"""Finance entries: Mercado Pago preapproval id + estorno (auditoria).

Revision ID: 20260511_0066
Revises: 20260511_0065
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260511_0066"
down_revision: Union[str, None] = "20260511_0065"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "finance_entries",
        sa.Column("mercadopago_preapproval_id", sa.String(length=48), nullable=True),
    )
    op.create_index(
        op.f("ix_finance_entries_mercadopago_preapproval_id"),
        "finance_entries",
        ["mercadopago_preapproval_id"],
        unique=False,
    )
    op.add_column(
        "finance_entries",
        sa.Column("mp_reversal_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "finance_entries",
        sa.Column("mp_reversal_status", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("finance_entries", "mp_reversal_status")
    op.drop_column("finance_entries", "mp_reversal_at")
    op.drop_index(op.f("ix_finance_entries_mercadopago_preapproval_id"), table_name="finance_entries")
    op.drop_column("finance_entries", "mercadopago_preapproval_id")
