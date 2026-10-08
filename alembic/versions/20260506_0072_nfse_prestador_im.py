"""tenant_nfse_settings: inscrição municipal do prestador (DPS nacional).

Revision ID: 0072
Revises: 0071
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0072"
down_revision = "0071"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_nfse_settings",
        sa.Column("prestador_inscricao_municipal", sa.String(length=15), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenant_nfse_settings", "prestador_inscricao_municipal")
