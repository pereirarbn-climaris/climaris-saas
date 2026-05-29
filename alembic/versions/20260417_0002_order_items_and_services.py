"""Add services and order item tables.

Revision ID: 20260417_0002
Revises: 20260417_0001
Create Date: 2026-04-17
"""

from alembic import op
import sqlalchemy as sa


revision = "20260417_0002"
down_revision = "20260417_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'approved'")

    op.create_table(
        "services",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_services_tenant_name"),
    )
    op.create_index("ix_services_tenant_id", "services", ["tenant_id"], unique=False)

    op.create_table(
        "service_order_service_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("service_order_id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["service_order_id"], ["service_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "ix_service_order_service_items_service_order_id", "service_order_service_items", ["service_order_id"], unique=False
    )
    op.create_index("ix_service_order_service_items_service_id", "service_order_service_items", ["service_id"], unique=False)

    op.create_table(
        "service_order_product_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("service_order_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.ForeignKeyConstraint(["service_order_id"], ["service_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "ix_service_order_product_items_service_order_id", "service_order_product_items", ["service_order_id"], unique=False
    )
    op.create_index("ix_service_order_product_items_product_id", "service_order_product_items", ["product_id"], unique=False)

    op.add_column("schedules", sa.Column("service_order_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_schedules_service_order_id_service_orders",
        "schedules",
        "service_orders",
        ["service_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint("uq_schedules_service_order_id", "schedules", ["service_order_id"])
    op.create_index("ix_schedules_service_order_id", "schedules", ["service_order_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_schedules_service_order_id", table_name="schedules")
    op.drop_constraint("uq_schedules_service_order_id", "schedules", type_="unique")
    op.drop_constraint("fk_schedules_service_order_id_service_orders", "schedules", type_="foreignkey")
    op.drop_column("schedules", "service_order_id")

    op.drop_index("ix_service_order_product_items_product_id", table_name="service_order_product_items")
    op.drop_index("ix_service_order_product_items_service_order_id", table_name="service_order_product_items")
    op.drop_table("service_order_product_items")

    op.drop_index("ix_service_order_service_items_service_id", table_name="service_order_service_items")
    op.drop_index("ix_service_order_service_items_service_order_id", table_name="service_order_service_items")
    op.drop_table("service_order_service_items")

    op.drop_index("ix_services_tenant_id", table_name="services")
    op.drop_table("services")
