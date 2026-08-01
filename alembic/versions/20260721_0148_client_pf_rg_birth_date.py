"""Client Pessoa Física: RG and birth date.

Revision ID: 20260721_0148
Revises: 20260721_0147
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260721_0148"
down_revision: Union[str, None] = "20260721_0147"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("rg", sa.String(length=20), nullable=True))
    op.add_column("clients", sa.Column("birth_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("clients", "birth_date")
    op.drop_column("clients", "rg")
