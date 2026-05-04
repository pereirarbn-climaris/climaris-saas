"""Tenant whatsapp connection fields.

Revision ID: 20260423_0033
Revises: 20260423_0032
Create Date: 2026-04-23
"""

import sqlalchemy as sa
from alembic import op

revision = "20260423_0033"
down_revision = "20260423_0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("whatsapp_instance_name", sa.String(length=120), nullable=True))
    op.add_column("tenants", sa.Column("whatsapp_connection_status", sa.String(length=32), nullable=True))
    op.add_column("tenants", sa.Column("whatsapp_connected_at", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint("uq_tenants_whatsapp_instance_name", "tenants", ["whatsapp_instance_name"])


def downgrade() -> None:
    op.drop_constraint("uq_tenants_whatsapp_instance_name", "tenants", type_="unique")
    op.drop_column("tenants", "whatsapp_connected_at")
    op.drop_column("tenants", "whatsapp_connection_status")
    op.drop_column("tenants", "whatsapp_instance_name")
