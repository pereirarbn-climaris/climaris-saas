"""Compras de produtos (financeiro + estoque).

Revision ID: 20260619_0118
Revises: 20260618_0117
Create Date: 2026-06-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260619_0118"
down_revision: Union[str, None] = "20260618_0117"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "product_purchases",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("finance_entry_id", sa.Integer(), nullable=False),
        sa.Column("supplier_name", sa.String(length=120), nullable=True),
        sa.Column("purchased_at", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["finance_entry_id"], ["finance_entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("finance_entry_id"),
    )
    op.create_index("ix_product_purchases_tenant_id", "product_purchases", ["tenant_id"])
    op.create_index("ix_product_purchases_purchased_at", "product_purchases", ["purchased_at"])

    op.create_table(
        "product_purchase_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("purchase_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column("unit_cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["purchase_id"], ["product_purchases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_product_purchase_lines_purchase_id", "product_purchase_lines", ["purchase_id"])
    op.create_index("ix_product_purchase_lines_product_id", "product_purchase_lines", ["product_id"])

    op.add_column(
        "stock_movements",
        sa.Column("product_purchase_id", sa.Integer(), nullable=True),
    )
    op.create_index("ix_stock_movements_product_purchase_id", "stock_movements", ["product_purchase_id"])
    op.create_foreign_key(
        "fk_stock_movements_product_purchase_id",
        "stock_movements",
        "product_purchases",
        ["product_purchase_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_stock_movements_product_purchase_id", "stock_movements", type_="foreignkey")
    op.drop_index("ix_stock_movements_product_purchase_id", table_name="stock_movements")
    op.drop_column("stock_movements", "product_purchase_id")
    op.drop_index("ix_product_purchase_lines_product_id", table_name="product_purchase_lines")
    op.drop_index("ix_product_purchase_lines_purchase_id", table_name="product_purchase_lines")
    op.drop_table("product_purchase_lines")
    op.drop_index("ix_product_purchases_purchased_at", table_name="product_purchases")
    op.drop_index("ix_product_purchases_tenant_id", table_name="product_purchases")
    op.drop_table("product_purchases")
