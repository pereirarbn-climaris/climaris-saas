"""qrcode code_id and label status (available/linked)

Revision ID: 20260603_0098
Revises: 20260602_0097
Create Date: 2026-06-03
"""

from alembic import op
import sqlalchemy as sa

revision = "20260603_0098"
down_revision = "20260602_0097"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("qrcodes", sa.Column("code_id", sa.String(length=32), nullable=True))
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE qrcodes
            SET code_id = 'QR' || LPAD(id::text, 8, '0')
            WHERE code_id IS NULL
            """
        )
    )
    conn.execute(
        sa.text(
            """
            UPDATE qrcodes
            SET status = CASE
                WHEN linked_to_equipment_id IS NOT NULL THEN 'linked'
                WHEN status IN ('valid', 'linked') THEN 'linked'
                ELSE 'available'
            END
            """
        )
    )
    op.alter_column("qrcodes", "code_id", nullable=False)
    op.create_index("ix_qrcodes_code_id", "qrcodes", ["code_id"], unique=True)
    op.alter_column("qrcodes", "public_token", nullable=True)


def downgrade() -> None:
    op.alter_column("qrcodes", "public_token", nullable=False)
    op.drop_index("ix_qrcodes_code_id", table_name="qrcodes")
    op.drop_column("qrcodes", "code_id")
