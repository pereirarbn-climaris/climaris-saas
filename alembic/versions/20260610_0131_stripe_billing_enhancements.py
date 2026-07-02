"""Preços sugeridos dos planos + Stripe nos add-ons da loja.

Revision ID: 20260610_0131
Revises: 20260610_0130
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260610_0131"
down_revision: Union[str, None] = "20260610_0130"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SUGGESTED_PRICES: dict[str, str] = {
    "basic": "99.00",
    "professional": "199.00",
    "enterprise": "399.00",
}


def upgrade() -> None:
    for plan_key, price in _SUGGESTED_PRICES.items():
        op.execute(
            sa.text(
                "UPDATE saas_plan_catalog SET monthly_price_brl = CAST(:price AS NUMERIC(12, 2)) "
                "WHERE plan_key = :plan_key AND monthly_price_brl IS NULL"
            ).bindparams(plan_key=plan_key, price=price)
        )

    op.add_column("marketplace_apps", sa.Column("stripe_product_id", sa.String(length=80), nullable=True))
    op.add_column("marketplace_apps", sa.Column("stripe_price_id", sa.String(length=80), nullable=True))
    op.add_column(
        "tenant_marketplace_entitlements",
        sa.Column("stripe_subscription_item_id", sa.String(length=80), nullable=True),
    )
    op.create_index(
        "ix_tenant_marketplace_entitlements_stripe_item",
        "tenant_marketplace_entitlements",
        ["stripe_subscription_item_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_tenant_marketplace_entitlements_stripe_item", table_name="tenant_marketplace_entitlements")
    op.drop_column("tenant_marketplace_entitlements", "stripe_subscription_item_id")
    op.drop_column("marketplace_apps", "stripe_price_id")
    op.drop_column("marketplace_apps", "stripe_product_id")
