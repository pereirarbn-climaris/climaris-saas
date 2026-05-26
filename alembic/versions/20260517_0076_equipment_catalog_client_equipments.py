"""Equipment catalog and client equipment installations (v2).

Revision ID: 20260517_0076
Revises: 20260516_0075
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260517_0076"
down_revision: Union[str, None] = "20260516_0075"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "equipment_catalog",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "category",
            sa.Enum(
                "AIR_CONDITIONER",
                "REFRIGERATOR",
                "WATER_COOLER",
                "OTHER",
                name="equipmentcatalogcategory",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("brand", sa.String(length=120), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("capacity", sa.String(length=80), nullable=False),
        sa.Column("fluid_type", sa.String(length=40), nullable=True),
        sa.Column("manual_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint(
            "tenant_id",
            "brand",
            "model",
            "category",
            name="uq_equipment_catalog_tenant_brand_model_category",
        ),
    )
    op.create_index("ix_equipment_catalog_tenant_id", "equipment_catalog", ["tenant_id"])

    op.create_table(
        "client_equipments",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "catalog_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("equipment_catalog.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("serial_number", sa.String(length=120), nullable=True),
        sa.Column("tag", sa.String(length=120), nullable=False),
        sa.Column("installation_date", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "legacy_equipment_id",
            sa.Integer(),
            sa.ForeignKey("equipments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_client_equipments_tenant_id", "client_equipments", ["tenant_id"])
    op.create_index("ix_client_equipments_client_id", "client_equipments", ["client_id"])
    op.create_index("ix_client_equipments_catalog_id", "client_equipments", ["catalog_id"])
    op.create_index("ix_client_equipments_legacy_equipment_id", "client_equipments", ["legacy_equipment_id"])


def downgrade() -> None:
    op.drop_index("ix_client_equipments_legacy_equipment_id", table_name="client_equipments")
    op.drop_index("ix_client_equipments_catalog_id", table_name="client_equipments")
    op.drop_index("ix_client_equipments_client_id", table_name="client_equipments")
    op.drop_index("ix_client_equipments_tenant_id", table_name="client_equipments")
    op.drop_table("client_equipments")
    op.drop_index("ix_equipment_catalog_tenant_id", table_name="equipment_catalog")
    op.drop_table("equipment_catalog")
    op.execute("DROP TYPE IF EXISTS equipmentcatalogcategory")
