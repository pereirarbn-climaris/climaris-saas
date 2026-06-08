"""Contact fields on client sites (filiais/obras).

Revision ID: 20260615_0114
Revises: 20260614_0113
Create Date: 2026-06-15
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260615_0114"
down_revision: Union[str, None] = "20260614_0113"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("client_sites", sa.Column("contact_name", sa.String(length=150), nullable=True))
    op.add_column("client_sites", sa.Column("phone", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("client_sites", "phone")
    op.drop_column("client_sites", "contact_name")
