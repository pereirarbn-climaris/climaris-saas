"""Template de mensagem preventiva para primeira limpeza.

Revision ID: 20260622_0136
Revises: 20260622_0135
Create Date: 2026-06-22
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260622_0136"
down_revision: Union[str, None] = "20260622_0135"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("preventive_message_template_first", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "preventive_message_template_first")
