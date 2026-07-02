"""Tenant preventive WhatsApp AI toggle and fidelity level.

Revision ID: 20260618_0128
Revises: 20260626_0127
Create Date: 2026-06-18
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260618_0128"
down_revision: Union[str, None] = "20260626_0127"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column(
            "preventive_ai_message_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "tenants",
        sa.Column(
            "preventive_ai_message_fidelity",
            sa.String(length=16),
            nullable=False,
            server_default="faithful",
        ),
    )
    op.alter_column("tenants", "preventive_ai_message_enabled", server_default=None)
    op.alter_column("tenants", "preventive_ai_message_fidelity", server_default=None)


def downgrade() -> None:
    op.drop_column("tenants", "preventive_ai_message_fidelity")
    op.drop_column("tenants", "preventive_ai_message_enabled")
