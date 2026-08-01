"""Client multi-contacts (nome, cargo, departamento, preferências de notificação).

Revision ID: 20260721_0147
Revises: 20260718_0146
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260721_0147"
down_revision: Union[str, None] = "20260718_0146"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "client_contacts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("role", sa.String(length=100), nullable=True),
        sa.Column("department", sa.String(length=100), nullable=True),
        sa.Column("whatsapp", sa.String(length=20), nullable=True),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("receives_service_orders", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("receives_pmoc", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("receives_financial", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_client_contacts_tenant_id", "client_contacts", ["tenant_id"])
    op.create_index("ix_client_contacts_client_id", "client_contacts", ["client_id"])


def downgrade() -> None:
    op.drop_index("ix_client_contacts_client_id", table_name="client_contacts")
    op.drop_index("ix_client_contacts_tenant_id", table_name="client_contacts")
    op.drop_table("client_contacts")
