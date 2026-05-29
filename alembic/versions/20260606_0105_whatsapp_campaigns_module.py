"""whatsapp campaigns module

Revision ID: 20260606_0105
Revises: 20260606_0104
Create Date: 2026-06-06
"""

from alembic import op
import sqlalchemy as sa

revision = "20260606_0105"
down_revision = "20260606_0104"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "campaign_assets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.String(length=600), nullable=False),
        sa.Column("s3_key", sa.String(length=512), nullable=True),
        sa.Column("content_type", sa.String(length=80), nullable=True),
        sa.Column("original_filename", sa.String(length=180), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_campaign_assets_tenant_id", "campaign_assets", ["tenant_id"])

    op.create_table(
        "campaigns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("message_template", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="draft"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("segment_kind", sa.String(length=40), nullable=False, server_default="inactive_since"),
        sa.Column("segment_params_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("campaign_assets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("total_contacts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_campaigns_tenant_id", "campaigns", ["tenant_id"])
    op.create_index("ix_campaigns_status", "campaigns", ["status"])
    op.create_index("ix_campaigns_scheduled_at", "campaigns", ["scheduled_at"])

    op.create_table(
        "campaign_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_campaign_logs_campaign_id", "campaign_logs", ["campaign_id"])
    op.create_index("ix_campaign_logs_client_id", "campaign_logs", ["client_id"])
    op.create_index("ix_campaign_logs_status", "campaign_logs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_campaign_logs_status", table_name="campaign_logs")
    op.drop_index("ix_campaign_logs_client_id", table_name="campaign_logs")
    op.drop_index("ix_campaign_logs_campaign_id", table_name="campaign_logs")
    op.drop_table("campaign_logs")
    op.drop_index("ix_campaigns_scheduled_at", table_name="campaigns")
    op.drop_index("ix_campaigns_status", table_name="campaigns")
    op.drop_index("ix_campaigns_tenant_id", table_name="campaigns")
    op.drop_table("campaigns")
    op.drop_index("ix_campaign_assets_tenant_id", table_name="campaign_assets")
    op.drop_table("campaign_assets")
