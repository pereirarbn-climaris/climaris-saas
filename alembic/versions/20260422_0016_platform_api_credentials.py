"""Tabela platform_api_credentials (credenciais SaaS externas).

Revision ID: 20260422_0016
Revises: 20260422_0015
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op

revision = "20260422_0016"
down_revision = "20260422_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_api_credentials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider_slug", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("api_base_url", sa.String(length=255), nullable=True),
        sa.Column("api_key_secret", sa.Text(), nullable=True),
        sa.Column("api_key_preview", sa.String(length=32), nullable=True),
        sa.Column("extra_config_json", sa.Text(), nullable=True),
        sa.Column("key_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_slug", name="uq_platform_api_credentials_provider_slug"),
    )


def downgrade() -> None:
    op.drop_table("platform_api_credentials")
