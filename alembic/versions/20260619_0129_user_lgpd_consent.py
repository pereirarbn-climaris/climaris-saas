"""User LGPD consent and website lead consent timestamp.

Revision ID: 20260619_0129
Revises: 20260611_0141, 20260618_0128
Create Date: 2026-06-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260619_0129"
down_revision: Union[str, Sequence[str], None] = ("20260611_0141", "20260618_0128")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("lgpd_accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("lgpd_policy_version", sa.String(length=20), nullable=True))
    op.add_column("website_leads", sa.Column("lgpd_consent_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("website_leads", "lgpd_consent_at")
    op.drop_column("users", "lgpd_policy_version")
    op.drop_column("users", "lgpd_accepted_at")
