"""Product stock, movements, OS consumption marker.

Revision ID: 20260422_0026
Revises: 20260422_0025
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op

revision = "20260422_0026"
down_revision = "20260422_0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("stock_quantity", sa.Numeric(12, 3), nullable=False, server_default="0"),
    )
    op.add_column("service_orders", sa.Column("stock_consumed_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("quantity_delta", sa.Numeric(12, 3), nullable=False),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.Column("service_order_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_order_id"], ["service_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_stock_movements_tenant_id"), "stock_movements", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_stock_movements_product_id"), "stock_movements", ["product_id"], unique=False)
    op.create_index(op.f("ix_stock_movements_service_order_id"), "stock_movements", ["service_order_id"], unique=False)
    op.create_index(op.f("ix_stock_movements_created_at"), "stock_movements", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_stock_movements_created_at"), table_name="stock_movements")
    op.drop_index(op.f("ix_stock_movements_service_order_id"), table_name="stock_movements")
    op.drop_index(op.f("ix_stock_movements_product_id"), table_name="stock_movements")
    op.drop_index(op.f("ix_stock_movements_tenant_id"), table_name="stock_movements")
    op.drop_table("stock_movements")
    op.drop_column("service_orders", "stock_consumed_at")
    op.drop_column("products", "stock_quantity")
