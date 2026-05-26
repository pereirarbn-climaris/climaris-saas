"""Logo do cliente para etiquetas QR."""

from alembic import op
import sqlalchemy as sa

revision = "20260604_0099"
down_revision = "20260603_0098"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("logo_s3_key", sa.String(length=255), nullable=True))
    op.add_column("clients", sa.Column("logo_url", sa.String(length=500), nullable=True))
    op.add_column("clients", sa.Column("logo_content_type", sa.String(length=80), nullable=True))
    op.add_column("clients", sa.Column("logo_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("clients", "logo_updated_at")
    op.drop_column("clients", "logo_content_type")
    op.drop_column("clients", "logo_url")
    op.drop_column("clients", "logo_s3_key")
