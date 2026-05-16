"""Stone (Pagar.me): credenciais, conta de conciliação e webhook no gateway financeiro.

Revision ID: 20260513_0069
Revises: 20260512_0068
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260513_0069"
down_revision: Union[str, None] = "20260512_0068"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TYPE finance_gateway_provider ADD VALUE IF NOT EXISTS 'stone'"))
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("stone_secret_key_encrypted", sa.Text(), nullable=True),
    )
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("stone_sandbox", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("stone_webhook_path_token", sa.String(length=48), nullable=True),
    )
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("stone_finance_bank_account_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        op.f("ix_tenant_finance_gateways_stone_wh_path"),
        "tenant_finance_gateways",
        ["stone_webhook_path_token"],
        unique=True,
    )
    op.create_foreign_key(
        op.f("fk_tfg_stone_finance_bank_account"),
        "tenant_finance_gateways",
        "finance_bank_accounts",
        ["stone_finance_bank_account_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_tfg_stone_finance_bank_account"), "tenant_finance_gateways", type_="foreignkey")
    op.drop_index(op.f("ix_tenant_finance_gateways_stone_wh_path"), table_name="tenant_finance_gateways")
    op.drop_column("tenant_finance_gateways", "stone_finance_bank_account_id")
    op.drop_column("tenant_finance_gateways", "stone_webhook_path_token")
    op.drop_column("tenant_finance_gateways", "stone_sandbox")
    op.drop_column("tenant_finance_gateways", "stone_secret_key_encrypted")
