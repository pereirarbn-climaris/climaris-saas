"""Permissões de contexto e ferramentas do assistente IA por tenant.

Revision ID: 20260505_0060
Revises: 20260430_0059
Create Date: 2026-05-05
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260505_0060"
down_revision: Union[str, None] = "20260430_0059"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    stmts = [
        "ALTER TABLE tenant_ai_settings ADD COLUMN IF NOT EXISTS ai_context_products BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE tenant_ai_settings ADD COLUMN IF NOT EXISTS ai_context_service_prices BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE tenant_ai_settings ADD COLUMN IF NOT EXISTS ai_context_services_catalog BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE tenant_ai_settings ADD COLUMN IF NOT EXISTS ai_tool_billing BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE tenant_ai_settings ADD COLUMN IF NOT EXISTS ai_tool_cancel BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE tenant_ai_settings ADD COLUMN IF NOT EXISTS ai_tool_reschedule BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE tenant_ai_settings ADD COLUMN IF NOT EXISTS ai_tool_agenda_read BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE tenant_ai_settings ADD COLUMN IF NOT EXISTS ai_clarification_instructions TEXT",
    ]
    for sql in stmts:
        op.execute(sql)


def downgrade() -> None:
    stmts = [
        "ALTER TABLE tenant_ai_settings DROP COLUMN IF EXISTS ai_context_products",
        "ALTER TABLE tenant_ai_settings DROP COLUMN IF EXISTS ai_context_service_prices",
        "ALTER TABLE tenant_ai_settings DROP COLUMN IF EXISTS ai_context_services_catalog",
        "ALTER TABLE tenant_ai_settings DROP COLUMN IF EXISTS ai_tool_billing",
        "ALTER TABLE tenant_ai_settings DROP COLUMN IF EXISTS ai_tool_cancel",
        "ALTER TABLE tenant_ai_settings DROP COLUMN IF EXISTS ai_tool_reschedule",
        "ALTER TABLE tenant_ai_settings DROP COLUMN IF EXISTS ai_tool_agenda_read",
        "ALTER TABLE tenant_ai_settings DROP COLUMN IF EXISTS ai_clarification_instructions",
    ]
    for sql in stmts:
        op.execute(sql)
