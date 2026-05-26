"""service_orders started_at and completed_at

Revision ID: 20260525_0086
Revises: 20260524_0085
Create Date: 2026-05-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260525_0086"
down_revision: Union[str, None] = "20260524_0085"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("service_orders", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("service_orders", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("service_orders", "completed_at")
    op.drop_column("service_orders", "started_at")
