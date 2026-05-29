"""preventive banner s3 key + send image toggle

Revision ID: 20260606_0104
Revises: 20260605_0103
Create Date: 2026-06-06
"""

from alembic import op
import sqlalchemy as sa

revision = "20260606_0104"
down_revision = "20260605_0103"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("preventive_promo_image_s3_key", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column(
            "preventive_promo_image_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("tenants", "preventive_promo_image_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("tenants", "preventive_promo_image_enabled")
    op.drop_column("tenants", "preventive_promo_image_s3_key")
