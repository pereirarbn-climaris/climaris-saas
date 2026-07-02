"""Platform website legal entity fields (LGPD / CNPJA).

Revision ID: 20260620_0130
Revises: 20260619_0129
Create Date: 2026-06-20
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260620_0130"
down_revision: Union[str, None] = "20260619_0129"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("platform_website_settings", sa.Column("trade_name", sa.String(length=160), nullable=True))
    op.add_column("platform_website_settings", sa.Column("dpo_name", sa.String(length=120), nullable=True))
    op.add_column("platform_website_settings", sa.Column("dpo_email", sa.String(length=254), nullable=True))
    op.add_column(
        "platform_website_settings",
        sa.Column("is_verified_cnpj", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "platform_website_settings",
        sa.Column("cnpj_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.alter_column("platform_website_settings", "is_verified_cnpj", server_default=None)


def downgrade() -> None:
    op.drop_column("platform_website_settings", "cnpj_verified_at")
    op.drop_column("platform_website_settings", "is_verified_cnpj")
    op.drop_column("platform_website_settings", "dpo_email")
    op.drop_column("platform_website_settings", "dpo_name")
    op.drop_column("platform_website_settings", "trade_name")
