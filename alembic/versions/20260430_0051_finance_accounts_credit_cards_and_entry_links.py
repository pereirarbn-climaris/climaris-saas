"""Finance bank accounts, credit cards, and entry links.

Revision ID: 20260430_0051
Revises: 20260430_0050
Create Date: 2026-04-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260430_0051"
down_revision: Union[str, None] = "20260430_0050"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finance_account_type') THEN
                CREATE TYPE finance_account_type AS ENUM ('checking', 'savings', 'investment', 'digital_wallet', 'other');
            END IF;
        END
        $$;
        """
    )
    account_type_enum = postgresql.ENUM(
        "checking",
        "savings",
        "investment",
        "digital_wallet",
        "other",
        name="finance_account_type",
        create_type=False,
    )

    op.create_table(
        "finance_bank_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("bank_name", sa.String(length=80), nullable=True),
        sa.Column("account_type", account_type_enum, nullable=False, server_default="checking"),
        sa.Column("initial_balance", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_finance_bank_accounts_tenant_id"), "finance_bank_accounts", ["tenant_id"], unique=False)

    op.create_table(
        "finance_credit_cards",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("billing_account_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("brand", sa.String(length=40), nullable=False, server_default="other"),
        sa.Column("limit_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("closing_day", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("due_day", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["billing_account_id"], ["finance_bank_accounts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_finance_credit_cards_tenant_id"), "finance_credit_cards", ["tenant_id"], unique=False)
    op.create_index(
        op.f("ix_finance_credit_cards_billing_account_id"), "finance_credit_cards", ["billing_account_id"], unique=False
    )

    op.add_column("finance_entries", sa.Column("finance_account_id", sa.Integer(), nullable=True))
    op.add_column("finance_entries", sa.Column("credit_card_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_finance_entries_finance_account_id"), "finance_entries", ["finance_account_id"], unique=False)
    op.create_index(op.f("ix_finance_entries_credit_card_id"), "finance_entries", ["credit_card_id"], unique=False)
    op.create_foreign_key(
        "fk_finance_entries_finance_account_id",
        "finance_entries",
        "finance_bank_accounts",
        ["finance_account_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_finance_entries_credit_card_id",
        "finance_entries",
        "finance_credit_cards",
        ["credit_card_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_finance_entries_credit_card_id", "finance_entries", type_="foreignkey")
    op.drop_constraint("fk_finance_entries_finance_account_id", "finance_entries", type_="foreignkey")
    op.drop_index(op.f("ix_finance_entries_credit_card_id"), table_name="finance_entries")
    op.drop_index(op.f("ix_finance_entries_finance_account_id"), table_name="finance_entries")
    op.drop_column("finance_entries", "credit_card_id")
    op.drop_column("finance_entries", "finance_account_id")

    op.drop_index(op.f("ix_finance_credit_cards_billing_account_id"), table_name="finance_credit_cards")
    op.drop_index(op.f("ix_finance_credit_cards_tenant_id"), table_name="finance_credit_cards")
    op.drop_table("finance_credit_cards")

    op.drop_index(op.f("ix_finance_bank_accounts_tenant_id"), table_name="finance_bank_accounts")
    op.drop_table("finance_bank_accounts")

    op.execute("DROP TYPE IF EXISTS finance_account_type")
