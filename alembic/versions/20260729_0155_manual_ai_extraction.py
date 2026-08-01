"""Extração estruturada de manuais via IA (specs + códigos de erro) para catálogo e Iris.

Revision ID: 20260729_0155
Revises: 20260722_0154
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260729_0155"
down_revision: Union[str, None] = "20260722_0154"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "equipment_manuals",
        sa.Column("extraction_status", sa.String(length=16), nullable=False, server_default="pending"),
    )
    op.add_column("equipment_manuals", sa.Column("extraction_error", sa.Text(), nullable=True))
    op.add_column(
        "equipment_manuals",
        sa.Column("extraction_result", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
    )
    op.add_column("equipment_manuals", sa.Column("extracted_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "equipment_manual_error_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "manual_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("equipment_manuals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("probable_cause", sa.Text(), nullable=True),
        sa.Column("recommended_action", sa.Text(), nullable=True),
        sa.Column("pagina_origem", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_equipment_manual_error_codes_tenant_id", "equipment_manual_error_codes", ["tenant_id"]
    )
    op.create_index(
        "ix_equipment_manual_error_codes_manual_id", "equipment_manual_error_codes", ["manual_id"]
    )
    op.create_index("ix_equipment_manual_error_codes_code", "equipment_manual_error_codes", ["code"])
    op.create_index(
        "ix_equipment_manual_error_codes_tenant_code", "equipment_manual_error_codes", ["tenant_id", "code"]
    )


def downgrade() -> None:
    op.drop_index("ix_equipment_manual_error_codes_tenant_code", table_name="equipment_manual_error_codes")
    op.drop_index("ix_equipment_manual_error_codes_code", table_name="equipment_manual_error_codes")
    op.drop_index("ix_equipment_manual_error_codes_manual_id", table_name="equipment_manual_error_codes")
    op.drop_index("ix_equipment_manual_error_codes_tenant_id", table_name="equipment_manual_error_codes")
    op.drop_table("equipment_manual_error_codes")

    op.drop_column("equipment_manuals", "extracted_at")
    op.drop_column("equipment_manuals", "extraction_result")
    op.drop_column("equipment_manuals", "extraction_error")
    op.drop_column("equipment_manuals", "extraction_status")
