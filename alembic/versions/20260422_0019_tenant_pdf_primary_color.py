"""Cor principal do PDF por tenant.

Revision ID: 20260422_0019
Revises: 20260422_0018
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op

revision = "20260422_0019"
down_revision = "20260422_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("pdf_primary_color", sa.String(length=7), nullable=False, server_default="#0B7FAF"),
    )


def downgrade() -> None:
    op.drop_column("tenants", "pdf_primary_color")
