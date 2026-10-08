"""Campos de contato no tenant para PDF.

Revision ID: 20260422_0020
Revises: 20260422_0019
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op

revision = "20260422_0020"
down_revision = "20260422_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("phone", sa.String(length=20), nullable=True))
    op.add_column("tenants", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column("tenants", sa.Column("website", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "website")
    op.drop_column("tenants", "email")
    op.drop_column("tenants", "phone")
