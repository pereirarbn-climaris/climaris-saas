"""Mercado Pago: segredo cifrado para validação x-signature do webhook.

Revision ID: 20260511_0063
Revises: 20260511_0062
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260511_0063"
down_revision: Union[str, None] = "20260511_0062"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenant_finance_gateways",
        sa.Column("mercadopago_webhook_signature_secret_encrypted", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenant_finance_gateways", "mercadopago_webhook_signature_secret_encrypted")
