"""Campos de endereço e logo no tenant.

Revision ID: 20260422_0018
Revises: 20260422_0017
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op

revision = "20260422_0018"
down_revision = "20260422_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("address_street", sa.String(length=255), nullable=True))
    op.add_column("tenants", sa.Column("address_number", sa.String(length=20), nullable=True))
    op.add_column("tenants", sa.Column("address_complement", sa.String(length=120), nullable=True))
    op.add_column("tenants", sa.Column("address_district", sa.String(length=100), nullable=True))
    op.add_column("tenants", sa.Column("address_city", sa.String(length=100), nullable=True))
    op.add_column("tenants", sa.Column("address_state", sa.String(length=2), nullable=True))
    op.add_column("tenants", sa.Column("address_postal_code", sa.String(length=12), nullable=True))
    op.add_column("tenants", sa.Column("address_country", sa.String(length=60), nullable=False, server_default="Brasil"))
    op.add_column("tenants", sa.Column("address_ibge_code", sa.String(length=7), nullable=True))
    op.add_column("tenants", sa.Column("logo_s3_key", sa.String(length=255), nullable=True))
    op.add_column("tenants", sa.Column("logo_url", sa.String(length=500), nullable=True))
    op.add_column("tenants", sa.Column("logo_content_type", sa.String(length=80), nullable=True))
    op.add_column("tenants", sa.Column("logo_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "logo_updated_at")
    op.drop_column("tenants", "logo_content_type")
    op.drop_column("tenants", "logo_url")
    op.drop_column("tenants", "logo_s3_key")
    op.drop_column("tenants", "address_ibge_code")
    op.drop_column("tenants", "address_country")
    op.drop_column("tenants", "address_postal_code")
    op.drop_column("tenants", "address_state")
    op.drop_column("tenants", "address_city")
    op.drop_column("tenants", "address_district")
    op.drop_column("tenants", "address_complement")
    op.drop_column("tenants", "address_number")
    op.drop_column("tenants", "address_street")
