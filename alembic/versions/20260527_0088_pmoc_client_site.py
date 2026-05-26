"""PMOC vinculado a obra/filial (client_sites)

Revision ID: 20260527_0088
Revises: 20260526_0087
Create Date: 2026-05-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260527_0088"
down_revision: Union[str, None] = "20260526_0087"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pmoc_plans", sa.Column("client_site_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_pmoc_plans_client_site_id",
        "pmoc_plans",
        "client_sites",
        ["client_site_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(op.f("ix_pmoc_plans_client_site_id"), "pmoc_plans", ["client_site_id"], unique=False)

    op.execute("DROP INDEX IF EXISTS uq_pmoc_one_active_per_client")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_pmoc_one_active_per_client_site
        ON pmoc_plans (tenant_id, client_id, client_site_id)
        WHERE status = 'active' AND client_site_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_pmoc_one_active_per_client_legacy
        ON pmoc_plans (tenant_id, client_id)
        WHERE status = 'active' AND client_site_id IS NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_pmoc_one_active_per_client_legacy")
    op.execute("DROP INDEX IF EXISTS uq_pmoc_one_active_per_client_site")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_pmoc_one_active_per_client
        ON pmoc_plans (tenant_id, client_id)
        WHERE status = 'active'
        """
    )
    op.drop_index(op.f("ix_pmoc_plans_client_site_id"), table_name="pmoc_plans")
    op.drop_constraint("fk_pmoc_plans_client_site_id", "pmoc_plans", type_="foreignkey")
    op.drop_column("pmoc_plans", "client_site_id")
