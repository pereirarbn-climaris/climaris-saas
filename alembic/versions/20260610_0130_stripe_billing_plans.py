"""Stripe billing: plan prices/IDs and tenant subscription fields.

Revision ID: 20260610_0130
Revises: 20260610_0129
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260610_0130"
down_revision: Union[str, None] = "20260610_0129"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "saas_plan_catalog",
        sa.Column("monthly_price_brl", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "saas_plan_catalog",
        sa.Column("stripe_product_id", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "saas_plan_catalog",
        sa.Column("stripe_price_id", sa.String(length=80), nullable=True),
    )

    op.add_column(
        "tenants",
        sa.Column("stripe_customer_id", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column("stripe_subscription_id", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column("subscription_status", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column("subscription_current_period_end", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_tenants_stripe_customer_id", "tenants", ["stripe_customer_id"], unique=True)
    op.create_index("ix_tenants_stripe_subscription_id", "tenants", ["stripe_subscription_id"], unique=True)

    op.create_table(
        "stripe_webhook_events",
        sa.Column("stripe_event_id", sa.String(length=80), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("stripe_event_id"),
    )


def downgrade() -> None:
    op.drop_table("stripe_webhook_events")
    op.drop_index("ix_tenants_stripe_subscription_id", table_name="tenants")
    op.drop_index("ix_tenants_stripe_customer_id", table_name="tenants")
    op.drop_column("tenants", "subscription_current_period_end")
    op.drop_column("tenants", "subscription_status")
    op.drop_column("tenants", "stripe_subscription_id")
    op.drop_column("tenants", "stripe_customer_id")
    op.drop_column("saas_plan_catalog", "stripe_price_id")
    op.drop_column("saas_plan_catalog", "stripe_product_id")
    op.drop_column("saas_plan_catalog", "monthly_price_brl")
