"""Marketplace apps catalog and tenant entitlements.

Revision ID: 20260422_0027
Revises: 20260422_0026
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op

revision = "20260422_0027"
down_revision = "20260422_0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "marketplace_apps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("short_description", sa.String(length=400), nullable=False),
        sa.Column("long_description", sa.Text(), nullable=True),
        sa.Column("monthly_price_brl", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("setup_fee_brl", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("feature_flag_key", sa.String(length=80), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_marketplace_apps_slug"),
    )
    op.create_index(op.f("ix_marketplace_apps_is_active"), "marketplace_apps", ["is_active"], unique=False)

    op.create_table(
        "tenant_marketplace_entitlements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("marketplace_app_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tenant_notes", sa.Text(), nullable=True),
        sa.Column("internal_notes", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["marketplace_app_id"], ["marketplace_apps.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "marketplace_app_id", name="uq_tenant_marketplace_app"),
    )
    op.create_index(
        op.f("ix_tenant_marketplace_entitlements_tenant_id"),
        "tenant_marketplace_entitlements",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_tenant_marketplace_entitlements_marketplace_app_id"),
        "tenant_marketplace_entitlements",
        ["marketplace_app_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_tenant_marketplace_entitlements_status"),
        "tenant_marketplace_entitlements",
        ["status"],
        unique=False,
    )

    op.execute(
        """
        INSERT INTO marketplace_apps (
            slug, display_name, short_description, long_description,
            monthly_price_brl, setup_fee_brl, feature_flag_key, sort_order, is_active
        ) VALUES (
            'mercado_livre',
            'Mercado Livre',
            'Publique e sincronize produtos do ERP com anúncios no Mercado Livre.',
            'Integração paga: após a contratação e confirmação do pagamento, a equipe Climaris libera o módulo no seu workspace. '
            'Inclui base para sincronização de catálogo e estoque (detalhes técnicos combinados na implantação).',
            149.90,
            0,
            'integration_mercado_livre',
            10,
            true
        )
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_tenant_marketplace_entitlements_status"), table_name="tenant_marketplace_entitlements")
    op.drop_index(op.f("ix_tenant_marketplace_entitlements_marketplace_app_id"), table_name="tenant_marketplace_entitlements")
    op.drop_index(op.f("ix_tenant_marketplace_entitlements_tenant_id"), table_name="tenant_marketplace_entitlements")
    op.drop_table("tenant_marketplace_entitlements")
    op.drop_index(op.f("ix_marketplace_apps_is_active"), table_name="marketplace_apps")
    op.drop_table("marketplace_apps")
