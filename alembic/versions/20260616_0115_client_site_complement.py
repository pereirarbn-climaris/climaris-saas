"""Complement field on client sites (filiais/obras).

Revision ID: 20260616_0115
Revises: 20260615_0114
Create Date: 2026-06-16
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260616_0115"
down_revision: Union[str, None] = "20260615_0114"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("client_sites", sa.Column("complement", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("client_sites", "complement")
