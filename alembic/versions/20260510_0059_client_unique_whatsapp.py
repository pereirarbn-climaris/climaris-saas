"""make client whatsapp unique per tenant

Revision ID: 20260510_0059
Revises: 20260510_0058
Create Date: 2026-05-10 17:45:00
"""

from __future__ import annotations

from alembic import op


revision = "20260510_0059"
down_revision = "20260510_0058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE clients SET whatsapp = NULL WHERE whatsapp IS NOT NULL AND btrim(whatsapp) = ''")
    op.create_unique_constraint("uq_clients_tenant_whatsapp", "clients", ["tenant_id", "whatsapp"])


def downgrade() -> None:
    op.drop_constraint("uq_clients_tenant_whatsapp", "clients", type_="unique")
