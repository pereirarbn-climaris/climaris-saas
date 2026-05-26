from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.reports_efficiency import build_efficiency_report
from app.schemas import EfficiencyReportOut
from models import User, UserRole

router = APIRouter(prefix="/reports", tags=["reports"])

_REPORT_ROLES = [Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))]


@router.get("/efficiency", response_model=EfficiencyReportOut, dependencies=_REPORT_ROLES)
def get_efficiency_report(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EfficiencyReportOut:
    """Compara tempo estimado (catálogo) vs. tempo real de execução por técnico e por serviço."""
    report = build_efficiency_report(db, tenant_id=current_user.tenant_id)
    return EfficiencyReportOut(
        by_technician=[
            {
                "technician_id": row.technician_id,
                "technician_name": row.technician_name,
                "orders_count": row.orders_count,
                "estimated_minutes": row.estimated_minutes,
                "actual_minutes": row.actual_minutes,
                "variance_pct": row.variance_pct,
            }
            for row in report.by_technician
        ],
        by_service=[
            {
                "service_id": row.service_id,
                "service_name": row.service_name,
                "orders_count": row.orders_count,
                "estimated_minutes": row.estimated_minutes,
                "actual_minutes": row.actual_minutes,
                "variance_pct": row.variance_pct,
            }
            for row in report.by_service
        ],
    )
