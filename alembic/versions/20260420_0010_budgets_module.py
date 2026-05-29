"""Budgets module and link to service orders.

Revision ID: 20260420_0010
Revises: 20260418_0009
Create Date: 2026-04-20
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260420_0010"
down_revision = "20260418_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Cria o tipo apenas se ainda não existir (evita DuplicateObject em ambientes parcialmente migrados)
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'budget_status') THEN
                CREATE TYPE budget_status AS ENUM ('draft', 'sent', 'approved', 'rejected', 'expired');
            END IF;
        END
        $$;
        """
    )

    budget_status_enum = postgresql.ENUM(
        "draft",
        "sent",
        "approved",
        "rejected",
        "expired",
        name="budget_status",
        create_type=False,
    )

    op.create_table(
        "budgets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            budget_status_enum,
            nullable=False,
            server_default="draft",
        ),
        sa.Column("payment_method", sa.String(length=120), nullable=True),
        sa.Column("payment_terms", sa.Text(), nullable=True),
        sa.Column("warranty_terms", sa.Text(), nullable=True),
        sa.Column("validity_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_budgets_tenant_id"), "budgets", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_budgets_client_id"), "budgets", ["client_id"], unique=False)

    op.create_table(
        "budget_service_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("budget_id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="30"),
        sa.ForeignKeyConstraint(["budget_id"], ["budgets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_budget_service_items_budget_id"), "budget_service_items", ["budget_id"], unique=False)
    op.create_index(op.f("ix_budget_service_items_service_id"), "budget_service_items", ["service_id"], unique=False)

    op.create_table(
        "budget_product_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("budget_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["budget_id"], ["budgets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_budget_product_items_budget_id"), "budget_product_items", ["budget_id"], unique=False)
    op.create_index(op.f("ix_budget_product_items_product_id"), "budget_product_items", ["product_id"], unique=False)

    op.add_column("service_orders", sa.Column("source_budget_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_service_orders_source_budget_id"), "service_orders", ["source_budget_id"], unique=True)
    op.create_foreign_key(
        "fk_service_orders_source_budget_id",
        "service_orders",
        "budgets",
        ["source_budget_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_service_orders_source_budget_id", "service_orders", type_="foreignkey")
    op.drop_index(op.f("ix_service_orders_source_budget_id"), table_name="service_orders")
    op.drop_column("service_orders", "source_budget_id")

    op.drop_index(op.f("ix_budget_product_items_product_id"), table_name="budget_product_items")
    op.drop_index(op.f("ix_budget_product_items_budget_id"), table_name="budget_product_items")
    op.drop_table("budget_product_items")

    op.drop_index(op.f("ix_budget_service_items_service_id"), table_name="budget_service_items")
    op.drop_index(op.f("ix_budget_service_items_budget_id"), table_name="budget_service_items")
    op.drop_table("budget_service_items")

    op.drop_index(op.f("ix_budgets_client_id"), table_name="budgets")
    op.drop_index(op.f("ix_budgets_tenant_id"), table_name="budgets")
    op.drop_table("budgets")

    op.execute("DROP TYPE IF EXISTS budget_status")
