"""Orçamento: vínculo opcional com filial/obra do cliente.

Revision ID: 20260729_0156
Revises: 20260729_1430
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260729_0156"
down_revision: Union[str, None] = "20260729_1430"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("budgets", sa.Column("client_site_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_budgets_client_site_id",
        "budgets",
        "client_sites",
        ["client_site_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_budgets_client_site_id"), "budgets", ["client_site_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_budgets_client_site_id"), table_name="budgets")
    op.drop_constraint("fk_budgets_client_site_id", "budgets", type_="foreignkey")
    op.drop_column("budgets", "client_site_id")
