from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.schemas import EquipmentManualListOut, EquipmentManualOptionOut
from app.services.platform_catalog import resolve_catalog_list_tenant_id
from models import EquipmentManual, User, UserRole

router = APIRouter(prefix="/operacao/manuals", tags=["operacao-manuals"])


@router.get(
    "",
    response_model=EquipmentManualListOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def list_equipment_manuals(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentManualListOut:
    """Lista manuais do catálogo global (id + title) para select no cadastro de modelos."""
    catalog_tenant_id = resolve_catalog_list_tenant_id(db, current_user)
    rows = db.execute(
        select(EquipmentManual)
        .where(EquipmentManual.tenant_id == catalog_tenant_id)
        .order_by(EquipmentManual.title)
    ).scalars().all()
    return EquipmentManualListOut(
        items=[EquipmentManualOptionOut.model_validate(row) for row in rows],
    )
