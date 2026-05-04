"""harden login security with lockout, captcha, 2fa, and audit

Revision ID: 20260425_0041
Revises: 20260425_0040
Create Date: 2026-04-25 13:35:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260425_0041"
down_revision = "20260425_0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column("login_blocked_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.alter_column("users", "failed_login_attempts", server_default=None)
    op.create_table(
        "login_attempt_audits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("device_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("outcome", sa.String(length=24), nullable=False),
        sa.Column("reason", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_login_attempt_audits_email"), "login_attempt_audits", ["email"], unique=False)
    op.create_index(op.f("ix_login_attempt_audits_tenant_id"), "login_attempt_audits", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_login_attempt_audits_user_id"), "login_attempt_audits", ["user_id"], unique=False)
    op.create_index(op.f("ix_login_attempt_audits_ip_address"), "login_attempt_audits", ["ip_address"], unique=False)
    op.create_index(
        op.f("ix_login_attempt_audits_device_fingerprint"), "login_attempt_audits", ["device_fingerprint"], unique=False
    )
    op.create_index(op.f("ix_login_attempt_audits_outcome"), "login_attempt_audits", ["outcome"], unique=False)
    op.create_index(op.f("ix_login_attempt_audits_created_at"), "login_attempt_audits", ["created_at"], unique=False)

    op.create_table(
        "login_client_security_states",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("device_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("blocked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", "device_fingerprint", name="uq_login_client_state_email_device"),
    )
    op.alter_column("login_client_security_states", "failed_attempts", server_default=None)
    op.create_index(op.f("ix_login_client_security_states_email"), "login_client_security_states", ["email"], unique=False)
    op.create_index(
        op.f("ix_login_client_security_states_ip_address"), "login_client_security_states", ["ip_address"], unique=False
    )
    op.create_index(
        op.f("ix_login_client_security_states_device_fingerprint"),
        "login_client_security_states",
        ["device_fingerprint"],
        unique=False,
    )
    op.create_index(
        op.f("ix_login_client_security_states_blocked_until"), "login_client_security_states", ["blocked_until"], unique=False
    )

    op.create_table(
        "login_captcha_challenges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("device_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("answer_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.alter_column("login_captcha_challenges", "attempts", server_default=None)
    op.create_index(op.f("ix_login_captcha_challenges_token_hash"), "login_captcha_challenges", ["token_hash"], unique=True)
    op.create_index(op.f("ix_login_captcha_challenges_email"), "login_captcha_challenges", ["email"], unique=False)
    op.create_index(
        op.f("ix_login_captcha_challenges_device_fingerprint"),
        "login_captcha_challenges",
        ["device_fingerprint"],
        unique=False,
    )
    op.create_index(
        op.f("ix_login_captcha_challenges_expires_at"), "login_captcha_challenges", ["expires_at"], unique=False
    )

    op.create_table(
        "login_two_factor_challenges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.alter_column("login_two_factor_challenges", "attempts", server_default=None)
    op.create_index(op.f("ix_login_two_factor_challenges_user_id"), "login_two_factor_challenges", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_login_two_factor_challenges_token_hash"), "login_two_factor_challenges", ["token_hash"], unique=True
    )
    op.create_index(
        op.f("ix_login_two_factor_challenges_expires_at"), "login_two_factor_challenges", ["expires_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_login_two_factor_challenges_expires_at"), table_name="login_two_factor_challenges")
    op.drop_index(op.f("ix_login_two_factor_challenges_token_hash"), table_name="login_two_factor_challenges")
    op.drop_index(op.f("ix_login_two_factor_challenges_user_id"), table_name="login_two_factor_challenges")
    op.drop_table("login_two_factor_challenges")

    op.drop_index(op.f("ix_login_captcha_challenges_expires_at"), table_name="login_captcha_challenges")
    op.drop_index(op.f("ix_login_captcha_challenges_device_fingerprint"), table_name="login_captcha_challenges")
    op.drop_index(op.f("ix_login_captcha_challenges_email"), table_name="login_captcha_challenges")
    op.drop_index(op.f("ix_login_captcha_challenges_token_hash"), table_name="login_captcha_challenges")
    op.drop_table("login_captcha_challenges")

    op.drop_index(op.f("ix_login_client_security_states_blocked_until"), table_name="login_client_security_states")
    op.drop_index(
        op.f("ix_login_client_security_states_device_fingerprint"),
        table_name="login_client_security_states",
    )
    op.drop_index(op.f("ix_login_client_security_states_ip_address"), table_name="login_client_security_states")
    op.drop_index(op.f("ix_login_client_security_states_email"), table_name="login_client_security_states")
    op.drop_constraint("uq_login_client_state_email_device", "login_client_security_states", type_="unique")
    op.drop_table("login_client_security_states")

    op.drop_index(op.f("ix_login_attempt_audits_created_at"), table_name="login_attempt_audits")
    op.drop_index(op.f("ix_login_attempt_audits_outcome"), table_name="login_attempt_audits")
    op.drop_index(op.f("ix_login_attempt_audits_device_fingerprint"), table_name="login_attempt_audits")
    op.drop_index(op.f("ix_login_attempt_audits_ip_address"), table_name="login_attempt_audits")
    op.drop_index(op.f("ix_login_attempt_audits_user_id"), table_name="login_attempt_audits")
    op.drop_index(op.f("ix_login_attempt_audits_tenant_id"), table_name="login_attempt_audits")
    op.drop_index(op.f("ix_login_attempt_audits_email"), table_name="login_attempt_audits")
    op.drop_table("login_attempt_audits")

    op.drop_column("users", "login_blocked_until")
    op.drop_column("users", "failed_login_attempts")
