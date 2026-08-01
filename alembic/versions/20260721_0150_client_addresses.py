"""Client multi-addresses (tipo, unidade/filial, uso em cobranca/pmoc/os).

Revision ID: 20260721_0150
Revises: 20260721_0149
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260721_0150"
down_revision: Union[str, None] = "20260721_0149"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "client_addresses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "client_site_id", sa.Integer(), sa.ForeignKey("client_sites.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("address_type", sa.String(length=20), nullable=False, server_default="outros"),
        sa.Column("street", sa.String(length=255), nullable=True),
        sa.Column("number", sa.String(length=20), nullable=True),
        sa.Column("complement", sa.String(length=120), nullable=True),
        sa.Column("neighborhood", sa.String(length=100), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=2), nullable=True),
        sa.Column("cep", sa.String(length=12), nullable=True),
        sa.Column("reference_point", sa.String(length=255), nullable=True),
        sa.Column("is_principal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("use_for_billing", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("use_for_pmoc", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("use_for_service_orders", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_client_addresses_tenant_id", "client_addresses", ["tenant_id"])
    op.create_index("ix_client_addresses_client_id", "client_addresses", ["client_id"])
    op.create_index("ix_client_addresses_client_site_id", "client_addresses", ["client_site_id"])


def downgrade() -> None:
    op.drop_index("ix_client_addresses_client_site_id", table_name="client_addresses")
    op.drop_index("ix_client_addresses_client_id", table_name="client_addresses")
    op.drop_index("ix_client_addresses_tenant_id", table_name="client_addresses")
    op.drop_table("client_addresses")
