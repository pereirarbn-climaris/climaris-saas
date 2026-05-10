"""Permissões de autonomia para IA em agendamento/cadastro.

Revision ID: 20260505_0062
Revises: 20260505_0061
Create Date: 2026-05-05
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260505_0062"
down_revision: Union[str, None] = "20260505_0061"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE tenant_ai_settings ADD COLUMN IF NOT EXISTS ai_allow_direct_schedule BOOLEAN NOT NULL DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE tenant_ai_settings ADD COLUMN IF NOT EXISTS ai_allow_auto_client_create BOOLEAN NOT NULL DEFAULT FALSE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE tenant_ai_settings DROP COLUMN IF EXISTS ai_allow_direct_schedule")
    op.execute("ALTER TABLE tenant_ai_settings DROP COLUMN IF EXISTS ai_allow_auto_client_create")

