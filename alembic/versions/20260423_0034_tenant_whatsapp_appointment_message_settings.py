"""tenant whatsapp appointment message settings

Revision ID: 20260423_0034
Revises: 20260423_0033
Create Date: 2026-04-23 16:35:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260423_0034"
down_revision = "20260423_0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("whatsapp_appointment_template", sa.Text(), nullable=True))
    op.add_column("tenants", sa.Column("whatsapp_appointment_confirm_keyword", sa.String(length=20), nullable=True))
    op.add_column("tenants", sa.Column("whatsapp_appointment_reschedule_keyword", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "whatsapp_appointment_reschedule_keyword")
    op.drop_column("tenants", "whatsapp_appointment_confirm_keyword")
    op.drop_column("tenants", "whatsapp_appointment_template")
