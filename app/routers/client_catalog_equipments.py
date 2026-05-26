from __future__ import annotations

import re
import uuid
from datetime import date
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.services.client_equipment_deletion import can_delete_client_equipment, delete_client_equipment
from app.services.platform_catalog import catalog_tenant_ids_for_lookup
from app.schemas import (
    ClientEquipmentCreate,
    ClientEquipmentInstallationReferenceUpdate,
    ClientEquipmentOut,
    ClientEquipmentSiteUpdate,
    ClientEquipmentStatusUpdate,
)
from app.services.client_sites import validate_equipment_client_site
from app.services.qrcode_labels import link_qrcode_to_equipment, normalize_code_id
from models import (
    Client,
    ClientEquipment,
    ClientEquipmentComponent,
    Equipment,
    EquipmentCatalog,
    EquipmentCatalogComponentType,
    EquipmentType,
    QrCode,
    User,
    UserRole,
)

router = APIRouter(prefix="/clients", tags=["client-equipments"])

_COMPONENT_LOAD = (
    joinedload(ClientEquipment.components)
    .joinedload(ClientEquipmentComponent.catalog)
    .joinedload(EquipmentCatalog.manual),
    joinedload(ClientEquipment.components)
    .joinedload(ClientEquipmentComponent.catalog)
    .joinedload(EquipmentCatalog.category),
    joinedload(ClientEquipment.legacy_equipment),
)


def _parse_btu(capacity: str | None) -> int | None:
    if not capacity:
        return None
    match = re.search(r"(\d{3,6})", capacity.replace(".", "").replace(",", ""))
    if not match:
        return None
    value = int(match.group(1))
    return value if value > 0 else None


def _primary_catalog(catalogs: list[EquipmentCatalog]) -> EquipmentCatalog:
    for catalog in catalogs:
        if catalog.component_type == EquipmentCatalogComponentType.CONDENSADORA:
            return catalog
    for catalog in catalogs:
        if catalog.component_type == EquipmentCatalogComponentType.EVAPORADORA:
            return catalog
    return catalogs[0]


def _primary_serial(components: list[ClientEquipmentComponent]) -> str | None:
    for row in components:
        if row.catalog.component_type == EquipmentCatalogComponentType.CONDENSADORA and row.serial_number:
            return row.serial_number
    for row in components:
        if row.serial_number:
            return row.serial_number
    return None


def _sync_legacy_equipment(
    *,
    client_id: int,
    client_site_id: int | None,
    catalogs: list[EquipmentCatalog],
    components: list[ClientEquipmentComponent],
    tag: str,
    installation_reference: str | None,
    installation_date: date | None,
    is_active: bool,
) -> Equipment:
    primary = _primary_catalog(catalogs)
    ident = tag.strip() or f"{primary.brand} {primary.model}".strip()
    equipment = Equipment(
        client_id=client_id,
        client_site_id=client_site_id,
        public_token=str(uuid4()),
        tipo=EquipmentType.AR_CONDICIONADO,
        identificacao=ident,
        fabricante=primary.brand,
        modelo=primary.model,
        serial=_primary_serial(components),
        capacidade_btu=_parse_btu(primary.capacity)
        if primary.category and primary.category.has_capacity
        else None,
        tipo_gas=primary.fluid_type,
        local_instalacao=tag,
        installation_reference=installation_reference,
        ambiente_nome=tag,
        ativo=is_active,
    )
    return equipment


def _get_client_or_404(db: Session, client_id: int, tenant_id: int) -> Client:
    client = db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")
    return client


def _load_catalogs_for_components(
    db: Session,
    tenant_id: int,
    payload: ClientEquipmentCreate,
) -> list[EquipmentCatalog]:
    catalogs: list[EquipmentCatalog] = []
    seen: set[uuid.UUID] = set()
    for comp in payload.components:
        try:
            catalog_uuid = uuid.UUID(comp.catalog_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"catalog_id inválido: {comp.catalog_id}",
            ) from exc
        if catalog_uuid in seen:
            continue
        seen.add(catalog_uuid)
        allowed_tenants = catalog_tenant_ids_for_lookup(db, tenant_id)
        catalog = db.execute(
            select(EquipmentCatalog)
            .options(joinedload(EquipmentCatalog.category))
            .where(
                EquipmentCatalog.id == catalog_uuid,
                EquipmentCatalog.tenant_id.in_(allowed_tenants),
            )
        ).scalar_one_or_none()
        if catalog is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item do catálogo não encontrado: {comp.catalog_id}",
            )
        catalogs.append(catalog)
    return catalogs


def _client_equipment_query():
    return select(ClientEquipment).options(*_COMPONENT_LOAD)


def _fetch_client_equipment(
    db: Session,
    installation_id: uuid.UUID,
    *,
    tenant_id: int | None = None,
) -> ClientEquipment | None:
    """Carrega instalação com componentes (joinedload exige Result.unique())."""
    stmt = _client_equipment_query().where(ClientEquipment.id == installation_id)
    if tenant_id is not None:
        stmt = stmt.where(ClientEquipment.tenant_id == tenant_id)
    return db.execute(stmt).unique().scalar_one_or_none()


def _qrcode_code_for_equipment(db: Session, equipment_id: int | None) -> str | None:
    if equipment_id is None:
        return None
    return db.execute(
        select(QrCode.code_id)
        .where(QrCode.linked_to_equipment_id == equipment_id)
        .order_by(QrCode.id.desc())
        .limit(1)
    ).scalar_one_or_none()


def _serialize_client_equipment(row: ClientEquipment, db: Session) -> ClientEquipmentOut:
    can_delete, block_reason = can_delete_client_equipment(db, row)
    payload = ClientEquipmentOut.model_validate(row)
    payload.can_delete = can_delete
    payload.delete_block_reason = block_reason
    if row.legacy_equipment is not None:
        payload.public_token = row.legacy_equipment.public_token
        payload.qrcode_code_id = _qrcode_code_for_equipment(db, row.legacy_equipment.id)
    return payload


@router.get("/{client_id}/equipments", response_model=list[ClientEquipmentOut])
def list_client_catalog_equipments(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    only_active: Annotated[bool, Query()] = False,
) -> list[ClientEquipmentOut]:
    _get_client_or_404(db, client_id, current_user.tenant_id)
    query = _client_equipment_query().where(
        ClientEquipment.client_id == client_id,
        ClientEquipment.tenant_id == current_user.tenant_id,
    )
    if only_active:
        query = query.where(ClientEquipment.is_active.is_(True))
    rows = db.execute(query.order_by(ClientEquipment.created_at.desc())).scalars().unique().all()
    return [_serialize_client_equipment(row, db) for row in rows]


@router.post(
    "/{client_id}/equipments",
    response_model=ClientEquipmentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def create_client_catalog_equipment(
    client_id: int,
    payload: ClientEquipmentCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientEquipmentOut:
    client = _get_client_or_404(db, client_id, current_user.tenant_id)
    catalogs = _load_catalogs_for_components(db, current_user.tenant_id, payload)
    validate_equipment_client_site(
        db,
        client_site_id=payload.client_site_id,
        client_id=client.id,
        tenant_id=current_user.tenant_id,
    )

    installation = ClientEquipment(
        tenant_id=current_user.tenant_id,
        client_id=client.id,
        client_site_id=payload.client_site_id,
        tag=payload.tag.strip(),
        installation_reference=payload.installation_reference,
        installation_date=payload.installation_date,
        is_active=True,
    )
    db.add(installation)
    db.flush()

    component_rows: list[ClientEquipmentComponent] = []
    catalog_by_id = {c.id: c for c in catalogs}
    for comp in payload.components:
        catalog_uuid = uuid.UUID(comp.catalog_id)
        row = ClientEquipmentComponent(
            client_equipment_id=installation.id,
            catalog_id=catalog_uuid,
            serial_number=comp.serial_number.strip() if comp.serial_number else None,
        )
        db.add(row)
        component_rows.append(row)

    db.flush()
    for row in component_rows:
        row.catalog = catalog_by_id[row.catalog_id]

    legacy = _sync_legacy_equipment(
        client_id=client.id,
        client_site_id=payload.client_site_id,
        catalogs=catalogs,
        components=component_rows,
        tag=payload.tag.strip(),
        installation_reference=payload.installation_reference,
        installation_date=payload.installation_date,
        is_active=True,
    )
    db.add(legacy)
    db.flush()
    installation.legacy_equipment_id = legacy.id

    if payload.qrcode_code_id and payload.qrcode_code_id.strip():
        try:
            link_qrcode_to_equipment(
                db,
                code_id=normalize_code_id(payload.qrcode_code_id),
                tenant_id=current_user.tenant_id,
                equipment_id=legacy.id,
                public_token=legacy.public_token,
            )
        except ValueError as exc:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    db.commit()
    installation = _fetch_client_equipment(db, installation.id, tenant_id=current_user.tenant_id)
    if installation is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Equipamento criado mas não foi possível recarregar.",
        )
    return _serialize_client_equipment(installation, db)


@router.patch(
    "/equipments/{equipment_id}/installation-reference",
    response_model=ClientEquipmentOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def update_client_catalog_equipment_installation_reference(
    equipment_id: uuid.UUID,
    payload: ClientEquipmentInstallationReferenceUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientEquipmentOut:
    installation = db.execute(
        select(ClientEquipment)
        .options(joinedload(ClientEquipment.legacy_equipment))
        .where(ClientEquipment.id == equipment_id, ClientEquipment.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if installation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado.")

    installation.installation_reference = payload.installation_reference
    if installation.legacy_equipment is not None:
        installation.legacy_equipment.installation_reference = payload.installation_reference

    db.commit()
    installation = _fetch_client_equipment(db, installation.id, tenant_id=current_user.tenant_id)
    if installation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado.")
    return _serialize_client_equipment(installation, db)


@router.delete(
    "/equipments/{equipment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def delete_client_catalog_equipment(
    equipment_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    installation = db.execute(
        select(ClientEquipment)
        .where(ClientEquipment.id == equipment_id, ClientEquipment.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if installation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado.")

    allowed, reason = can_delete_client_equipment(db, installation)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=reason or "Não é possível excluir este equipamento.",
        )

    try:
        delete_client_equipment(db, installation)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.patch(
    "/equipments/{equipment_id}/status",
    response_model=ClientEquipmentOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def update_client_catalog_equipment_status(
    equipment_id: uuid.UUID,
    payload: ClientEquipmentStatusUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientEquipmentOut:
    installation = db.execute(
        select(ClientEquipment)
        .options(joinedload(ClientEquipment.legacy_equipment))
        .where(ClientEquipment.id == equipment_id, ClientEquipment.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if installation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado.")

    installation.is_active = payload.is_active
    if installation.legacy_equipment is not None:
        installation.legacy_equipment.ativo = payload.is_active
    db.commit()
    installation = _fetch_client_equipment(db, installation.id, tenant_id=current_user.tenant_id)
    if installation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado.")
    return _serialize_client_equipment(installation, db)


@router.patch(
    "/equipments/{equipment_id}/site",
    response_model=ClientEquipmentOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def update_client_catalog_equipment_site(
    equipment_id: uuid.UUID,
    payload: ClientEquipmentSiteUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientEquipmentOut:
    """Atualiza somente a filial/obra (client_site_id) da instalação."""
    installation = db.execute(
        select(ClientEquipment)
        .options(joinedload(ClientEquipment.legacy_equipment))
        .where(ClientEquipment.id == equipment_id, ClientEquipment.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if installation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado.")

    site_id = payload.client_site_id
    if site_id is not None:
        validate_equipment_client_site(
            db,
            client_site_id=site_id,
            client_id=installation.client_id,
            tenant_id=current_user.tenant_id,
        )

    installation.client_site_id = site_id
    if installation.legacy_equipment is not None:
        installation.legacy_equipment.client_site_id = site_id

    db.commit()
    installation = _fetch_client_equipment(db, installation.id, tenant_id=current_user.tenant_id)
    if installation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado.")
    return _serialize_client_equipment(installation, db)
