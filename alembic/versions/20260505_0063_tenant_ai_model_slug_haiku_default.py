"""Normaliza model_slug legado de Sonnet para Haiku (economia de API).

Revision ID: 20260505_0063
Revises: 20260505_0062
Create Date: 2026-05-05
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260505_0063"
down_revision: Union[str, None] = "20260505_0062"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE tenant_ai_settings
        SET model_slug = 'claude-3-haiku-20240307'
        WHERE model_slug IN (
            'claude-3-5-sonnet-latest',
            'claude-sonnet-4-6',
            'claude-sonnet-4-20250514'
        )
        """
    )


def downgrade() -> None:
    # Não há como recuperar o slug exato por tenant após o upgrade.
    pass
