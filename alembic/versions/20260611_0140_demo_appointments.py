"""demo appointments table"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260611_0140"
down_revision = "20260611_0139"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "demo_appointments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("website_lead_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("company", sa.String(length=160), nullable=True),
        sa.Column("job_title", sa.String(length=80), nullable=True),
        sa.Column("technicians_count", sa.String(length=24), nullable=True),
        sa.Column("selected_plan", sa.String(length=80), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="45"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="scheduled"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["website_lead_id"], ["website_leads.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_demo_appointments_email", "demo_appointments", ["email"])
    op.create_index("ix_demo_appointments_scheduled_at", "demo_appointments", ["scheduled_at"])
    op.create_index("ix_demo_appointments_status", "demo_appointments", ["status"])
    op.create_index("ix_demo_appointments_website_lead_id", "demo_appointments", ["website_lead_id"])


def downgrade() -> None:
    op.drop_index("ix_demo_appointments_website_lead_id", table_name="demo_appointments")
    op.drop_index("ix_demo_appointments_status", table_name="demo_appointments")
    op.drop_index("ix_demo_appointments_scheduled_at", table_name="demo_appointments")
    op.drop_index("ix_demo_appointments_email", table_name="demo_appointments")
    op.drop_table("demo_appointments")
