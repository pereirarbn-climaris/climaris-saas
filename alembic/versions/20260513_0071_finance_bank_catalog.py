"""Catálogo global de bancos/carteiras para o wizard de contas (operadora).

Revision ID: 20260513_0071
Revises: 20260513_0070
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260513_0071"
down_revision: Union[str, None] = "20260513_0070"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "finance_bank_catalog",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("bank_name", sa.String(length=80), nullable=False),
        sa.Column("display_label", sa.String(length=80), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("logo_external_url", sa.Text(), nullable=True),
        sa.Column("logo_file_token", sa.String(length=64), nullable=True),
        sa.Column("logo_mime", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_finance_bank_catalog_slug"),
        sa.UniqueConstraint("logo_file_token", name="uq_finance_bank_catalog_logo_token"),
    )
    op.create_index("ix_finance_bank_catalog_active_sort", "finance_bank_catalog", ["is_active", "sort_order"])

    conn = op.get_bind()
    rows = [
        ("bradesco", "Bradesco", "Bradesco", 10),
        ("santander", "Santander", "Santander", 20),
        ("banco_do_brasil", "Banco do Brasil", "Banco do Brasil", 30),
        ("caixa_economica", "Caixa Econômica", "Caixa", 40),
        ("itau", "Itaú", "Itaú", 50),
        ("inter", "Inter", "Inter", 60),
        ("nubank", "Nubank", "Nubank", 70),
        ("outros", "Outros", "Outros", 80),
        ("asaas", "Asaas", "Asaas", 90),
        ("mercado_pago", "Mercado Pago", "Mercado Pago", 100),
        ("stone", "Stone", "Stone", 110),
    ]
    for slug, bank_name, label, so in rows:
        conn.execute(
            sa.text(
                "INSERT INTO finance_bank_catalog (slug, bank_name, display_label, sort_order, is_active) "
                "VALUES (:slug, :bank_name, :label, :so, true) ON CONFLICT (slug) DO NOTHING"
            ),
            {"slug": slug, "bank_name": bank_name, "label": label, "so": so},
        )


def downgrade() -> None:
    op.drop_index("ix_finance_bank_catalog_active_sort", table_name="finance_bank_catalog")
    op.drop_table("finance_bank_catalog")
