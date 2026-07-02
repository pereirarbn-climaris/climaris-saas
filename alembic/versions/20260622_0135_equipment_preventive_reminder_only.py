"""Flag equipamentos de lembrete preventivo (não aparecem no cadastro do cliente).

Revision ID: 20260622_0135
Revises: 20260620_0134
Create Date: 2026-06-22
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260622_0135"
down_revision: Union[str, None] = "20260620_0134"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "equipments",
        sa.Column(
            "preventive_reminder_only",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("equipments", "preventive_reminder_only", server_default=None)

    # Aparelhos mínimos com agenda preventiva ativa = lembretes temporários pré-sistema.
    op.execute(
        """
        UPDATE equipments e
        SET preventive_reminder_only = TRUE
        WHERE preventive_reminder_only = FALSE
          AND EXISTS (
            SELECT 1
            FROM equipment_service_preventive_schedules s
            WHERE s.equipment_id = e.id
              AND s.is_active = TRUE
          )
          AND (
            lower(coalesce(e.identificacao, '')) LIKE '%cadastro temporário%'
            OR lower(coalesce(e.identificacao, '')) LIKE '%cadastro temporario%'
            OR (
              coalesce(trim(e.fabricante), '') = ''
              AND coalesce(trim(e.modelo), '') = ''
              AND coalesce(trim(e.serial), '') = ''
              AND e.capacidade_btu IS NULL
            )
          )
        """
    )

    op.execute(
        """
        UPDATE client_equipments ce
        SET is_active = FALSE
        FROM equipments e
        WHERE ce.legacy_equipment_id = e.id
          AND e.preventive_reminder_only = TRUE
        """
    )


def downgrade() -> None:
    op.drop_column("equipments", "preventive_reminder_only")
