"""Finance entry recipient whatsapp.

Revision ID: 20260423_0032
Revises: 20260423_0031
Create Date: 2026-04-23
"""

import sqlalchemy as sa
from alembic import op

revision = "20260423_0032"
down_revision = "20260423_0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("finance_entries", sa.Column("recipient_whatsapp", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("finance_entries", "recipient_whatsapp")
