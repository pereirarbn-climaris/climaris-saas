"""Add product form catalogs (category, type, unit, location).

Revision ID: 20260803_0159
Revises: 20260801_0158
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "20260803_0159"
down_revision: Union[str, None] = "20260801_0158"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_catalog_table(table_name: str, unique_name: str) -> None:
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          name VARCHAR(120) NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT {unique_name} UNIQUE (tenant_id, name)
        )
        """
    )
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_{table_name}_tenant_id ON {table_name} (tenant_id)")


def _drop_catalog_table(table_name: str) -> None:
    op.execute(f"DROP INDEX IF EXISTS ix_{table_name}_tenant_id")
    op.execute(f"DROP TABLE IF EXISTS {table_name}")


def upgrade() -> None:
    _create_catalog_table("product_categories", "uq_product_categories_tenant_name")
    _create_catalog_table("product_types", "uq_product_types_tenant_name")
    _create_catalog_table("product_units", "uq_product_units_tenant_name")
    _create_catalog_table("product_locations", "uq_product_locations_tenant_name")


def downgrade() -> None:
    _drop_catalog_table("product_locations")
    _drop_catalog_table("product_units")
    _drop_catalog_table("product_types")
    _drop_catalog_table("product_categories")
