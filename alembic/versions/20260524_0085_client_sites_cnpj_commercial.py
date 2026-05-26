"""Client sites (filiais/obras), equipment site link, CNPJ commercial timestamp.

Revision ID: 20260524_0085
Revises: 20260523_0084
Create Date: 2026-05-24
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260524_0085"
down_revision: Union[str, None] = "20260523_0084"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clients",
        sa.Column("last_cnpj_commercial_update", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "client_sites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("street", sa.String(length=255), nullable=True),
        sa.Column("number", sa.String(length=20), nullable=True),
        sa.Column("neighborhood", sa.String(length=100), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=2), nullable=True),
        sa.Column("cep", sa.String(length=12), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_client_sites_tenant_id", "client_sites", ["tenant_id"])
    op.create_index("ix_client_sites_client_id", "client_sites", ["client_id"])
    op.add_column(
        "equipments",
        sa.Column("client_site_id", sa.Integer(), sa.ForeignKey("client_sites.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_equipments_client_site_id", "equipments", ["client_site_id"])
    op.add_column(
        "client_equipments",
        sa.Column("client_site_id", sa.Integer(), sa.ForeignKey("client_sites.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_client_equipments_client_site_id", "client_equipments", ["client_site_id"])


def downgrade() -> None:
    op.drop_index("ix_client_equipments_client_site_id", table_name="client_equipments")
    op.drop_column("client_equipments", "client_site_id")
    op.drop_index("ix_equipments_client_site_id", table_name="equipments")
    op.drop_column("equipments", "client_site_id")
    op.drop_index("ix_client_sites_client_id", table_name="client_sites")
    op.drop_index("ix_client_sites_tenant_id", table_name="client_sites")
    op.drop_table("client_sites")
    op.drop_column("clients", "last_cnpj_commercial_update")
