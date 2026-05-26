"""PMOC cronograma — vínculo opcional com catálogo de serviços

Revision ID: 20260528_0089
Revises: 20260527_0088
Create Date: 2026-05-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260528_0089"
down_revision: Union[str, None] = "20260527_0088"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pmoc_scheduled_activities", sa.Column("service_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_pmoc_scheduled_activities_service_id",
        "pmoc_scheduled_activities",
        "services",
        ["service_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_pmoc_scheduled_activities_service_id"),
        "pmoc_scheduled_activities",
        ["service_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_pmoc_scheduled_activities_service_id"), table_name="pmoc_scheduled_activities")
    op.drop_constraint("fk_pmoc_scheduled_activities_service_id", "pmoc_scheduled_activities", type_="foreignkey")
    op.drop_column("pmoc_scheduled_activities", "service_id")
