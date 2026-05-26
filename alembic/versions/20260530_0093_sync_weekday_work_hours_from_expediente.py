"""Sincroniza weekday_work_hours com expediente (workday_start/end + business_days)."""

from alembic import op
import sqlalchemy as sa

from app.tenant_work_hours import weekday_work_hours_json_from_expediente

revision = "20260530_0093"
down_revision = "20260530_0092"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, business_days, workday_start, workday_end FROM tenants")
    ).fetchall()
    for row in rows:
        payload = weekday_work_hours_json_from_expediente(
            business_days=row.business_days,
            workday_start=row.workday_start,
            workday_end=row.workday_end,
        )
        conn.execute(
            sa.text("UPDATE tenants SET weekday_work_hours = :payload WHERE id = :tenant_id"),
            {"payload": payload, "tenant_id": row.id},
        )


def downgrade() -> None:
    pass
