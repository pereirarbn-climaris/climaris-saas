"""equipment public_token for QR / public history page

Revision ID: 20260429_0044
Revises: 20260428_0043
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = "20260429_0044"
down_revision = "20260428_0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("equipments", sa.Column("public_token", sa.String(length=36), nullable=True))
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM equipments")).fetchall()
    for (row_id,) in rows:
        tok = str(uuid.uuid4())
        conn.execute(sa.text("UPDATE equipments SET public_token = :t WHERE id = :id"), {"t": tok, "id": row_id})
    op.create_index("ix_equipments_public_token", "equipments", ["public_token"], unique=True)
    op.alter_column("equipments", "public_token", nullable=False)


def downgrade() -> None:
    op.drop_index("ix_equipments_public_token", table_name="equipments")
    op.drop_column("equipments", "public_token")
