"""qrcodes table and budget S3 tracking fields

Revision ID: 20260602_0097
Revises: 20260601_0096
Create Date: 2026-06-02
"""

from alembic import op
import sqlalchemy as sa

revision = "20260602_0097"
down_revision = "20260601_0096"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "qrcodes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("linked_to_equipment_id", sa.Integer(), nullable=True),
        sa.Column("public_token", sa.String(length=36), nullable=False),
        sa.Column("pdf_s3_key", sa.String(length=512), nullable=True),
        sa.Column("image_s3_key", sa.String(length=512), nullable=True),
        sa.Column("tracking_url", sa.String(length=768), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="valid",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["linked_to_equipment_id"], ["equipments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_token", name="uq_qrcodes_public_token"),
    )
    op.create_index("ix_qrcodes_tenant_id", "qrcodes", ["tenant_id"])
    op.create_index("ix_qrcodes_linked_to_equipment_id", "qrcodes", ["linked_to_equipment_id"])

    op.add_column("budgets", sa.Column("pdf_s3_key", sa.String(length=512), nullable=True))
    op.add_column("budgets", sa.Column("tracking_url", sa.String(length=768), nullable=True))
    op.add_column(
        "budgets",
        sa.Column("pdf_file_missing", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("budgets", "pdf_file_missing")
    op.drop_column("budgets", "tracking_url")
    op.drop_column("budgets", "pdf_s3_key")
    op.drop_index("ix_qrcodes_linked_to_equipment_id", table_name="qrcodes")
    op.drop_index("ix_qrcodes_tenant_id", table_name="qrcodes")
    op.drop_table("qrcodes")
