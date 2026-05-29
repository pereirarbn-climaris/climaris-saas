"""campaign interactions analytics

Revision ID: 20260607_0106
Revises: 20260606_0105
Create Date: 2026-06-07
"""

from alembic import op
import sqlalchemy as sa

revision = "20260607_0106"
down_revision = "20260606_0105"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "campaign_interactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("interaction_type", sa.String(length=32), nullable=False),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("idx_campaign_id", "campaign_interactions", ["campaign_id"])
    op.create_index("idx_client_id", "campaign_interactions", ["client_id"])
    op.create_index("ix_campaign_interactions_type", "campaign_interactions", ["interaction_type"])
    op.create_index(
        "ix_campaign_interactions_campaign_client_type",
        "campaign_interactions",
        ["campaign_id", "client_id", "interaction_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_campaign_interactions_campaign_client_type", table_name="campaign_interactions")
    op.drop_index("ix_campaign_interactions_type", table_name="campaign_interactions")
    op.drop_index("idx_client_id", table_name="campaign_interactions")
    op.drop_index("idx_campaign_id", table_name="campaign_interactions")
    op.drop_table("campaign_interactions")
