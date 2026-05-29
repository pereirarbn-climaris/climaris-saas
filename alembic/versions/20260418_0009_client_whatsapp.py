"""Client: WhatsApp separado do telefone (mensagens futuras).

Revision ID: 20260418_0009
Revises: 20260418_0008
Create Date: 2026-04-18
"""

import sqlalchemy as sa
from alembic import op

revision = "20260418_0009"
down_revision = "20260418_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("whatsapp", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("clients", "whatsapp")
