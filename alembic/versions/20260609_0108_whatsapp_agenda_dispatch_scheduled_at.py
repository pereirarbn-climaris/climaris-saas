"""whatsapp agenda dispatch scheduled_at on tenants

Revision ID: 20260609_0108
Revises: 20260608_0107
Create Date: 2026-06-09
"""

from alembic import op
import sqlalchemy as sa

revision = "20260609_0108"
down_revision = "20260608_0107"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("whatsapp_agenda_dispatch_scheduled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_tenants_whatsapp_agenda_dispatch_scheduled_at",
        "tenants",
        ["whatsapp_agenda_dispatch_scheduled_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_tenants_whatsapp_agenda_dispatch_scheduled_at", table_name="tenants")
    op.drop_column("tenants", "whatsapp_agenda_dispatch_scheduled_at")
