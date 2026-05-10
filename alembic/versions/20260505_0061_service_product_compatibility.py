"""Campos de compatibilidade técnica para serviços e produtos.

Revision ID: 20260505_0061
Revises: 20260505_0060
Create Date: 2026-05-05
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260505_0061"
down_revision: Union[str, None] = "20260505_0060"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    stmts = [
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS equipment_type_tags TEXT",
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS btu_min INTEGER",
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS btu_max INTEGER",
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS service_category VARCHAR(40)",
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS applies_residential BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS applies_commercial BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS compatible_equipment_tags TEXT",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS btu_min INTEGER",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS btu_max INTEGER",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS application_scope VARCHAR(20)",
    ]
    for sql in stmts:
        op.execute(sql)


def downgrade() -> None:
    stmts = [
        "ALTER TABLE services DROP COLUMN IF EXISTS equipment_type_tags",
        "ALTER TABLE services DROP COLUMN IF EXISTS btu_min",
        "ALTER TABLE services DROP COLUMN IF EXISTS btu_max",
        "ALTER TABLE services DROP COLUMN IF EXISTS service_category",
        "ALTER TABLE services DROP COLUMN IF EXISTS applies_residential",
        "ALTER TABLE services DROP COLUMN IF EXISTS applies_commercial",
        "ALTER TABLE products DROP COLUMN IF EXISTS compatible_equipment_tags",
        "ALTER TABLE products DROP COLUMN IF EXISTS btu_min",
        "ALTER TABLE products DROP COLUMN IF EXISTS btu_max",
        "ALTER TABLE products DROP COLUMN IF EXISTS application_scope",
    ]
    for sql in stmts:
        op.execute(sql)

