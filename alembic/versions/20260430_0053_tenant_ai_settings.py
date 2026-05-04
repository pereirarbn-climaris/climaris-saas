"""Tenant AI settings for Claude prompt behavior.

Revision ID: 20260430_0053
Revises: 20260430_0052
Create Date: 2026-04-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260430_0053"
down_revision: Union[str, None] = "20260430_0052"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tenant_ai_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("agent_name", sa.String(length=80), nullable=False, server_default="Assistente"),
        sa.Column("tone_of_voice", sa.String(length=20), nullable=False, server_default="amigavel"),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("model_slug", sa.String(length=80), nullable=False, server_default="claude-3-5-sonnet-latest"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_tenant_ai_settings_tenant"),
    )
    op.create_index(op.f("ix_tenant_ai_settings_tenant_id"), "tenant_ai_settings", ["tenant_id"], unique=False)

    op.execute(
        """
        INSERT INTO tenant_ai_settings (tenant_id, agent_name, tone_of_voice, instructions, model_slug)
        SELECT id, 'Assistente', 'amigavel',
               'Reagendamentos e cancelamentos devem ser confirmados por um atendente humano.',
               'claude-3-5-sonnet-latest'
        FROM tenants;
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_tenant_ai_settings_tenant_id"), table_name="tenant_ai_settings")
    op.drop_table("tenant_ai_settings")
