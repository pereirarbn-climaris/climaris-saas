"""preventive auto whatsapp enabled flag on tenants

Revision ID: 20260605_0103
Revises: 20260605_0102
Create Date: 2026-06-05
"""

from alembic import op
import sqlalchemy as sa

revision = "20260605_0103"
down_revision = "20260605_0102"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("preventive_auto_whatsapp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("tenants", "preventive_auto_whatsapp_enabled", server_default=None)
    op.execute(
        "UPDATE tenants SET preventive_auto_whatsapp_enabled = true "
        "WHERE preventive_auto_remind_days_before > 0"
    )


def downgrade() -> None:
    op.drop_column("tenants", "preventive_auto_whatsapp_enabled")
