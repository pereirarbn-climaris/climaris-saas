"""campaign external leads + log recipient phone

Revision ID: 20260608_0107
Revises: 20260607_0106
Create Date: 2026-06-08
"""

from alembic import op
import sqlalchemy as sa

revision = "20260608_0107"
down_revision = "20260607_0106"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "campaign_external_leads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("import_batch_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("source_filename", sa.String(length=180), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_campaign_external_leads_tenant_id", "campaign_external_leads", ["tenant_id"])
    op.create_index("ix_campaign_external_leads_import_batch_id", "campaign_external_leads", ["import_batch_id"])
    op.create_index("ix_campaign_external_leads_phone", "campaign_external_leads", ["phone"])

    op.add_column("campaign_logs", sa.Column("external_lead_id", sa.Integer(), nullable=True))
    op.add_column("campaign_logs", sa.Column("recipient_whatsapp", sa.String(length=20), nullable=True))
    op.create_foreign_key(
        "fk_campaign_logs_external_lead_id",
        "campaign_logs",
        "campaign_external_leads",
        ["external_lead_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_campaign_logs_external_lead_id", "campaign_logs", ["external_lead_id"])


def downgrade() -> None:
    op.drop_index("ix_campaign_logs_external_lead_id", table_name="campaign_logs")
    op.drop_constraint("fk_campaign_logs_external_lead_id", "campaign_logs", type_="foreignkey")
    op.drop_column("campaign_logs", "recipient_whatsapp")
    op.drop_column("campaign_logs", "external_lead_id")
    op.drop_index("ix_campaign_external_leads_phone", table_name="campaign_external_leads")
    op.drop_index("ix_campaign_external_leads_import_batch_id", table_name="campaign_external_leads")
    op.drop_index("ix_campaign_external_leads_tenant_id", table_name="campaign_external_leads")
    op.drop_table("campaign_external_leads")
