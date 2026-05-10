"""tenant_nfse_settings: canal NFS-e sugerido automaticamente (MEI nacional vs Focus).

Revision ID: 0070
Revises: 0069
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0070"
down_revision = "0069"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_nfse_settings",
        sa.Column("auto_nfse_provider", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenant_nfse_settings", "auto_nfse_provider")
