"""Client addresses: finalidade de correspondência (use_for_correspondence).

Revision ID: 20260721_0152
Revises: 20260721_0151
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260721_0152"
down_revision: Union[str, None] = "20260721_0151"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "client_addresses",
        sa.Column("use_for_correspondence", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("client_addresses", "use_for_correspondence")
