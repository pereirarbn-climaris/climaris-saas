"""Client sites: razão social (legal_name) da unidade/filial com CNPJ próprio.

Revision ID: 20260721_0153
Revises: 20260721_0152
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260721_0153"
down_revision: Union[str, None] = "20260721_0152"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("client_sites", sa.Column("legal_name", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("client_sites", "legal_name")
