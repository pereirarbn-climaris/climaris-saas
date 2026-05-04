"""Finance module with plan-based advanced features.

Revision ID: 20260422_0023
Revises: 20260422_0022
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260422_0023"
down_revision = "20260422_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finance_entry_type') THEN
                CREATE TYPE finance_entry_type AS ENUM ('income', 'expense');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finance_entry_status') THEN
                CREATE TYPE finance_entry_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled');
            END IF;
        END
        $$;
        """
    )

    entry_type_enum = postgresql.ENUM(
        "income",
        "expense",
        name="finance_entry_type",
        create_type=False,
    )
    entry_status_enum = postgresql.ENUM(
        "pending",
        "paid",
        "overdue",
        "cancelled",
        name="finance_entry_status",
        create_type=False,
    )

    op.create_table(
        "finance_categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_finance_categories_tenant_name"),
    )
    op.create_index(op.f("ix_finance_categories_tenant_id"), "finance_categories", ["tenant_id"], unique=False)

    op.create_table(
        "finance_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("description", sa.String(length=180), nullable=False),
        sa.Column("entry_type", entry_type_enum, nullable=False),
        sa.Column("status", entry_status_enum, nullable=False, server_default="pending"),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["finance_categories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_finance_entries_tenant_id"), "finance_entries", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_finance_entries_category_id"), "finance_entries", ["category_id"], unique=False)
    op.create_index(op.f("ix_finance_entries_due_date"), "finance_entries", ["due_date"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_finance_entries_due_date"), table_name="finance_entries")
    op.drop_index(op.f("ix_finance_entries_category_id"), table_name="finance_entries")
    op.drop_index(op.f("ix_finance_entries_tenant_id"), table_name="finance_entries")
    op.drop_table("finance_entries")

    op.drop_index(op.f("ix_finance_categories_tenant_id"), table_name="finance_categories")
    op.drop_table("finance_categories")

    op.execute("DROP TYPE IF EXISTS finance_entry_status")
    op.execute("DROP TYPE IF EXISTS finance_entry_type")
