"""Add finance_account_type enum value: cash (caixa / dinheiro).

Revision ID: 20260430_0056
Revises: 20260430_0055
Create Date: 2026-04-30
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260430_0056"
down_revision: Union[str, None] = "20260430_0055"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_enum e
                JOIN pg_type t ON e.enumtypid = t.oid
                WHERE t.typname = 'finance_account_type'
                  AND e.enumlabel = 'cash'
            ) THEN
                ALTER TYPE finance_account_type ADD VALUE 'cash';
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        UPDATE finance_bank_accounts
        SET account_type = 'cash'::finance_account_type
        WHERE lower(trim(name)) = 'caixa'
          AND account_type::text = 'other';
        """
    )


def downgrade() -> None:
    # PostgreSQL não remove valores de ENUM de forma trivial; manter 'cash' no tipo.
    pass
