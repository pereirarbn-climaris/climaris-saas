"""tenant whatsapp automation enabled toggle

Revision ID: 20260601_0095
Revises: 20260531_0094
Create Date: 2026-06-01
"""

from alembic import op
import sqlalchemy as sa

revision = "20260601_0095"
down_revision = "20260531_0094"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("whatsapp_automation_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Tenants já conectados mantêm automação ativa para não interromper produção.
    op.execute(
        """
        UPDATE tenants
        SET whatsapp_automation_enabled = TRUE
        WHERE whatsapp_instance_name IS NOT NULL
          AND LOWER(COALESCE(whatsapp_connection_status, '')) IN ('connected', 'open')
        """
    )
    op.alter_column("tenants", "whatsapp_automation_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("tenants", "whatsapp_automation_enabled")
