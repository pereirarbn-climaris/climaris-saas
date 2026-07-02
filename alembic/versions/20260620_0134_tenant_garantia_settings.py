"""tenant garantia settings per tenant

Revision ID: 20260620_0134
Revises: 20260627_0133
Create Date: 2026-06-20
"""

from alembic import op
import sqlalchemy as sa

revision = "20260620_0134"
down_revision = "20260627_0133"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_garantia_settings",
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("default_meses_garantia", sa.Integer(), nullable=False, server_default="12"),
        sa.Column("prazo_garantia_servico", sa.Text(), nullable=True),
        sa.Column("nota_garantia_fabrica", sa.Text(), nullable=True),
        sa.Column("termos_garantia", sa.Text(), nullable=True),
        sa.Column("servicos_cobertos", sa.Text(), nullable=True),
        sa.Column("condicoes_exclusoes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("tenant_garantia_settings")
