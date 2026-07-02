"""PMOC catálogo próprio de serviços por tenant.

Revision ID: 20260627_0136
Revises: 20260627_0135
Create Date: 2026-06-27 03:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260627_0136"
down_revision = "20260627_0135"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pmoc_service_catalogs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("frequency", sa.String(length=20), nullable=False),
        sa.Column("equipment_types_json", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_pmoc_service_catalog_tenant_name"),
    )
    op.create_index("ix_pmoc_service_catalogs_tenant_id", "pmoc_service_catalogs", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_pmoc_service_catalogs_tenant_id", table_name="pmoc_service_catalogs")
    op.drop_table("pmoc_service_catalogs")
