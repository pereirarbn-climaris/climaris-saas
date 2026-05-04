"""service item equipment audit trail

Revision ID: 20260425_0038
Revises: 20260425_0037
Create Date: 2026-04-25 11:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260425_0038"
down_revision = "20260425_0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "service_order_service_item_equipment_audits",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("service_order_id", sa.Integer(), sa.ForeignKey("service_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "service_item_id",
            sa.Integer(),
            sa.ForeignKey("service_order_service_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("previous_equipment_id", sa.Integer(), sa.ForeignKey("equipments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("new_equipment_id", sa.Integer(), sa.ForeignKey("equipments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("changed_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="app"),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_so_item_eq_audits_tenant_id",
        "service_order_service_item_equipment_audits",
        ["tenant_id"],
    )
    op.create_index(
        "ix_so_item_eq_audits_order_id",
        "service_order_service_item_equipment_audits",
        ["service_order_id"],
    )
    op.create_index(
        "ix_so_item_eq_audits_item_id",
        "service_order_service_item_equipment_audits",
        ["service_item_id"],
    )
    op.create_index(
        "ix_so_item_eq_audits_changed_by",
        "service_order_service_item_equipment_audits",
        ["changed_by_user_id"],
    )
    op.create_index(
        "ix_so_item_eq_audits_changed_at",
        "service_order_service_item_equipment_audits",
        ["changed_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_so_item_eq_audits_changed_at", table_name="service_order_service_item_equipment_audits")
    op.drop_index(
        "ix_so_item_eq_audits_changed_by",
        table_name="service_order_service_item_equipment_audits",
    )
    op.drop_index(
        "ix_so_item_eq_audits_item_id",
        table_name="service_order_service_item_equipment_audits",
    )
    op.drop_index(
        "ix_so_item_eq_audits_order_id",
        table_name="service_order_service_item_equipment_audits",
    )
    op.drop_index("ix_so_item_eq_audits_tenant_id", table_name="service_order_service_item_equipment_audits")
    op.drop_table("service_order_service_item_equipment_audits")
