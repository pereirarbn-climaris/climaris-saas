"""equipment extra hvac fields

Revision ID: 20260425_0039
Revises: 20260425_0038
Create Date: 2026-04-25 11:50:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260425_0039"
down_revision = "20260425_0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("equipments", sa.Column("tipo_gas", sa.String(length=40), nullable=True))
    op.add_column("equipments", sa.Column("voltagem", sa.String(length=20), nullable=True))
    op.add_column("equipments", sa.Column("tecnologia_ciclo", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("equipments", "tecnologia_ciclo")
    op.drop_column("equipments", "voltagem")
    op.drop_column("equipments", "tipo_gas")
