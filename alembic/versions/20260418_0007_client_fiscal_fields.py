"""Client: campos fiscais para NF-e / NFS-e (Focus NFe).

Revision ID: 20260418_0007
Revises: 20260417_0006
Create Date: 2026-04-18
"""

import sqlalchemy as sa
from alembic import op

revision = "20260418_0007"
down_revision = "20260417_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clients",
        sa.Column("tax_id_kind", sa.String(length=8), nullable=False, server_default="cnpj"),
    )
    op.add_column("clients", sa.Column("trade_name", sa.String(length=150), nullable=True))
    op.add_column("clients", sa.Column("state_registration", sa.String(length=20), nullable=True))
    op.add_column("clients", sa.Column("ie_indicator", sa.String(length=2), nullable=True))
    op.add_column("clients", sa.Column("municipal_registration", sa.String(length=20), nullable=True))
    op.add_column("clients", sa.Column("address_street", sa.String(length=255), nullable=True))
    op.add_column("clients", sa.Column("address_number", sa.String(length=20), nullable=True))
    op.add_column("clients", sa.Column("address_complement", sa.String(length=120), nullable=True))
    op.add_column("clients", sa.Column("address_district", sa.String(length=100), nullable=True))
    op.add_column("clients", sa.Column("address_city", sa.String(length=100), nullable=True))
    op.add_column("clients", sa.Column("address_state", sa.String(length=2), nullable=True))
    op.add_column("clients", sa.Column("address_postal_code", sa.String(length=12), nullable=True))
    op.add_column(
        "clients",
        sa.Column("address_country", sa.String(length=60), nullable=False, server_default="Brasil"),
    )
    op.add_column("clients", sa.Column("address_ibge_code", sa.String(length=7), nullable=True))
    op.alter_column("clients", "tax_id_kind", server_default=None)
    op.alter_column("clients", "address_country", server_default=None)

    op.execute(
        """
        UPDATE clients
        SET tax_id_kind = CASE
            WHEN length(regexp_replace(document, '[^0-9]', '', 'g')) = 11 THEN 'cpf'
            ELSE 'cnpj'
        END
        """
    )


def downgrade() -> None:
    op.drop_column("clients", "address_ibge_code")
    op.drop_column("clients", "address_country")
    op.drop_column("clients", "address_postal_code")
    op.drop_column("clients", "address_state")
    op.drop_column("clients", "address_city")
    op.drop_column("clients", "address_district")
    op.drop_column("clients", "address_complement")
    op.drop_column("clients", "address_number")
    op.drop_column("clients", "address_street")
    op.drop_column("clients", "municipal_registration")
    op.drop_column("clients", "ie_indicator")
    op.drop_column("clients", "state_registration")
    op.drop_column("clients", "trade_name")
    op.drop_column("clients", "tax_id_kind")
