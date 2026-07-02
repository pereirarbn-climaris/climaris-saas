"""Configurações de produtos por plano SaaS (estoque, compras, imagens).

Revision ID: 20260610_0132
Revises: 20260610_0131
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260610_0132"
down_revision: Union[str, None] = "20260610_0131"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "saas_plan_catalog",
        sa.Column("products_inventory_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "saas_plan_catalog",
        sa.Column("products_purchases_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "saas_plan_catalog",
        sa.Column("products_max_images", sa.Integer(), nullable=True),
    )
    op.alter_column("saas_plan_catalog", "products_inventory_enabled", server_default=None)
    op.alter_column("saas_plan_catalog", "products_purchases_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("saas_plan_catalog", "products_max_images")
    op.drop_column("saas_plan_catalog", "products_purchases_enabled")
    op.drop_column("saas_plan_catalog", "products_inventory_enabled")
