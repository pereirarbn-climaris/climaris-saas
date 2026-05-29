"""Tenant: tipo de documento (CPF/CNPJ).

Revision ID: 20260417_0006
Revises: 20260417_0005
Create Date: 2026-04-17
"""

import sqlalchemy as sa
from alembic import op

revision = "20260417_0006"
down_revision = "20260417_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("tax_id_kind", sa.String(length=8), nullable=False, server_default="cnpj"),
    )
    op.alter_column("tenants", "tax_id_kind", server_default=None)


def downgrade() -> None:
    op.drop_column("tenants", "tax_id_kind")
