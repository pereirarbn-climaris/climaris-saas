"""Finance entries: competence vs expected settlement (caixa).

Revision ID: 20260430_0052
Revises: 20260430_0051
Create Date: 2026-04-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260430_0052"
down_revision: Union[str, None] = "20260430_0051"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("finance_entries", sa.Column("competence_date", sa.Date(), nullable=True))
    op.add_column("finance_entries", sa.Column("expected_settlement_date", sa.Date(), nullable=True))
    op.add_column(
        "finance_entries",
        sa.Column("settlement_plan", sa.String(length=32), nullable=True),
    )
    op.execute(
        """
        UPDATE finance_entries
        SET competence_date = due_date,
            expected_settlement_date = due_date,
            settlement_plan = 'same_as_due'
        WHERE competence_date IS NULL;
        """
    )
    op.alter_column("finance_entries", "competence_date", nullable=False)
    op.alter_column("finance_entries", "expected_settlement_date", nullable=False)
    op.create_index(
        "ix_finance_entries_competence_date",
        "finance_entries",
        ["competence_date"],
        unique=False,
    )
    op.create_index(
        "ix_finance_entries_expected_settlement_date",
        "finance_entries",
        ["expected_settlement_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_finance_entries_expected_settlement_date", table_name="finance_entries")
    op.drop_index("ix_finance_entries_competence_date", table_name="finance_entries")
    op.drop_column("finance_entries", "settlement_plan")
    op.drop_column("finance_entries", "expected_settlement_date")
    op.drop_column("finance_entries", "competence_date")
