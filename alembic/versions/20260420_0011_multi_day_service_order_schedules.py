"""Allow multiple schedules per service order.

Revision ID: 20260420_0011
Revises: 20260420_0010
Create Date: 2026-04-20
"""

from alembic import op

revision = "20260420_0011"
down_revision = "20260420_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(op.f("ix_schedules_service_order_id"), table_name="schedules")
    op.create_index(op.f("ix_schedules_service_order_id"), "schedules", ["service_order_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_schedules_service_order_id"), table_name="schedules")
    op.create_index(op.f("ix_schedules_service_order_id"), "schedules", ["service_order_id"], unique=True)
