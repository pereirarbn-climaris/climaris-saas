"""Client: notes/tags; ClientSite (Unidades/Filiais): full unit fields.

Revision ID: 20260721_0149
Revises: 20260721_0148
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260721_0149"
down_revision: Union[str, None] = "20260721_0148"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column(
        "clients",
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
    )

    op.add_column(
        "client_sites",
        sa.Column("site_type", sa.String(length=30), nullable=False, server_default="filial"),
    )
    op.add_column("client_sites", sa.Column("nickname", sa.String(length=150), nullable=True))
    op.add_column("client_sites", sa.Column("responsible_role", sa.String(length=100), nullable=True))
    op.add_column("client_sites", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column(
        "client_sites",
        sa.Column("has_own_document", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("client_sites", sa.Column("document", sa.String(length=20), nullable=True))
    op.add_column("client_sites", sa.Column("trade_name", sa.String(length=150), nullable=True))
    op.add_column("client_sites", sa.Column("state_registration", sa.String(length=20), nullable=True))
    op.add_column("client_sites", sa.Column("municipal_registration", sa.String(length=20), nullable=True))
    op.add_column("client_sites", sa.Column("reference_point", sa.String(length=255), nullable=True))
    op.add_column(
        "client_sites",
        sa.Column("has_equipment", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "client_sites",
        sa.Column("participates_pmoc", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "client_sites",
        sa.Column("use_main_contacts", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "client_sites",
        sa.Column("use_main_billing_address", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "client_sites",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column("client_sites", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    for col in (
        "notes",
        "is_active",
        "use_main_billing_address",
        "use_main_contacts",
        "participates_pmoc",
        "has_equipment",
        "reference_point",
        "municipal_registration",
        "state_registration",
        "trade_name",
        "document",
        "has_own_document",
        "email",
        "responsible_role",
        "nickname",
        "site_type",
    ):
        op.drop_column("client_sites", col)

    op.drop_column("clients", "tags")
    op.drop_column("clients", "notes")
