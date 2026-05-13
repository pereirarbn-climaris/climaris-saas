"""unique whatsapp per tenant (dedupe then partial index)

Revision ID: 20260510_0059
Revises: 20260510_0058
Create Date: 2026-05-10
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260510_0059"
down_revision: Union[str, None] = "20260510_0058"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear duplicate whatsapp within same tenant (keep lowest client id).
    op.execute(
        """
        UPDATE clients AS c
        SET whatsapp = NULL
        FROM clients AS other
        WHERE c.tenant_id = other.tenant_id
          AND c.whatsapp IS NOT NULL
          AND btrim(c.whatsapp, ' ') <> ''
          AND c.whatsapp = other.whatsapp
          AND c.id > other.id
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_tenant_whatsapp
        ON clients (tenant_id, whatsapp)
        WHERE whatsapp IS NOT NULL AND btrim(whatsapp, ' ') <> ''
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_clients_tenant_whatsapp")
