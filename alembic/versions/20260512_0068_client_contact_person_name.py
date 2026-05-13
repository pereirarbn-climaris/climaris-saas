"""Client: contact person name (PJ).

Revision ID: 20260512_0068
Revises: 20260512_0067
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260512_0068"
down_revision: Union[str, None] = "20260512_0067"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("contact_person_name", sa.String(length=150), nullable=True))


def downgrade() -> None:
    op.drop_column("clients", "contact_person_name")
