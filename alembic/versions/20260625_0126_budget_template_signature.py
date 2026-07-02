"""budget template signature image

Revision ID: 20260625_0126
Revises: 20260624_0125
Create Date: 2026-06-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260625_0126"
down_revision = "20260624_0125"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("budget_template_settings", sa.Column("signature_s3_key", sa.Text(), nullable=True))
    op.add_column("budget_template_settings", sa.Column("signature_url", sa.Text(), nullable=True))
    op.add_column("budget_template_settings", sa.Column("signature_content_type", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("budget_template_settings", "signature_content_type")
    op.drop_column("budget_template_settings", "signature_url")
    op.drop_column("budget_template_settings", "signature_s3_key")
