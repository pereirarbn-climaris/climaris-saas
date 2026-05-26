"""Migration: tabela pmoc_occurrences (plano de ação)."""

from alembic import op
import sqlalchemy as sa

revision = "20260530_0092"
down_revision = "20260530_0091"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pmoc_occurrences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("pmoc_id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=True),
        sa.Column("service_order_id", sa.Integer(), nullable=True),
        sa.Column("checklist_item_id", sa.String(length=64), nullable=True),
        sa.Column("checklist_item_descricao", sa.String(length=500), nullable=False),
        sa.Column("failure_description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["pmoc_id"], ["pmoc_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_order_id"], ["service_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pmoc_occurrences_tenant_id", "pmoc_occurrences", ["tenant_id"])
    op.create_index("ix_pmoc_occurrences_pmoc_id", "pmoc_occurrences", ["pmoc_id"])


def downgrade() -> None:
    op.drop_index("ix_pmoc_occurrences_pmoc_id", table_name="pmoc_occurrences")
    op.drop_index("ix_pmoc_occurrences_tenant_id", table_name="pmoc_occurrences")
    op.drop_table("pmoc_occurrences")
