"""Finance: Asaas webhook tokens + gateway_payment_id on entries.

Revision ID: 20260430_0048
Revises: 20260430_0047
Create Date: 2026-04-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260430_0048"
down_revision: Union[str, None] = "20260430_0047"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "finance_entries",
        sa.Column("gateway_payment_id", sa.String(length=48), nullable=True),
    )
    op.create_index(
        op.f("ix_finance_entries_gateway_payment_id"),
        "finance_entries",
        ["gateway_payment_id"],
        unique=False,
    )
    op.create_index(
        "uq_finance_entries_tenant_gateway_payment_id",
        "finance_entries",
        ["tenant_id", "gateway_payment_id"],
        unique=True,
        postgresql_where=sa.text("gateway_payment_id IS NOT NULL"),
    )

    op.add_column(
        "tenant_finance_gateways",
        sa.Column("asaas_webhook_path_token", sa.String(length=48), nullable=True),
    )
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("asaas_webhook_auth_encrypted", sa.Text(), nullable=True),
    )
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("asaas_webhook_remote_id", sa.String(length=48), nullable=True),
    )
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("asaas_webhook_last_error", sa.String(length=500), nullable=True),
    )
    op.create_index(
        op.f("ix_tenant_finance_gateways_asaas_webhook_path_token"),
        "tenant_finance_gateways",
        ["asaas_webhook_path_token"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_tenant_finance_gateways_asaas_webhook_path_token"), table_name="tenant_finance_gateways")
    op.drop_column("tenant_finance_gateways", "asaas_webhook_last_error")
    op.drop_column("tenant_finance_gateways", "asaas_webhook_remote_id")
    op.drop_column("tenant_finance_gateways", "asaas_webhook_auth_encrypted")
    op.drop_column("tenant_finance_gateways", "asaas_webhook_path_token")

    op.drop_index("uq_finance_entries_tenant_gateway_payment_id", table_name="finance_entries")
    op.drop_index(op.f("ix_finance_entries_gateway_payment_id"), table_name="finance_entries")
    op.drop_column("finance_entries", "gateway_payment_id")
