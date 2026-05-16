"""Chave pública Pagar.me (pk_*) para tokenização de cartão no browser.

Revision ID: 20260514_0072
Revises: 20260513_0071
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260514_0072"
down_revision: Union[str, None] = "20260513_0071"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("stone_public_key_encrypted", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenant_finance_gateways", "stone_public_key_encrypted")
