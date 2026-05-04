"""equipment extended hvac fields (categoria, ambientes, filtros, gas mass, etc.)

Revision ID: 20260429_0045
Revises: 20260429_0044
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260429_0045"
down_revision = "20260429_0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("equipments", sa.Column("categoria_instalacao", sa.String(length=32), nullable=True))
    op.add_column("equipments", sa.Column("modelo_evaporadora", sa.String(length=120), nullable=True))
    op.add_column("equipments", sa.Column("modelo_condensadora", sa.String(length=120), nullable=True))
    op.add_column("equipments", sa.Column("capacidade_tr", sa.Numeric(8, 3), nullable=True))
    op.add_column("equipments", sa.Column("ambiente_nome", sa.String(length=180), nullable=True))
    op.add_column("equipments", sa.Column("ambiente_tipo", sa.String(length=120), nullable=True))
    op.add_column("equipments", sa.Column("area_m2", sa.Numeric(10, 2), nullable=True))
    op.add_column("equipments", sa.Column("ocupacao_fixa", sa.Integer(), nullable=True))
    op.add_column("equipments", sa.Column("ocupacao_flutuante", sa.Integer(), nullable=True))
    op.add_column("equipments", sa.Column("carga_termica_total", sa.String(length=200), nullable=True))
    op.add_column("equipments", sa.Column("massa_gas_kg", sa.Numeric(10, 4), nullable=True))
    op.add_column("equipments", sa.Column("corrente_nominal_a", sa.Numeric(10, 2), nullable=True))
    op.add_column("equipments", sa.Column("filtro_tipo", sa.String(length=80), nullable=True))
    op.add_column("equipments", sa.Column("filtro_quantidade", sa.Integer(), nullable=True))
    op.add_column("equipments", sa.Column("filtro_dimensoes", sa.String(length=120), nullable=True))
    op.add_column("equipments", sa.Column("filtro_periodicidade_limpeza", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("equipments", "filtro_periodicidade_limpeza")
    op.drop_column("equipments", "filtro_dimensoes")
    op.drop_column("equipments", "filtro_quantidade")
    op.drop_column("equipments", "filtro_tipo")
    op.drop_column("equipments", "corrente_nominal_a")
    op.drop_column("equipments", "massa_gas_kg")
    op.drop_column("equipments", "carga_termica_total")
    op.drop_column("equipments", "ocupacao_flutuante")
    op.drop_column("equipments", "ocupacao_fixa")
    op.drop_column("equipments", "area_m2")
    op.drop_column("equipments", "ambiente_tipo")
    op.drop_column("equipments", "ambiente_nome")
    op.drop_column("equipments", "capacidade_tr")
    op.drop_column("equipments", "modelo_condensadora")
    op.drop_column("equipments", "modelo_evaporadora")
    op.drop_column("equipments", "categoria_instalacao")
