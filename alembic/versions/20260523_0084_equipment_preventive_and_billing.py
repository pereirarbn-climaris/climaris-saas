"""Equipment preventive rules + customer billing automation preferences.

Revision ID: 20260523_0084
Revises: 20260518_0083
Create Date: 2026-05-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260523_0084"
down_revision: Union[str, None] = "20260518_0083"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "equipment_preventive_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("equipment_id", sa.Integer(), sa.ForeignKey("equipments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("interval_value", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("interval_type", sa.String(length=16), nullable=False, server_default="months"),
        sa.Column("last_performed_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("equipment_id", name="uq_equipment_preventive_rule_equipment"),
    )
    op.create_index("ix_equipment_preventive_rules_equipment_id", "equipment_preventive_rules", ["equipment_id"])
    op.create_index("ix_equipment_preventive_rules_next_due_date", "equipment_preventive_rules", ["next_due_date"])

    op.create_table(
        "customer_billing_automations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("auto_emit_nfse", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("payment_gateway", sa.String(length=24), nullable=False, server_default="manual"),
        sa.Column("days_to_due", sa.Integer(), nullable=False, server_default="15"),
        sa.Column("auto_send_whatsapp", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("client_id", name="uq_customer_billing_automation_client"),
    )
    op.create_index("ix_customer_billing_automations_client_id", "customer_billing_automations", ["client_id"])


def downgrade() -> None:
    op.drop_index("ix_customer_billing_automations_client_id", table_name="customer_billing_automations")
    op.drop_table("customer_billing_automations")
    op.drop_index("ix_equipment_preventive_rules_next_due_date", table_name="equipment_preventive_rules")
    op.drop_index("ix_equipment_preventive_rules_equipment_id", table_name="equipment_preventive_rules")
    op.drop_table("equipment_preventive_rules")
