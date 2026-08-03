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
    # PostgreSQL exige commit entre ADD VALUE e uso do novo valor.
    with op.get_context().autocommit_block():
        op.execute(
            """
            ALTER TYPE finance_account_type ADD VALUE IF NOT EXISTS 'cash';
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
