"""Dynamic equipment categories (FK on catalog).

Revision ID: 20260518_0078
Revises: 20260517_0077
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260518_0078"
down_revision: Union[str, None] = "20260517_0077"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "equipment_categories",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("has_fluid_type", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("has_capacity", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("has_voltage", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("tenant_id", "name", name="uq_equipment_categories_tenant_name"),
    )
    op.create_index("ix_equipment_categories_tenant_id", "equipment_categories", ["tenant_id"])

    op.execute(
        """
        INSERT INTO equipment_categories (id, tenant_id, name, has_fluid_type, has_capacity, has_voltage, created_at, updated_at)
        SELECT gen_random_uuid(), t.id, v.name, v.hf, v.hc, v.hv, now(), now()
        FROM tenants t
        CROSS JOIN (
            VALUES
                ('Ar-Condicionado', true, true, true),
                ('Climatizador', true, true, true),
                ('Geladeira', true, true, true),
                ('Bebedouro', false, true, true),
                ('Outros', false, false, false)
        ) AS v(name, hf, hc, hv)
        """
    )

    op.add_column(
        "equipment_catalog",
        sa.Column("category_id", sa.Uuid(as_uuid=True), nullable=True),
    )
    op.add_column("equipment_catalog", sa.Column("voltage", sa.String(length=40), nullable=True))
    op.alter_column("equipment_catalog", "capacity", existing_type=sa.String(length=80), nullable=True)

    op.execute(
        """
        UPDATE equipment_catalog ec
        SET category_id = cat.id
        FROM equipment_categories cat
        WHERE cat.tenant_id = ec.tenant_id
          AND (
            (ec.category::text = 'AIR_CONDITIONER' AND cat.name = 'Ar-Condicionado')
            OR (ec.category::text = 'REFRIGERATOR' AND cat.name = 'Geladeira')
            OR (ec.category::text = 'WATER_COOLER' AND cat.name = 'Bebedouro')
            OR (ec.category::text = 'OTHER' AND cat.name = 'Outros')
          )
        """
    )
    op.execute(
        """
        UPDATE equipment_catalog ec
        SET category_id = cat.id
        FROM equipment_categories cat
        WHERE ec.category_id IS NULL
          AND cat.tenant_id = ec.tenant_id
          AND cat.name = 'Outros'
        """
    )

    op.alter_column("equipment_catalog", "category_id", nullable=False)
    op.create_foreign_key(
        "fk_equipment_catalog_category_id",
        "equipment_catalog",
        "equipment_categories",
        ["category_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_equipment_catalog_category_id", "equipment_catalog", ["category_id"])

    op.drop_constraint("uq_equipment_catalog_tenant_brand_models_category", "equipment_catalog", type_="unique")
    op.drop_column("equipment_catalog", "category")
    op.create_unique_constraint(
        "uq_equipment_catalog_tenant_brand_models_category",
        "equipment_catalog",
        ["tenant_id", "brand", "category_id", "model_evaporator", "model_condenser"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_equipment_catalog_tenant_brand_models_category", "equipment_catalog", type_="unique")
    op.add_column(
        "equipment_catalog",
        sa.Column(
            "category",
            sa.Enum("AIR_CONDITIONER", "REFRIGERATOR", "WATER_COOLER", "OTHER", name="equipmentcatalogcategory", native_enum=False, length=32),
            nullable=True,
        ),
    )
    op.execute(
        """
        UPDATE equipment_catalog ec
        SET category = CASE cat.name
            WHEN 'Ar-Condicionado' THEN 'AIR_CONDITIONER'
            WHEN 'Geladeira' THEN 'REFRIGERATOR'
            WHEN 'Bebedouro' THEN 'WATER_COOLER'
            ELSE 'OTHER'
        END
        FROM equipment_categories cat
        WHERE cat.id = ec.category_id
        """
    )
    op.alter_column("equipment_catalog", "category", nullable=False)
    op.create_unique_constraint(
        "uq_equipment_catalog_tenant_brand_models_category",
        "equipment_catalog",
        ["tenant_id", "brand", "category", "model_evaporator", "model_condenser"],
    )

    op.drop_constraint("fk_equipment_catalog_category_id", "equipment_catalog", type_="foreignkey")
    op.drop_index("ix_equipment_catalog_category_id", table_name="equipment_catalog")
    op.drop_column("equipment_catalog", "category_id")
    op.drop_column("equipment_catalog", "voltage")
    op.alter_column("equipment_catalog", "capacity", existing_type=sa.String(length=80), nullable=False)

    op.drop_index("ix_equipment_categories_tenant_id", table_name="equipment_categories")
    op.drop_table("equipment_categories")
