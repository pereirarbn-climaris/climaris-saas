"""Códigos de tributação NFS-e nos serviços (catálogo).

Revision ID: 0068
Revises: 0067
Create Date: 2026-05-06

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0068"
down_revision = "0067"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "services",
        sa.Column("nfse_codigo_tributacao_nacional", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "services",
        sa.Column("nfse_codigo_nbs", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("services", "nfse_codigo_nbs")
    op.drop_column("services", "nfse_codigo_tributacao_nacional")
