"""Anexos S3 de contratos comerciais do cliente.

Revision ID: 20260722_0154
Revises: 20260721_0153
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260722_0154"
down_revision: Union[str, None] = "20260721_0153"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "client_contract_attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "client_contract_id",
            sa.Integer(),
            sa.ForeignKey("client_contracts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("file_type", sa.String(length=80), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("file_s3_key", sa.String(length=500), nullable=True),
        sa.Column("file_url", sa.String(length=800), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column(
            "uploaded_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_client_contract_attachments_client_contract_id",
        "client_contract_attachments",
        ["client_contract_id"],
    )
    op.create_index(
        "ix_client_contract_attachments_uploaded_by_user_id",
        "client_contract_attachments",
        ["uploaded_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_client_contract_attachments_uploaded_by_user_id", table_name="client_contract_attachments")
    op.drop_index("ix_client_contract_attachments_client_contract_id", table_name="client_contract_attachments")
    op.drop_table("client_contract_attachments")
