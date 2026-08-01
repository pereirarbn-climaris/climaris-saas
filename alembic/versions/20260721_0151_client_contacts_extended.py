"""Client contacts: categoria, unidade/filial, permissões extras, contato principal.

Revision ID: 20260721_0151
Revises: 20260721_0150
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260721_0151"
down_revision: Union[str, None] = "20260721_0150"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "client_contacts",
        sa.Column(
            "client_site_id", sa.Integer(), sa.ForeignKey("client_sites.id", ondelete="SET NULL"), nullable=True
        ),
    )
    op.add_column(
        "client_contacts",
        sa.Column("category", sa.String(length=20), nullable=False, server_default="outros"),
    )
    op.add_column(
        "client_contacts",
        sa.Column("receives_contracts", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "client_contacts",
        sa.Column("receives_whatsapp_notifications", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "client_contacts",
        sa.Column("receives_automatic_emails", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "client_contacts",
        sa.Column("is_principal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "client_contacts",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column("client_contacts", sa.Column("notes", sa.Text(), nullable=True))
    op.create_index("ix_client_contacts_client_site_id", "client_contacts", ["client_site_id"])


def downgrade() -> None:
    op.drop_index("ix_client_contacts_client_site_id", table_name="client_contacts")
    op.drop_column("client_contacts", "notes")
    op.drop_column("client_contacts", "is_active")
    op.drop_column("client_contacts", "is_principal")
    op.drop_column("client_contacts", "receives_automatic_emails")
    op.drop_column("client_contacts", "receives_whatsapp_notifications")
    op.drop_column("client_contacts", "receives_contracts")
    op.drop_column("client_contacts", "category")
    op.drop_column("client_contacts", "client_site_id")
