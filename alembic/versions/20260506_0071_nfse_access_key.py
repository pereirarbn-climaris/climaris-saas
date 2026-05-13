"""nfse_invoices: chave de acesso NFS-e nacional.

Revision ID: 0071
Revises: 0070
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0071"
down_revision = "0070"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "nfse_invoices",
        sa.Column("nfse_access_key", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("nfse_invoices", "nfse_access_key")
