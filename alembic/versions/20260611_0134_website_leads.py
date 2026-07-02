"""website leads table"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260611_0134"
down_revision = "20260611_0133"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "website_leads",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("company", sa.String(length=160), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False, server_default="website"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="new"),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_website_leads_email", "website_leads", ["email"])
    op.create_index("ix_website_leads_source", "website_leads", ["source"])
    op.create_index("ix_website_leads_status", "website_leads", ["status"])
    op.create_index("ix_website_leads_created_at", "website_leads", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_website_leads_created_at", table_name="website_leads")
    op.drop_index("ix_website_leads_status", table_name="website_leads")
    op.drop_index("ix_website_leads_source", table_name="website_leads")
    op.drop_index("ix_website_leads_email", table_name="website_leads")
    op.drop_table("website_leads")
