"""client is_active flag

Revision ID: 20260510_0060
Revises: 20260510_0059
Create Date: 2026-05-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260510_0060"
down_revision: Union[str, None] = "20260510_0059"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clients",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_clients_tenant_is_active", "clients", ["tenant_id", "is_active"])


def downgrade() -> None:
    op.drop_index("ix_clients_tenant_is_active", table_name="clients")
    op.drop_column("clients", "is_active")
