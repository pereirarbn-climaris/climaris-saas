"""Campos AWS em platform_api_credentials.

Revision ID: 20260422_0017
Revises: 20260422_0016
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op

revision = "20260422_0017"
down_revision = "20260422_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("platform_api_credentials", sa.Column("aws_access_key_id", sa.Text(), nullable=True))
    op.add_column("platform_api_credentials", sa.Column("aws_access_key_id_preview", sa.String(length=32), nullable=True))
    op.add_column("platform_api_credentials", sa.Column("aws_secret_access_key", sa.Text(), nullable=True))
    op.add_column(
        "platform_api_credentials", sa.Column("aws_secret_access_key_preview", sa.String(length=32), nullable=True)
    )
    op.add_column("platform_api_credentials", sa.Column("aws_keys_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("platform_api_credentials", "aws_keys_updated_at")
    op.drop_column("platform_api_credentials", "aws_secret_access_key_preview")
    op.drop_column("platform_api_credentials", "aws_secret_access_key")
    op.drop_column("platform_api_credentials", "aws_access_key_id_preview")
    op.drop_column("platform_api_credentials", "aws_access_key_id")
