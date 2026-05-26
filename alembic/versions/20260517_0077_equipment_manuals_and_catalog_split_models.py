"""Equipment manuals table and catalog split model fields.

Revision ID: 20260517_0077
Revises: 20260517_0076
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260517_0077"
down_revision: Union[str, None] = "20260517_0076"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "equipment_manuals",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("s3_url", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_equipment_manuals_tenant_id", "equipment_manuals", ["tenant_id"])

    op.add_column("equipment_catalog", sa.Column("model_evaporator", sa.String(length=120), nullable=True))
    op.add_column("equipment_catalog", sa.Column("model_condenser", sa.String(length=120), nullable=True))
    op.add_column(
        "equipment_catalog",
        sa.Column("manual_id", sa.Uuid(as_uuid=True), sa.ForeignKey("equipment_manuals.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_equipment_catalog_manual_id", "equipment_catalog", ["manual_id"])

    # Migra manuais legados (manual_url) para equipment_manuals
    op.execute(
        """
        INSERT INTO equipment_manuals (id, tenant_id, title, s3_url, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            c.tenant_id,
            LEFT(TRIM(c.brand || ' ' || c.model || ' — Manual'), 200),
            c.manual_url,
            c.created_at,
            c.updated_at
        FROM equipment_catalog c
        WHERE c.manual_url IS NOT NULL AND TRIM(c.manual_url) <> ''
        """
    )
    op.execute(
        """
        UPDATE equipment_catalog c
        SET manual_id = m.id
        FROM equipment_manuals m
        WHERE c.manual_url IS NOT NULL
          AND TRIM(c.manual_url) <> ''
          AND m.tenant_id = c.tenant_id
          AND m.s3_url = c.manual_url
        """
    )

    op.drop_column("equipment_catalog", "manual_url")

    op.drop_constraint("uq_equipment_catalog_tenant_brand_model_category", "equipment_catalog", type_="unique")
    op.create_unique_constraint(
        "uq_equipment_catalog_tenant_brand_models_category",
        "equipment_catalog",
        ["tenant_id", "brand", "category", "model_evaporator", "model_condenser"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_equipment_catalog_tenant_brand_models_category", "equipment_catalog", type_="unique")
    op.add_column("equipment_catalog", sa.Column("manual_url", sa.String(length=500), nullable=True))

    op.execute(
        """
        UPDATE equipment_catalog c
        SET manual_url = m.s3_url
        FROM equipment_manuals m
        WHERE c.manual_id = m.id
        """
    )

    op.drop_index("ix_equipment_catalog_manual_id", table_name="equipment_catalog")
    op.drop_column("equipment_catalog", "manual_id")
    op.drop_column("equipment_catalog", "model_condenser")
    op.drop_column("equipment_catalog", "model_evaporator")

    op.drop_index("ix_equipment_manuals_tenant_id", table_name="equipment_manuals")
    op.drop_table("equipment_manuals")

    op.create_unique_constraint(
        "uq_equipment_catalog_tenant_brand_model_category",
        "equipment_catalog",
        ["tenant_id", "brand", "model", "category"],
    )
