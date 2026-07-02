"""Modelo preventivo padrão no envio (first | returning).

Revision ID: 20260622_0137
Revises: 20260622_0136
Create Date: 2026-06-22
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260622_0137"
down_revision: Union[str, None] = "20260622_0136"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column(
            "preventive_default_template_kind",
            sa.String(length=16),
            nullable=False,
            server_default="returning",
        ),
    )
    op.alter_column("tenants", "preventive_default_template_kind", server_default=None)


def downgrade() -> None:
    op.drop_column("tenants", "preventive_default_template_kind")
