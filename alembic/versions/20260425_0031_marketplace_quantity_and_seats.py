"""marketplace quantity and user seats support

Revision ID: 20260425_0031
Revises: 20260425_0041
Create Date: 2026-04-25
"""

import sqlalchemy as sa
from alembic import op

revision = "20260425_0031"
down_revision = "20260425_0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "marketplace_apps",
        sa.Column("allow_quantity", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("marketplace_apps", sa.Column("unit_label", sa.String(length=40), nullable=True))
    op.add_column(
        "marketplace_apps",
        sa.Column("user_seats_per_unit", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "tenant_marketplace_entitlements",
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
    )

    op.execute(
        """
        INSERT INTO marketplace_apps (
            slug, display_name, short_description, long_description,
            monthly_price_brl, setup_fee_brl, feature_flag_key, allow_quantity, unit_label, user_seats_per_unit, sort_order, is_active
        ) VALUES (
            'whatsapp',
            'WhatsApp Oficial',
            'Habilita integração oficial de WhatsApp para lembretes e confirmações.',
            'Contrate o módulo WhatsApp para envio de lembretes e notificações automatizadas para clientes.',
            49.90,
            0,
            'integration_whatsapp',
            false,
            null,
            0,
            20,
            true
        )
        ON CONFLICT (slug) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO marketplace_apps (
            slug, display_name, short_description, long_description,
            monthly_price_brl, setup_fee_brl, feature_flag_key, allow_quantity, unit_label, user_seats_per_unit, sort_order, is_active
        ) VALUES (
            'extra-user-seat',
            'Acesso extra por usuário',
            'Adicione acessos extras além do limite do seu plano.',
            'Cobrança mensal por usuário adicional contratado no workspace.',
            19.90,
            0,
            'extra_user_seat',
            true,
            'usuário',
            1,
            21,
            true
        )
        ON CONFLICT (slug) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM marketplace_apps WHERE slug IN ('whatsapp', 'extra-user-seat')")
    op.drop_column("tenant_marketplace_entitlements", "quantity")
    op.drop_column("marketplace_apps", "user_seats_per_unit")
    op.drop_column("marketplace_apps", "unit_label")
    op.drop_column("marketplace_apps", "allow_quantity")

