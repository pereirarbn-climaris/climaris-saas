"""Tenant professional registration (CFT/CREA) for technical reports.

Revision ID: 20260618_0117
Revises: 20260617_0116
Create Date: 2026-06-18
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260618_0117"
down_revision: Union[str, None] = "20260617_0116"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("cft_number", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "cft_number")
