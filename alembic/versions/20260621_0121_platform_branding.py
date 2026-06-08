"""Platform branding (logo, favicon, nome).

Revision ID: 20260621_0121
Revises: 20260620_0120
Create Date: 2026-06-21
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260621_0121"
down_revision: Union[str, None] = "20260620_0120"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platform_branding",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("platform_name", sa.String(length=120), nullable=False, server_default="Climaris"),
        sa.Column("logo_s3_key", sa.String(length=512), nullable=True),
        sa.Column("logo_url", sa.String(length=2000), nullable=True),
        sa.Column("logo_content_type", sa.String(length=80), nullable=True),
        sa.Column("logo_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("favicon_s3_key", sa.String(length=512), nullable=True),
        sa.Column("favicon_url", sa.String(length=2000), nullable=True),
        sa.Column("favicon_content_type", sa.String(length=80), nullable=True),
        sa.Column("favicon_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        sa.text("INSERT INTO platform_branding (id, platform_name) VALUES (1, 'Climaris')")
    )


def downgrade() -> None:
    op.drop_table("platform_branding")
