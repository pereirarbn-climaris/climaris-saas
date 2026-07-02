"""platform website settings"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260611_0135"
down_revision = "20260611_0134"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_website_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("hero_title", sa.String(length=200), nullable=False),
        sa.Column("hero_subtitle", sa.String(length=500), nullable=False),
        sa.Column("seo_title", sa.String(length=200), nullable=False),
        sa.Column("seo_description", sa.String(length=500), nullable=False),
        sa.Column("contact_email", sa.String(length=254), nullable=False, server_default="contato@climaris.com.br"),
        sa.Column("contact_phone", sa.String(length=32), nullable=True),
        sa.Column("legal_name", sa.String(length=160), nullable=False, server_default="Climaris"),
        sa.Column("cnpj", sa.String(length=18), nullable=True),
        sa.Column("address_street", sa.String(length=200), nullable=False),
        sa.Column("address_city", sa.String(length=80), nullable=False, server_default="Araraquara"),
        sa.Column("address_state", sa.String(length=2), nullable=False, server_default="SP"),
        sa.Column("address_postal", sa.String(length=12), nullable=False, server_default="14800-000"),
        sa.Column("services_json", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("hero_s3_key", sa.String(length=512), nullable=True),
        sa.Column("hero_content_type", sa.String(length=80), nullable=True),
        sa.Column("hero_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dashboard_s3_key", sa.String(length=512), nullable=True),
        sa.Column("dashboard_content_type", sa.String(length=80), nullable=True),
        sa.Column("dashboard_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finance_s3_key", sa.String(length=512), nullable=True),
        sa.Column("finance_content_type", sa.String(length=80), nullable=True),
        sa.Column("finance_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("orders_s3_key", sa.String(length=512), nullable=True),
        sa.Column("orders_content_type", sa.String(length=80), nullable=True),
        sa.Column("orders_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("platform_website_settings")
