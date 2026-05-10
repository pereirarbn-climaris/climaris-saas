"""NFS-e foundation (MEI settings, invoices, client flag).

Revision ID: 20260506_0066
Revises: 20260505_0065
Create Date: 2026-05-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260506_0066"
down_revision: Union[str, None] = "20260505_0065"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("optante_mei", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("clients", "optante_mei", server_default=None)

    op.create_table(
        "tenant_nfse_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("mei_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("default_optante_mei", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("mei_environment", sa.String(length=20), nullable=False, server_default="homolog"),
        sa.Column("mei_certificate_password_encrypted", sa.Text(), nullable=True),
        sa.Column("mei_certificate_base64_encrypted", sa.Text(), nullable=True),
        sa.Column("mei_portal_username_encrypted", sa.Text(), nullable=True),
        sa.Column("mei_portal_password_encrypted", sa.Text(), nullable=True),
        sa.Column("mei_last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("mei_last_test_error", sa.String(length=500), nullable=True),
        sa.Column("focus_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("focus_api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("focus_environment", sa.String(length=20), nullable=False, server_default="homolog"),
        sa.Column("auto_issue_on_payment", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_tenant_nfse_settings_tenant"),
    )
    op.create_index(op.f("ix_tenant_nfse_settings_tenant_id"), "tenant_nfse_settings", ["tenant_id"], unique=False)

    op.create_table(
        "nfse_invoices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("service_order_id", sa.Integer(), nullable=True),
        sa.Column("finance_entry_id", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending_submission"),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("rps_number", sa.String(length=40), nullable=True),
        sa.Column("nfse_number", sa.String(length=40), nullable=True),
        sa.Column("verification_code", sa.String(length=80), nullable=True),
        sa.Column("municipal_code", sa.String(length=7), nullable=True),
        sa.Column("request_payload_json", sa.Text(), nullable=True),
        sa.Column("response_payload_json", sa.Text(), nullable=True),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["finance_entry_id"], ["finance_entries.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["service_order_id"], ["service_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "service_order_id", name="uq_nfse_invoice_tenant_service_order"),
    )
    op.create_index(op.f("ix_nfse_invoices_tenant_id"), "nfse_invoices", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_nfse_invoices_client_id"), "nfse_invoices", ["client_id"], unique=False)
    op.create_index(op.f("ix_nfse_invoices_service_order_id"), "nfse_invoices", ["service_order_id"], unique=False)
    op.create_index(op.f("ix_nfse_invoices_finance_entry_id"), "nfse_invoices", ["finance_entry_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_nfse_invoices_finance_entry_id"), table_name="nfse_invoices")
    op.drop_index(op.f("ix_nfse_invoices_service_order_id"), table_name="nfse_invoices")
    op.drop_index(op.f("ix_nfse_invoices_client_id"), table_name="nfse_invoices")
    op.drop_index(op.f("ix_nfse_invoices_tenant_id"), table_name="nfse_invoices")
    op.drop_table("nfse_invoices")

    op.drop_index(op.f("ix_tenant_nfse_settings_tenant_id"), table_name="tenant_nfse_settings")
    op.drop_table("tenant_nfse_settings")

    op.drop_column("clients", "optante_mei")
