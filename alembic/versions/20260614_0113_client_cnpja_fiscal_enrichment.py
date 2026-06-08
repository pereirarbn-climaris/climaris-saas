"""Client CNPJá enrichment fields (CNAE, natureza, situação, abertura).

Revision ID: 20260614_0113
Revises: 20260613_0112
Create Date: 2026-06-14
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260614_0113"
down_revision: Union[str, None] = "20260613_0112"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("main_activity_code", sa.String(length=20), nullable=True))
    op.add_column("clients", sa.Column("main_activity_description", sa.String(length=255), nullable=True))
    op.add_column("clients", sa.Column("legal_nature", sa.String(length=150), nullable=True))
    op.add_column("clients", sa.Column("registration_status", sa.String(length=80), nullable=True))
    op.add_column("clients", sa.Column("founded_at", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("clients", "founded_at")
    op.drop_column("clients", "registration_status")
    op.drop_column("clients", "legal_nature")
    op.drop_column("clients", "main_activity_description")
    op.drop_column("clients", "main_activity_code")
