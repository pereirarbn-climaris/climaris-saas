"""equipments and optional service item equipment link

Revision ID: 20260425_0037
Revises: 20260424_0036
Create Date: 2026-04-25 10:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260425_0037"
down_revision = "20260424_0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "equipments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(length=40), nullable=False, server_default="AR_CONDICIONADO"),
        sa.Column("identificacao", sa.String(length=120), nullable=False),
        sa.Column("fabricante", sa.String(length=120), nullable=True),
        sa.Column("modelo", sa.String(length=120), nullable=True),
        sa.Column("serial", sa.String(length=120), nullable=True),
        sa.Column("capacidade_btu", sa.Integer(), nullable=True),
        sa.Column("local_instalacao", sa.String(length=180), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_equipments_client_id", "equipments", ["client_id"])
    op.create_index("ix_equipments_tipo", "equipments", ["tipo"])

    op.add_column("service_order_service_items", sa.Column("equipment_id", sa.Integer(), nullable=True))
    op.create_index(
        "ix_service_order_service_items_equipment_id", "service_order_service_items", ["equipment_id"]
    )
    op.create_foreign_key(
        "fk_service_order_service_items_equipment_id_equipments",
        "service_order_service_items",
        "equipments",
        ["equipment_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_service_order_service_items_equipment_id_equipments",
        "service_order_service_items",
        type_="foreignkey",
    )
    op.drop_index("ix_service_order_service_items_equipment_id", table_name="service_order_service_items")
    op.drop_column("service_order_service_items", "equipment_id")
    op.drop_index("ix_equipments_tipo", table_name="equipments")
    op.drop_index("ix_equipments_client_id", table_name="equipments")
    op.drop_table("equipments")
