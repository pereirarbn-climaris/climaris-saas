"""Client: flag CNPJ validado na Receita (CNPJA).

Revision ID: 20260516_0075
Revises: 20260514_0074
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260516_0075"
down_revision: Union[str, None] = "20260514_0074"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clients",
        sa.Column("is_verified_cnpj", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("clients", "is_verified_cnpj")
