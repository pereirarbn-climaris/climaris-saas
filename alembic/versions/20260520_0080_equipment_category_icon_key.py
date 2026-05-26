"""Ícone e ordem em equipment_categories.

Revision ID: 20260520_0080
Revises: 20260519_0079
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260520_0080"
down_revision: Union[str, None] = "20260519_0079"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "equipment_categories",
        sa.Column("icon_key", sa.String(length=40), nullable=False, server_default="outros"),
    )
    op.add_column(
        "equipment_categories",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )

    op.execute(
        """
        UPDATE equipment_categories SET icon_key = 'ar_condicionado', sort_order = 10
        WHERE lower(name) LIKE '%ar-condicionado%' OR lower(name) LIKE '%ar condicionado%';
        UPDATE equipment_categories SET icon_key = 'climatizador', sort_order = 20
        WHERE lower(name) LIKE '%climatizador%';
        UPDATE equipment_categories SET icon_key = 'geladeira', sort_order = 30
        WHERE lower(name) LIKE '%geladeira%';
        UPDATE equipment_categories SET icon_key = 'bebedouro', sort_order = 40
        WHERE lower(name) LIKE '%bebedouro%';
        UPDATE equipment_categories SET icon_key = 'outros', sort_order = 90
        WHERE lower(name) = 'outros';
        """
    )


def downgrade() -> None:
    op.drop_column("equipment_categories", "sort_order")
    op.drop_column("equipment_categories", "icon_key")
