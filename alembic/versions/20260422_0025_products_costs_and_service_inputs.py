"""Add product buy/sell prices and service product inputs.

Revision ID: 20260422_0025
Revises: 20260422_0024
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op

revision = "20260422_0025"
down_revision = "20260422_0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("purchase_price", sa.Numeric(12, 2), nullable=False, server_default="0"))
    op.add_column("products", sa.Column("sale_price", sa.Numeric(12, 2), nullable=False, server_default="0"))
    op.execute("UPDATE products SET sale_price = unit_price")

    op.create_table(
        "service_product_inputs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False, server_default="1"),
        sa.Column("unit_cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("service_id", "product_id", name="uq_service_product_input"),
    )
    op.create_index(op.f("ix_service_product_inputs_service_id"), "service_product_inputs", ["service_id"], unique=False)
    op.create_index(op.f("ix_service_product_inputs_product_id"), "service_product_inputs", ["product_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_service_product_inputs_product_id"), table_name="service_product_inputs")
    op.drop_index(op.f("ix_service_product_inputs_service_id"), table_name="service_product_inputs")
    op.drop_table("service_product_inputs")
    op.drop_column("products", "sale_price")
    op.drop_column("products", "purchase_price")
