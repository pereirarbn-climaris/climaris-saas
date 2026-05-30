"""Adiciona status awaiting_invoice em finance_entry_status."""

from alembic import op

revision = "20260611_0110"
down_revision = "20260610_0109"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE finance_entry_status ADD VALUE IF NOT EXISTS 'awaiting_invoice'")


def downgrade() -> None:
    pass
