"""tenant_nfse_settings: série da DPS nacional (ex.: 70000).

Revision ID: 0074
Revises: 0073
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0074"
down_revision = "0073"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_nfse_settings",
        sa.Column("dps_serie", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenant_nfse_settings", "dps_serie")
