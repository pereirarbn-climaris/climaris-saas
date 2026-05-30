"""Tabela de transações recorrentes e vínculo em finance_entries.

Revision ID: 20260610_0109
Revises: 20260609_0108
"""

from alembic import op
import sqlalchemy as sa

revision = "20260610_0109"
down_revision = "20260609_0108"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "finance_recurring_transactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="active",
        ),
        sa.Column("frequency", sa.String(length=16), nullable=False),
        sa.Column("day_of_month", sa.Integer(), nullable=True),
        sa.Column("weekday", sa.Integer(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("template_json", sa.Text(), nullable=False),
        sa.Column("last_generated_due_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_finance_recurring_transactions_tenant_id",
        "finance_recurring_transactions",
        ["tenant_id"],
    )
    op.create_index(
        "ix_finance_recurring_transactions_status",
        "finance_recurring_transactions",
        ["status"],
    )

    op.add_column(
        "finance_entries",
        sa.Column("recurring_transaction_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_finance_entries_recurring_transaction_id",
        "finance_entries",
        "finance_recurring_transactions",
        ["recurring_transaction_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_finance_entries_recurring_transaction_id",
        "finance_entries",
        ["recurring_transaction_id"],
    )
    op.create_index(
        "uq_finance_entry_recurring_due",
        "finance_entries",
        ["recurring_transaction_id", "due_date"],
        unique=True,
        postgresql_where=sa.text("recurring_transaction_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_finance_entry_recurring_due", table_name="finance_entries")
    op.drop_index("ix_finance_entries_recurring_transaction_id", table_name="finance_entries")
    op.drop_constraint("fk_finance_entries_recurring_transaction_id", "finance_entries", type_="foreignkey")
    op.drop_column("finance_entries", "recurring_transaction_id")
    op.drop_index("ix_finance_recurring_transactions_status", table_name="finance_recurring_transactions")
    op.drop_index("ix_finance_recurring_transactions_tenant_id", table_name="finance_recurring_transactions")
    op.drop_table("finance_recurring_transactions")
