"""make client document optional and phone unique per tenant

Revision ID: 20260425_0040
Revises: 20260425_0039
Create Date: 2026-04-25 13:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260425_0040"
down_revision = "20260425_0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("clients", "document", existing_type=sa.String(length=20), nullable=True)
    op.create_unique_constraint("uq_clients_tenant_phone", "clients", ["tenant_id", "phone"])


def downgrade() -> None:
    op.drop_constraint("uq_clients_tenant_phone", "clients", type_="unique")
    op.alter_column("clients", "document", existing_type=sa.String(length=20), nullable=False)
