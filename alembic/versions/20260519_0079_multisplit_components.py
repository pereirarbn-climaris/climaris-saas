"""Multi-split: catalog component_type and client equipment components.

Revision ID: 20260519_0079
Revises: 20260518_0078
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260519_0079"
down_revision: Union[str, None] = "20260518_0078"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "equipment_catalog",
        sa.Column(
            "component_type",
            sa.Enum("UNICO", "EVAPORADORA", "CONDENSADORA", name="equipmentcatalogcomponenttype", native_enum=False, length=16),
            nullable=False,
            server_default="UNICO",
        ),
    )

    op.drop_constraint("uq_equipment_catalog_tenant_brand_models_category", "equipment_catalog", type_="unique")
    op.create_unique_constraint(
        "uq_equipment_catalog_tenant_brand_category_component_model",
        "equipment_catalog",
        ["tenant_id", "brand", "category_id", "component_type", "model"],
    )

    op.create_table(
        "client_equipment_components",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "client_equipment_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("client_equipments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "catalog_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("equipment_catalog.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("serial_number", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_client_equipment_components_client_equipment_id",
        "client_equipment_components",
        ["client_equipment_id"],
    )
    op.create_index("ix_client_equipment_components_catalog_id", "client_equipment_components", ["catalog_id"])

    op.execute(
        """
        INSERT INTO client_equipment_components (id, client_equipment_id, catalog_id, serial_number, created_at, updated_at)
        SELECT gen_random_uuid(), ce.id, ce.catalog_id, ce.serial_number, ce.created_at, ce.updated_at
        FROM client_equipments ce
        WHERE ce.catalog_id IS NOT NULL
        """
    )

    op.drop_index("ix_client_equipments_catalog_id", table_name="client_equipments")
    op.drop_constraint("client_equipments_catalog_id_fkey", "client_equipments", type_="foreignkey")
    op.drop_column("client_equipments", "catalog_id")
    op.drop_column("client_equipments", "serial_number")


def downgrade() -> None:
    op.add_column("client_equipments", sa.Column("serial_number", sa.String(length=120), nullable=True))
    op.add_column("client_equipments", sa.Column("catalog_id", sa.Uuid(as_uuid=True), nullable=True))

    op.execute(
        """
        UPDATE client_equipments ce
        SET catalog_id = c.catalog_id,
            serial_number = c.serial_number
        FROM (
            SELECT DISTINCT ON (client_equipment_id)
                client_equipment_id, catalog_id, serial_number
            FROM client_equipment_components
            ORDER BY client_equipment_id, created_at
        ) c
        WHERE ce.id = c.client_equipment_id
        """
    )

    op.alter_column("client_equipments", "catalog_id", nullable=False)
    op.create_foreign_key(
        "client_equipments_catalog_id_fkey",
        "client_equipments",
        "equipment_catalog",
        ["catalog_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_client_equipments_catalog_id", "client_equipments", ["catalog_id"])

    op.drop_index("ix_client_equipment_components_catalog_id", table_name="client_equipment_components")
    op.drop_index("ix_client_equipment_components_client_equipment_id", table_name="client_equipment_components")
    op.drop_table("client_equipment_components")

    op.drop_constraint("uq_equipment_catalog_tenant_brand_category_component_model", "equipment_catalog", type_="unique")
    op.create_unique_constraint(
        "uq_equipment_catalog_tenant_brand_models_category",
        "equipment_catalog",
        ["tenant_id", "brand", "category_id", "model_evaporator", "model_condenser"],
    )
    op.drop_column("equipment_catalog", "component_type")
