"""service_orders — tempo real de execução

Revision ID: 20260529_0090
Revises: 20260528_0089
Create Date: 2026-05-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260529_0090"
down_revision: Union[str, None] = "20260528_0089"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("service_orders", sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("service_orders", sa.Column("actual_duration_minutes", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("service_orders", "actual_duration_minutes")
    op.drop_column("service_orders", "finished_at")
