"""service_orders discount_amount

Revision ID: 20260425_0042
Revises: 20260425_0041
Create Date: 2026-04-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260425_0042"
down_revision: Union[str, None] = "20260425_0041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "service_orders",
        sa.Column("discount_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("service_orders", "discount_amount")
