"""OS: vínculo opcional com filial/obra do cliente (endereço do serviço).

Revision ID: 20260702_0143
Revises: 20260701_0142
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260702_0143"
down_revision = "20260701_0142"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("service_orders", sa.Column("client_site_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_service_orders_client_site_id",
        "service_orders",
        "client_sites",
        ["client_site_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_service_orders_client_site_id"), "service_orders", ["client_site_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_service_orders_client_site_id"), table_name="service_orders")
    op.drop_constraint("fk_service_orders_client_site_id", "service_orders", type_="foreignkey")
    op.drop_column("service_orders", "client_site_id")
