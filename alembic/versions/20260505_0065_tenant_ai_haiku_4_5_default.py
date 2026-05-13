"""Atualiza model_slug padrão Haiku 3 → Haiku 4.5 (20251201).

Revision ID: 20260505_0065
Revises: 20260505_0064
Create Date: 2026-05-05
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260505_0065"
down_revision: Union[str, None] = "20260505_0064"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NEW = "claude-haiku-4-5-20251201"


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE tenant_ai_settings
        SET model_slug = '{_NEW}'
        WHERE model_slug = 'claude-3-haiku-20240307'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE tenant_ai_settings
        SET model_slug = 'claude-3-haiku-20240307'
        WHERE model_slug = 'claude-haiku-4-5-20251201'
        """
    )
