"""Tenant CNPJá commercial enrichment (cadastro fiscal).

Revision ID: 20260620_0120
Revises: 20260620_0119
Create Date: 2026-06-20
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "20260620_0120"
down_revision: Union[str, None] = "20260620_0119"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("trade_name", sa.String(length=150), nullable=True))
    op.add_column("tenants", sa.Column("state_registration", sa.String(length=20), nullable=True))
    op.add_column("tenants", sa.Column("ie_indicator", sa.String(length=2), nullable=True))
    op.add_column("tenants", sa.Column("main_activity_code", sa.String(length=20), nullable=True))
    op.add_column("tenants", sa.Column("main_activity_description", sa.String(length=255), nullable=True))
    op.add_column("tenants", sa.Column("legal_nature", sa.String(length=150), nullable=True))
    op.add_column("tenants", sa.Column("registration_status", sa.String(length=80), nullable=True))
    op.add_column("tenants", sa.Column("founded_at", sa.Date(), nullable=True))
    op.add_column(
        "tenants",
        sa.Column("is_verified_cnpj", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("tenants", sa.Column("last_cnpj_commercial_update", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tenants", sa.Column("cnpj_commercial_json", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "cnpj_commercial_json")
    op.drop_column("tenants", "last_cnpj_commercial_update")
    op.drop_column("tenants", "is_verified_cnpj")
    op.drop_column("tenants", "founded_at")
    op.drop_column("tenants", "registration_status")
    op.drop_column("tenants", "legal_nature")
    op.drop_column("tenants", "main_activity_description")
    op.drop_column("tenants", "main_activity_code")
    op.drop_column("tenants", "ie_indicator")
    op.drop_column("tenants", "state_registration")
    op.drop_column("tenants", "trade_name")
