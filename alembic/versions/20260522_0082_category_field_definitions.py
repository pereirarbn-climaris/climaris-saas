"""Campos técnicos dinâmicos: field_definitions (categoria) e technical_data (catálogo)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260522_0082"
down_revision: Union[str, None] = "20260516_0081"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "equipment_categories",
        sa.Column(
            "field_definitions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "equipment_catalog",
        sa.Column(
            "technical_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    # Migra flags legadas -> field_definitions
    op.execute(
        """
        UPDATE equipment_categories
        SET field_definitions = (
            CASE WHEN has_capacity THEN
                jsonb_build_array(jsonb_build_object(
                    'key', 'capacity', 'name', 'Capacidade', 'type', 'text',
                    'unit', null, 'required', false, 'is_active', true, 'options', '[]'::jsonb
                ))
            ELSE '[]'::jsonb END
        ) || (
            CASE WHEN has_fluid_type THEN
                jsonb_build_array(jsonb_build_object(
                    'key', 'fluid_type', 'name', 'Fluido refrigerante', 'type', 'text',
                    'unit', null, 'required', false, 'is_active', true, 'options', '[]'::jsonb
                ))
            ELSE '[]'::jsonb END
        ) || (
            CASE WHEN has_voltage THEN
                jsonb_build_array(jsonb_build_object(
                    'key', 'voltage', 'name', 'Tensão', 'type', 'text',
                    'unit', null, 'required', false, 'is_active', true, 'options', '[]'::jsonb
                ))
            ELSE '[]'::jsonb END
        )
        WHERE field_definitions = '[]'::jsonb
        """
    )

    # Migra valores legados do catálogo -> technical_data
    op.execute(
        """
        UPDATE equipment_catalog
        SET technical_data = jsonb_strip_nulls(
            jsonb_build_object(
                'capacity', capacity,
                'fluid_type', fluid_type,
                'voltage', voltage
            )
        )
        WHERE technical_data = '{}'::jsonb
        """
    )


def downgrade() -> None:
    op.drop_column("equipment_catalog", "technical_data")
    op.drop_column("equipment_categories", "field_definitions")
