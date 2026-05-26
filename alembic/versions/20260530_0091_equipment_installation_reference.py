"""Campo installation_reference em equipments e client_equipments."""

from alembic import op
import sqlalchemy as sa

revision = "20260530_0091"
down_revision = "20260529_0090"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("equipments", sa.Column("installation_reference", sa.String(length=500), nullable=True))
    op.add_column("client_equipments", sa.Column("installation_reference", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("client_equipments", "installation_reference")
    op.drop_column("equipments", "installation_reference")
