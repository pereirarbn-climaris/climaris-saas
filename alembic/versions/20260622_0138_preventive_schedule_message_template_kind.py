"""message_template_kind por agenda preventiva (equipamento + serviço).

Revision ID: 20260622_0138
Revises: 20260622_0137
Create Date: 2026-06-22
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260622_0138"
down_revision: Union[str, None] = "20260622_0137"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "equipment_service_preventive_schedules",
        sa.Column("message_template_kind", sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("equipment_service_preventive_schedules", "message_template_kind")
