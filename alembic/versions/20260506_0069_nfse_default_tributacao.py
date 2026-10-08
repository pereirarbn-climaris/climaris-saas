"""Padrões fiscais NFS-e no tenant (cTribNac / NBS).

Revision ID: 0069
Revises: 0068
Create Date: 2026-05-06

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0069"
down_revision = "0068"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_nfse_settings",
        sa.Column("default_codigo_tributacao_nacional", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "tenant_nfse_settings",
        sa.Column("default_codigo_nbs", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenant_nfse_settings", "default_codigo_nbs")
    op.drop_column("tenant_nfse_settings", "default_codigo_tributacao_nacional")
