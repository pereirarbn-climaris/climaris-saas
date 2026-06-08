"""budget template settings per tenant

Revision ID: 20260613_0112
Revises: 20260612_0111
Create Date: 2026-06-13
"""

from alembic import op
import sqlalchemy as sa

revision = "20260613_0112"
down_revision = "20260612_0111"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "budget_template_settings",
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("template_key", sa.String(length=32), nullable=False, server_default="classic"),
        sa.Column("brand_color", sa.String(length=7), nullable=False, server_default="#0B7FAF"),
        sa.Column("default_warranty_terms", sa.Text(), nullable=True),
        sa.Column("default_payment_terms", sa.Text(), nullable=True),
        sa.Column("default_technical_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("budget_template_settings")
