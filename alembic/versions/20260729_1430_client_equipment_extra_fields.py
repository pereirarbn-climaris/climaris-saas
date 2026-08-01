"""Campos adicionais no cadastro de equipamento do cliente (ano de fabricação, carga de gás, observações).

Revision ID: 20260729_1430
Revises: 20260729_0155
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260729_1430"
down_revision: Union[str, None] = "20260729_0155"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("client_equipments", sa.Column("manufacture_year", sa.Integer(), nullable=True))
    op.add_column("client_equipments", sa.Column("gas_charge_kg", sa.Numeric(10, 4), nullable=True))
    op.add_column("client_equipments", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("client_equipments", "notes")
    op.drop_column("client_equipments", "gas_charge_kg")
    op.drop_column("client_equipments", "manufacture_year")
