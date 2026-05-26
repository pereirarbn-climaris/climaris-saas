"""whatsapp appointment reply message templates

Revision ID: 20260531_0094
Revises: 20260530_0093
Create Date: 2026-05-31
"""

from alembic import op
import sqlalchemy as sa

revision = "20260531_0094"
down_revision = "20260530_0093"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("whatsapp_appointment_confirm_reply", sa.Text(), nullable=True))
    op.add_column("tenants", sa.Column("whatsapp_appointment_reschedule_reply", sa.Text(), nullable=True))
    op.add_column("tenants", sa.Column("whatsapp_appointment_cancel_reply", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "whatsapp_appointment_cancel_reply")
    op.drop_column("tenants", "whatsapp_appointment_reschedule_reply")
    op.drop_column("tenants", "whatsapp_appointment_confirm_reply")
