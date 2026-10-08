"""Repara login_trusted_devices se ausente (histórico com revisão 0057 duplicada).

Revision ID: 20260430_0059
Revises: 20260430_0058
Create Date: 2026-05-05
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260430_0059"
down_revision: Union[str, None] = "20260430_0058"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS login_trusted_devices (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            device_fingerprint VARCHAR(64) NOT NULL,
            token_hash VARCHAR(64) NOT NULL,
            user_agent_hash VARCHAR(64),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            last_used_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        """
    )
    for stmt in (
        "CREATE INDEX IF NOT EXISTS ix_login_trusted_devices_user_id ON login_trusted_devices (user_id);",
        "CREATE INDEX IF NOT EXISTS ix_login_trusted_devices_device_fingerprint ON login_trusted_devices (device_fingerprint);",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_login_trusted_devices_token_hash ON login_trusted_devices (token_hash);",
        "CREATE INDEX IF NOT EXISTS ix_login_trusted_devices_expires_at ON login_trusted_devices (expires_at);",
    ):
        op.execute(stmt)


def downgrade() -> None:
    """Não remove dados em produção."""
    pass
