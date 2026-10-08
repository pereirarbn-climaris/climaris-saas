"""Tenant finance payment gateways (Asaas API key, encrypted).

Revision ID: 20260430_0047
Revises: 20260429_0046
Create Date: 2026-04-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260430_0047"
down_revision: Union[str, None] = "20260429_0046"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'finance_gateway_provider') THEN
                CREATE TYPE finance_gateway_provider AS ENUM ('asaas', 'mercadopago');
            END IF;
        END
        $$;
        """
    )
    provider_enum = postgresql.ENUM(
        "asaas",
        "mercadopago",
        name="finance_gateway_provider",
        create_type=False,
    )

    op.create_table(
        "tenant_finance_gateways",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("provider", provider_enum, nullable=False),
        sa.Column("asaas_api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("asaas_sandbox", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("last_validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_validation_error", sa.String(length=500), nullable=True),
        sa.Column("account_label", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "provider", name="uq_tenant_finance_gateway_provider"),
    )
    op.create_index(op.f("ix_tenant_finance_gateways_tenant_id"), "tenant_finance_gateways", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tenant_finance_gateways_tenant_id"), table_name="tenant_finance_gateways")
    op.drop_table("tenant_finance_gateways")
    op.execute("DROP TYPE IF EXISTS finance_gateway_provider")
