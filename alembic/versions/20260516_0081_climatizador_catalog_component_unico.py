"""Climatizador: component_type UNICO (não evaporadora avulsa)."""

from __future__ import annotations

from alembic import op

revision: str = "20260516_0081"
down_revision: str | None = "20260520_0080"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE equipment_catalog ec
        SET component_type = 'UNICO'
        FROM equipment_categories c
        WHERE ec.category_id = c.id
          AND c.icon_key = 'climatizador'
          AND ec.component_type IN ('EVAPORADORA', 'CONDENSADORA')
        """
    )


def downgrade() -> None:
    pass
