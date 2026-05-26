"""products quantity_physical and quantity_reserved

Revision ID: 20260526_0087
Revises: 20260525_0086
Create Date: 2026-05-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260526_0087"
down_revision: Union[str, None] = "20260525_0086"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("quantity_physical", sa.Numeric(12, 3), nullable=False, server_default="0"),
    )
    op.add_column(
        "products",
        sa.Column("quantity_reserved", sa.Numeric(12, 3), nullable=False, server_default="0"),
    )
    op.execute(
        sa.text(
            "UPDATE products SET quantity_physical = COALESCE(stock_quantity, 0), quantity_reserved = 0"
        )
    )


def downgrade() -> None:
    op.drop_column("products", "quantity_reserved")
    op.drop_column("products", "quantity_physical")
