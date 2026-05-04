"""User: telefone e WhatsApp (cadastro / integrações futuras).

Revision ID: 20260418_0008
Revises: 20260418_0007
Create Date: 2026-04-18
"""

import sqlalchemy as sa
from alembic import op

revision = "20260418_0008"
down_revision = "20260418_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(length=20), nullable=True))
    op.add_column("users", sa.Column("whatsapp", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "whatsapp")
    op.drop_column("users", "phone")
