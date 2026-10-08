"""Rotas públicas (sem login): ficha do equipamento para QR."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.schemas import EquipmentTokenResolveOut, PublicEquipmentHistoryEntryOut, PublicEquipmentPageOut
from models import (
    Client,
    Equipment,
    OrderStatus,
    Service,
    ServiceOrder,
    ServiceOrderServiceItem,
    ServiceOrderServiceItemEquipmentAudit,
    Tenant,
    User,
)

router = APIRouter(prefix="/public", tags=["public"])
equipment_token_router = APIRouter(prefix="/equipment-public", tags=["equipment-public"])


@router.get("/equipment/{token}", response_model=PublicEquipmentPageOut)
def public_equipment_page(
    token: str,
    db: Annotated[Session, Depends(get_db)],
) -> PublicEquipmentPageOut:
    row = db.execute(
        select(Equipment, Tenant.name)
        .join(Client, Client.id == Equipment.client_id)
        .join(Tenant, Tenant.id == Client.tenant_id)
        .where(Equipment.public_token == token.strip())
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado.")
    equipment, tenant_name = row[0], row[1]
    tenant_id = db.execute(select(Client.tenant_id).where(Client.id == equipment.client_id)).scalar_one()
    eq_id = equipment.id
    entries: list[PublicEquipmentHistoryEntryOut] = []

    audit_rows = db.execute(
        select(
            ServiceOrderServiceItemEquipmentAudit.changed_at,
            ServiceOrderServiceItemEquipmentAudit.source,
            ServiceOrderServiceItemEquipmentAudit.service_order_id,
            Service.name,
        )
        .select_from(ServiceOrderServiceItemEquipmentAudit)
        .join(ServiceOrder, ServiceOrder.id == ServiceOrderServiceItemEquipmentAudit.service_order_id)
        .join(ServiceOrderServiceItem, ServiceOrderServiceItem.id == ServiceOrderServiceItemEquipmentAudit.service_item_id)
        .join(Service, Service.id == ServiceOrderServiceItem.service_id)
        .where(
            ServiceOrder.tenant_id == tenant_id,
            or_(
                ServiceOrderServiceItemEquipmentAudit.previous_equipment_id == eq_id,
                ServiceOrderServiceItemEquipmentAudit.new_equipment_id == eq_id,
            ),
        )
        .order_by(ServiceOrderServiceItemEquipmentAudit.changed_at.desc())
    ).all()

    for r in audit_rows:
        src = r[1] or "app"
        label = "Separação automática" if src == "auto_split" else ("App" if src == "app" else src)
        entries.append(
            PublicEquipmentHistoryEntryOut(
                occurred_at=r[0],
                kind="registro",
                title=f"OS #{r[2]} — {r[3] or 'Serviço'}",
                detail=f"Origem: {label}",
            )
        )

    visit_rows = db.execute(
        select(
            ServiceOrder.closed_at,
            ServiceOrder.opened_at,
            ServiceOrder.id,
            Service.name,
        )
        .select_from(ServiceOrderServiceItem)
        .join(ServiceOrder, ServiceOrder.id == ServiceOrderServiceItem.service_order_id)
        .join(Service, Service.id == ServiceOrderServiceItem.service_id)
        .where(
            ServiceOrder.tenant_id == tenant_id,
            ServiceOrderServiceItem.equipment_id == eq_id,
            ServiceOrder.status == OrderStatus.DONE,
        )
    ).all()

    for r in visit_rows:
        entries.append(
            PublicEquipmentHistoryEntryOut(
                occurred_at=r[0] or r[1],
                kind="servico",
                title=f"OS #{r[2]} concluída — {r[3] or 'Serviço'}",
                detail=None,
            )
        )

    entries.sort(key=lambda e: e.occurred_at, reverse=True)

    tipo_val = equipment.tipo.value if hasattr(equipment.tipo, "value") else str(equipment.tipo)
    return PublicEquipmentPageOut(
        tenant_name=str(tenant_name or "—"),
        identificacao=equipment.identificacao,
        tipo=tipo_val,
        modelo=equipment.modelo,
        fabricante=equipment.fabricante,
        entries=entries,
    )


@equipment_token_router.get("/resolve/{token}", response_model=EquipmentTokenResolveOut)
def resolve_public_equipment_token(
    token: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentTokenResolveOut:
    """Para usuário logado no tenant: localiza equipamento pelo token público (QR)."""
    equipment = db.execute(
        select(Equipment)
        .join(Client, Client.id == Equipment.client_id)
        .where(Equipment.public_token == token.strip(), Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if equipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado.")
    return EquipmentTokenResolveOut(
        equipment_id=equipment.id,
        client_id=equipment.client_id,
        identificacao=equipment.identificacao,
        public_token=equipment.public_token,
    )
