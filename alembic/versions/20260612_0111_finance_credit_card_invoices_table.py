"""Tabela finance_credit_card_invoices e FK em finance_entries."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260612_0111"
down_revision = "20260611_0110"
branch_labels = None
depends_on = None

invoice_status = postgresql.ENUM(
    "open",
    "closed",
    "paid",
    name="finance_credit_card_invoice_status",
    create_type=False,
)


def upgrade() -> None:
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE finance_credit_card_invoice_status AS ENUM ('open', 'closed', 'paid');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )
    op.create_table(
        "finance_credit_card_invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "credit_card_id",
            sa.Integer(),
            sa.ForeignKey("finance_credit_cards.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            invoice_status,
            nullable=False,
            server_default="open",
        ),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column(
            "finance_entry_id",
            sa.Integer(),
            sa.ForeignKey("finance_entries.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_fin_cc_invoice_tenant_card_due",
        "finance_credit_card_invoices",
        ["tenant_id", "credit_card_id", "due_date"],
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_fin_cc_invoice_card_due_active
        ON finance_credit_card_invoices (credit_card_id, due_date)
        WHERE status IN ('open', 'closed')
        """
    )
    op.add_column(
        "finance_entries",
        sa.Column(
            "credit_card_invoice_id",
            sa.Integer(),
            sa.ForeignKey("finance_credit_card_invoices.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_finance_entries_credit_card_invoice_id", "finance_entries", ["credit_card_invoice_id"])


def downgrade() -> None:
    op.drop_index("ix_finance_entries_credit_card_invoice_id", table_name="finance_entries")
    op.drop_column("finance_entries", "credit_card_invoice_id")
    op.execute("DROP INDEX IF EXISTS uq_fin_cc_invoice_card_due_active")
    op.drop_table("finance_credit_card_invoices")
    invoice_status.drop(op.get_bind(), checkfirst=True)
