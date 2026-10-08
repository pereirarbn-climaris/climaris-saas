"""Mercado Pago: credenciais, produtos e webhook no gateway financeiro.

Revision ID: 20260511_0062
Revises: 20260510_0061
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260511_0062"
down_revision: Union[str, None] = "20260510_0061"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("mercadopago_access_token_encrypted", sa.Text(), nullable=True),
    )
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("mercadopago_public_key_encrypted", sa.Text(), nullable=True),
    )
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("mercadopago_sandbox", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("mercadopago_webhook_path_token", sa.String(length=48), nullable=True),
    )
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("mercadopago_products_json", sa.Text(), nullable=True),
    )
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("mercadopago_cached_balance", sa.Numeric(precision=18, scale=2), nullable=True),
    )
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("mercadopago_mp_user_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("mercadopago_finance_bank_account_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        op.f("ix_tenant_finance_gateways_mp_wh_path"),
        "tenant_finance_gateways",
        ["mercadopago_webhook_path_token"],
        unique=True,
    )
    op.create_foreign_key(
        op.f("fk_tfg_mp_finance_bank_account"),
        "tenant_finance_gateways",
        "finance_bank_accounts",
        ["mercadopago_finance_bank_account_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_tfg_mp_finance_bank_account"), "tenant_finance_gateways", type_="foreignkey")
    op.drop_index(op.f("ix_tenant_finance_gateways_mp_wh_path"), table_name="tenant_finance_gateways")
    op.drop_column("tenant_finance_gateways", "mercadopago_finance_bank_account_id")
    op.drop_column("tenant_finance_gateways", "mercadopago_mp_user_id")
    op.drop_column("tenant_finance_gateways", "mercadopago_cached_balance")
    op.drop_column("tenant_finance_gateways", "mercadopago_products_json")
    op.drop_column("tenant_finance_gateways", "mercadopago_webhook_path_token")
    op.drop_column("tenant_finance_gateways", "mercadopago_sandbox")
    op.drop_column("tenant_finance_gateways", "mercadopago_public_key_encrypted")
    op.drop_column("tenant_finance_gateways", "mercadopago_access_token_encrypted")
