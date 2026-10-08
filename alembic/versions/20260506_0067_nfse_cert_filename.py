"""Nome do arquivo do certificado MEI (referência na UI).

Revision ID: 0067
Revises: 20260506_0066
Create Date: 2026-05-06

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0067"
down_revision = "20260506_0066"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_nfse_settings",
        sa.Column("mei_certificate_file_name", sa.String(length=260), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenant_nfse_settings", "mei_certificate_file_name")
