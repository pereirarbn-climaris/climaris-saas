"""User: flag operador da plataforma (painel /operacao, JWT).

Revision ID: 20260421_0014
Revises: 20260420_0013
Create Date: 2026-04-21
"""

import sqlalchemy as sa
from alembic import op

revision = "20260421_0014"
down_revision = "20260420_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_platform_operator", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(
        sa.text(
            "UPDATE users SET is_platform_operator = true "
            "WHERE lower(email) = lower('contato@climaris.com.br')"
        )
    )
    op.alter_column("users", "is_platform_operator", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "is_platform_operator")
