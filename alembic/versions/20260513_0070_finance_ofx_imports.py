"""OFX: importações e linhas de extrato para conciliação.

Revision ID: 20260513_0070
Revises: 20260513_0069
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260513_0070"
down_revision: Union[str, None] = "20260513_0069"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "finance_ofx_imports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("finance_bank_account_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["finance_bank_account_id"], ["finance_bank_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_finance_ofx_imports_tenant_id"), "finance_ofx_imports", ["tenant_id"], unique=False)
    op.create_index(
        op.f("ix_finance_ofx_imports_finance_bank_account_id"),
        "finance_ofx_imports",
        ["finance_bank_account_id"],
        unique=False,
    )

    op.create_table(
        "finance_ofx_statement_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("import_id", sa.Integer(), nullable=False),
        sa.Column("fit_id", sa.String(length=128), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("posted_at", sa.Date(), nullable=False),
        sa.Column("trn_type", sa.String(length=32), nullable=True),
        sa.Column("payee", sa.String(length=500), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("matched_finance_entry_id", sa.Integer(), nullable=True),
        sa.Column("matched_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["import_id"], ["finance_ofx_imports.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matched_finance_entry_id"], ["finance_entries.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("import_id", "fit_id", name="uq_fin_ofx_line_import_fit"),
    )
    op.create_index(
        op.f("ix_finance_ofx_statement_lines_import_id"),
        "finance_ofx_statement_lines",
        ["import_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_finance_ofx_statement_lines_posted_at"),
        "finance_ofx_statement_lines",
        ["posted_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_finance_ofx_statement_lines_matched_finance_entry_id"),
        "finance_ofx_statement_lines",
        ["matched_finance_entry_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_finance_ofx_statement_lines_matched_finance_entry_id"), table_name="finance_ofx_statement_lines")
    op.drop_index(op.f("ix_finance_ofx_statement_lines_posted_at"), table_name="finance_ofx_statement_lines")
    op.drop_index(op.f("ix_finance_ofx_statement_lines_import_id"), table_name="finance_ofx_statement_lines")
    op.drop_table("finance_ofx_statement_lines")
    op.drop_index(op.f("ix_finance_ofx_imports_finance_bank_account_id"), table_name="finance_ofx_imports")
    op.drop_index(op.f("ix_finance_ofx_imports_tenant_id"), table_name="finance_ofx_imports")
    op.drop_table("finance_ofx_imports")
