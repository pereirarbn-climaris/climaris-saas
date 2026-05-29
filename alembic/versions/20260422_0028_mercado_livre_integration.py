"""Product images and Mercado Livre integration tables.

Revision ID: 20260422_0028
Revises: 20260422_0027
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op

revision = "20260422_0028"
down_revision = "20260422_0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_images",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("public_url", sa.String(length=768), nullable=False),
        sa.Column("s3_key", sa.String(length=512), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_product_images_product_id"), "product_images", ["product_id"], unique=False)
    op.create_index(op.f("ix_product_images_tenant_id"), "product_images", ["tenant_id"], unique=False)

    op.create_table(
        "tenant_mercado_livre_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("ml_user_id", sa.String(length=32), nullable=False),
        sa.Column("nickname", sa.String(length=120), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("site_id", sa.String(length=8), nullable=False, server_default="MLB"),
        sa.Column("access_token_encrypted", sa.Text(), nullable=False),
        sa.Column("refresh_token_encrypted", sa.Text(), nullable=False),
        sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_tenant_mercado_livre_account"),
    )
    op.create_index(op.f("ix_tenant_mercado_livre_accounts_tenant_id"), "tenant_mercado_livre_accounts", ["tenant_id"], unique=False)

    op.create_table(
        "mercado_livre_product_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("ml_item_id", sa.String(length=32), nullable=True),
        sa.Column("permalink", sa.String(length=512), nullable=True),
        sa.Column("ml_category_id", sa.String(length=32), nullable=True),
        sa.Column("listing_type_id", sa.String(length=40), nullable=True),
        sa.Column("sync_status", sa.String(length=24), nullable=False, server_default="draft"),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("ml_item_status", sa.String(length=40), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "product_id", name="uq_ml_link_tenant_product"),
    )
    op.create_index(op.f("ix_mercado_livre_product_links_product_id"), "mercado_livre_product_links", ["product_id"], unique=False)
    op.create_index(op.f("ix_mercado_livre_product_links_tenant_id"), "mercado_livre_product_links", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_mercado_livre_product_links_tenant_id"), table_name="mercado_livre_product_links")
    op.drop_index(op.f("ix_mercado_livre_product_links_product_id"), table_name="mercado_livre_product_links")
    op.drop_table("mercado_livre_product_links")
    op.drop_index(op.f("ix_tenant_mercado_livre_accounts_tenant_id"), table_name="tenant_mercado_livre_accounts")
    op.drop_table("tenant_mercado_livre_accounts")
    op.drop_index(op.f("ix_product_images_tenant_id"), table_name="product_images")
    op.drop_index(op.f("ix_product_images_product_id"), table_name="product_images")
    op.drop_table("product_images")
