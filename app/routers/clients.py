from datetime import datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.client_service import (
    client_dependency_counts,
    client_filter_conditions,
    client_has_contact_condition,
    ensure_unique_client_contact,
    strip_optional,
)
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.routers.equipment_documents import serialize_equipment_document_out
from app.schemas import (
    ClientCreate,
    ClientListOut,
    ClientListSummaryOut,
    ClientOut,
    ClientServiceItemLinkRowOut,
    ClientUpdate,
    EquipmentCreate,
    EquipmentDocumentWithEquipmentOut,
    EquipmentHistoryRowOut,
    EquipmentOut,
    EquipmentUpdate,
)
from app.tax_id import normalize_and_validate_tax_document
from models import (
    Client,
    Equipment,
    EquipmentDocument,
    OrderStatus,
    Service,
    ServiceOrder,
    ServiceOrderServiceItem,
    ServiceOrderServiceItemEquipmentAudit,
    User,
    UserRole,
)

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=list[ClientOut])
def list_clients(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    q: Annotated[str | None, Query(description="Filter by name, document or email")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 20,
) -> list[Client]:
    query = select(Client).where(*client_filter_conditions(current_user.tenant_id, q=q))
    return db.execute(query.order_by(Client.id.desc()).offset(skip).limit(limit)).scalars().all()


@router.get("/page", response_model=ClientListOut)
def list_clients_page(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    q: Annotated[str | None, Query(description="Filter by name, document, email, phone or WhatsApp")] = None,
    tax_id_kind: Annotated[str | None, Query(pattern="^(cpf|cnpj)$")] = None,
    contact: Annotated[str | None, Query(pattern="^(with|without)$")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> ClientListOut:
    conditions = client_filter_conditions(
        current_user.tenant_id,
        q=q,
        tax_id_kind=tax_id_kind,
        contact=contact,
    )
    total = db.execute(select(func.count()).select_from(Client).where(*conditions)).scalar_one()
    companies = db.execute(
        select(func.count()).select_from(Client).where(*conditions, Client.tax_id_kind == "cnpj")
    ).scalar_one()
    individuals = db.execute(
        select(func.count()).select_from(Client).where(*conditions, Client.tax_id_kind == "cpf")
    ).scalar_one()
    active = db.execute(
        select(func.count())
        .select_from(Client)
        .where(*conditions, client_has_contact_condition())
    ).scalar_one()
    items = (
        db.execute(select(Client).where(*conditions).order_by(Client.id.desc()).offset(skip).limit(limit))
        .scalars()
        .all()
    )
    return ClientListOut(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        summary=ClientListSummaryOut(
            total=total,
            companies=companies,
            individuals=individuals,
            active=active,
        ),
    )


@router.get("/{client_id}", response_model=ClientOut)
def get_client(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Client:
    client = db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")
    return client


@router.post(
    "",
    response_model=ClientOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def create_client(
    payload: ClientCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Client:
    phone = strip_optional(payload.phone)
    whatsapp = strip_optional(payload.whatsapp)
    if payload.document:
        existing = db.execute(
            select(Client).where(Client.tenant_id == current_user.tenant_id, Client.document == payload.document)
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe um cliente com este CPF/CNPJ nesta empresa.",
            )
    ensure_unique_client_contact(db, tenant_id=current_user.tenant_id, field="phone", value=phone)
    ensure_unique_client_contact(db, tenant_id=current_user.tenant_id, field="whatsapp", value=whatsapp)

    client = Client(
        tenant_id=current_user.tenant_id,
        name=payload.name,
        document=payload.document,
        tax_id_kind=payload.tax_id_kind,  # set by ClientCreate validator (infer CPF/CNPJ from digits)
        phone=phone,
        whatsapp=whatsapp,
        email=payload.email.lower() if payload.email else None,
        trade_name=payload.trade_name,
        state_registration=payload.state_registration,
        ie_indicator=payload.ie_indicator,
        municipal_registration=payload.municipal_registration,
        address_street=payload.address_street,
        address_number=payload.address_number,
        address_complement=payload.address_complement,
        address_district=payload.address_district,
        address_city=payload.address_city,
        address_state=payload.address_state,
        address_postal_code=payload.address_postal_code,
        address_country=payload.address_country or "Brasil",
        address_ibge_code=payload.address_ibge_code,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.put(
    "/{client_id}",
    response_model=ClientOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def update_client(
    client_id: int,
    payload: ClientUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Client:
    client = db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")

    fields_set = payload.model_fields_set

    if "tax_id_kind" in fields_set and payload.tax_id_kind is not None:
        client.tax_id_kind = payload.tax_id_kind

    if "document" in fields_set:
        if payload.document is not None:
            try:
                client.document = normalize_and_validate_tax_document(payload.document, client.tax_id_kind)
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
            existing = db.execute(
                select(Client).where(
                    Client.tenant_id == current_user.tenant_id,
                    Client.document == client.document,
                    Client.id != client_id,
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Já existe um cliente com este CPF/CNPJ nesta empresa.",
                )
        else:
            client.document = None
    elif "tax_id_kind" in fields_set and payload.tax_id_kind is not None and client.document:
        try:
            client.document = normalize_and_validate_tax_document(client.document, client.tax_id_kind)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    if "name" in fields_set:
        if payload.name is None or not str(payload.name).strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Nome é obrigatório.",
            )
        client.name = str(payload.name).strip()

    if "phone" in fields_set:
        phone = strip_optional(payload.phone)
        ensure_unique_client_contact(
            db,
            tenant_id=current_user.tenant_id,
            field="phone",
            value=phone,
            client_id=client_id,
        )
        client.phone = phone

    if "whatsapp" in fields_set:
        whatsapp = strip_optional(payload.whatsapp)
        ensure_unique_client_contact(
            db,
            tenant_id=current_user.tenant_id,
            field="whatsapp",
            value=whatsapp,
            client_id=client_id,
        )
        client.whatsapp = whatsapp

    if "email" in fields_set:
        client.email = payload.email.lower() if payload.email else None

    if "trade_name" in fields_set:
        client.trade_name = strip_optional(payload.trade_name)

    if "state_registration" in fields_set:
        client.state_registration = strip_optional(payload.state_registration)

    if "ie_indicator" in fields_set:
        client.ie_indicator = payload.ie_indicator

    if "municipal_registration" in fields_set:
        client.municipal_registration = strip_optional(payload.municipal_registration)

    if "address_street" in fields_set:
        client.address_street = strip_optional(payload.address_street)

    if "address_number" in fields_set:
        client.address_number = strip_optional(payload.address_number)

    if "address_complement" in fields_set:
        client.address_complement = strip_optional(payload.address_complement)

    if "address_district" in fields_set:
        client.address_district = strip_optional(payload.address_district)

    if "address_city" in fields_set:
        client.address_city = strip_optional(payload.address_city)

    if "address_state" in fields_set:
        client.address_state = payload.address_state

    if "address_postal_code" in fields_set:
        client.address_postal_code = strip_optional(payload.address_postal_code)

    if "address_country" in fields_set:
        client.address_country = strip_optional(payload.address_country) or "Brasil"

    if "address_ibge_code" in fields_set:
        client.address_ibge_code = payload.address_ibge_code

    db.commit()
    db.refresh(client)
    return client


@router.delete(
    "/{client_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def delete_client(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    client = db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")

    dependency_counts = client_dependency_counts(db, tenant_id=current_user.tenant_id, client_id=client.id)
    blockers = [f"{count} {label}" for label, count in dependency_counts.items() if count]
    if blockers:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Não é possível excluir este cliente porque ele possui vínculos com "
                f"{', '.join(blockers)}. Remova ou finalize esses vínculos antes de excluir."
            ),
        )

    db.delete(client)
    db.commit()
    return None


@router.get("/{client_id}/equipments", response_model=list[EquipmentOut])
def list_client_equipments(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    only_active: Annotated[bool, Query()] = False,
) -> list[Equipment]:
    client = db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")
    query = select(Equipment).where(Equipment.client_id == client.id)
    if only_active:
        query = query.where(Equipment.ativo.is_(True))
    return db.execute(query.order_by(Equipment.id.desc())).scalars().all()


@router.get(
    "/{client_id}/equipment-documents",
    response_model=list[EquipmentDocumentWithEquipmentOut],
)
def list_client_equipment_documents(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    document_type: Annotated[str | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(description="Search by title/notes/document number")] = None,
    issued_from: Annotated[datetime | None, Query()] = None,
    issued_to: Annotated[datetime | None, Query()] = None,
    next_due_from: Annotated[datetime | None, Query()] = None,
    next_due_to: Annotated[datetime | None, Query()] = None,
    only_overdue: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[EquipmentDocumentWithEquipmentOut]:
    client = db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")
    query = (
        select(EquipmentDocument, Equipment.identificacao)
        .join(Equipment, Equipment.id == EquipmentDocument.equipment_id)
        .where(Equipment.client_id == client_id, EquipmentDocument.tenant_id == current_user.tenant_id)
    )
    if document_type:
        query = query.where(EquipmentDocument.document_type == document_type)
    if status_filter:
        query = query.where(EquipmentDocument.status == status_filter)
    if q:
        term = f"%{q.strip()}%"
        if q.strip().isdigit():
            query = query.where(
                (EquipmentDocument.title.ilike(term))
                | (EquipmentDocument.notes.ilike(term))
                | (EquipmentDocument.document_number == int(q.strip()))
            )
        else:
            query = query.where((EquipmentDocument.title.ilike(term)) | (EquipmentDocument.notes.ilike(term)))
    if issued_from:
        query = query.where(EquipmentDocument.issued_at >= issued_from)
    if issued_to:
        query = query.where(EquipmentDocument.issued_at <= issued_to)
    if next_due_from:
        query = query.where(EquipmentDocument.next_due_at >= next_due_from.date())
    if next_due_to:
        query = query.where(EquipmentDocument.next_due_at <= next_due_to.date())
    if only_overdue:
        query = query.where(
            EquipmentDocument.next_due_at.is_not(None), EquipmentDocument.next_due_at < func.current_date()
        )
    rows = db.execute(query.order_by(EquipmentDocument.id.desc()).limit(limit)).all()
    result: list[EquipmentDocumentWithEquipmentOut] = []
    for doc, ident in rows:
        base = serialize_equipment_document_out(db, doc)
        result.append(
            EquipmentDocumentWithEquipmentOut(**base.model_dump(), equipment_identificacao=ident or ""),
        )
    return result


@router.post(
    "/{client_id}/equipments",
    response_model=EquipmentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def create_client_equipment(
    client_id: int,
    payload: EquipmentCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Equipment:
    client = db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")
    equipment = Equipment(
        client_id=client.id,
        public_token=str(uuid4()),
        tipo=payload.tipo,
        identificacao=payload.identificacao.strip(),
        fabricante=payload.fabricante,
        modelo=payload.modelo,
        serial=payload.serial,
        capacidade_btu=payload.capacidade_btu,
        capacidade_tr=payload.capacidade_tr,
        categoria_instalacao=payload.categoria_instalacao,
        modelo_evaporadora=payload.modelo_evaporadora,
        modelo_condensadora=payload.modelo_condensadora,
        tipo_gas=payload.tipo_gas,
        voltagem=payload.voltagem,
        tecnologia_ciclo=payload.tecnologia_ciclo,
        local_instalacao=payload.local_instalacao,
        ambiente_nome=payload.ambiente_nome,
        ambiente_tipo=payload.ambiente_tipo,
        area_m2=payload.area_m2,
        ocupacao_fixa=payload.ocupacao_fixa,
        ocupacao_flutuante=payload.ocupacao_flutuante,
        carga_termica_total=payload.carga_termica_total,
        massa_gas_kg=payload.massa_gas_kg,
        corrente_nominal_a=payload.corrente_nominal_a,
        filtro_tipo=payload.filtro_tipo,
        filtro_quantidade=payload.filtro_quantidade,
        filtro_dimensoes=payload.filtro_dimensoes,
        filtro_periodicidade_limpeza=payload.filtro_periodicidade_limpeza,
        ativo=payload.ativo,
    )
    db.add(equipment)
    db.commit()
    db.refresh(equipment)
    return equipment


@router.put(
    "/{client_id}/equipments/{equipment_id}",
    response_model=EquipmentOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def update_client_equipment(
    client_id: int,
    equipment_id: int,
    payload: EquipmentUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Equipment:
    equipment = db.execute(
        select(Equipment)
        .join(Client, Client.id == Equipment.client_id)
        .where(
            Equipment.id == equipment_id,
            Equipment.client_id == client_id,
            Client.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if equipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found.")
    if payload.tipo is not None:
        equipment.tipo = payload.tipo
    if payload.identificacao is not None:
        equipment.identificacao = payload.identificacao.strip()
    if payload.fabricante is not None:
        equipment.fabricante = payload.fabricante
    if payload.modelo is not None:
        equipment.modelo = payload.modelo
    if payload.serial is not None:
        equipment.serial = payload.serial
    if payload.capacidade_btu is not None:
        equipment.capacidade_btu = payload.capacidade_btu
    if payload.tipo_gas is not None:
        equipment.tipo_gas = payload.tipo_gas
    if payload.voltagem is not None:
        equipment.voltagem = payload.voltagem
    if payload.tecnologia_ciclo is not None:
        equipment.tecnologia_ciclo = payload.tecnologia_ciclo
    if payload.local_instalacao is not None:
        equipment.local_instalacao = payload.local_instalacao
    if payload.capacidade_tr is not None:
        equipment.capacidade_tr = payload.capacidade_tr
    if payload.categoria_instalacao is not None:
        equipment.categoria_instalacao = payload.categoria_instalacao
    if payload.modelo_evaporadora is not None:
        equipment.modelo_evaporadora = payload.modelo_evaporadora
    if payload.modelo_condensadora is not None:
        equipment.modelo_condensadora = payload.modelo_condensadora
    if payload.ambiente_nome is not None:
        equipment.ambiente_nome = payload.ambiente_nome
    if payload.ambiente_tipo is not None:
        equipment.ambiente_tipo = payload.ambiente_tipo
    if payload.area_m2 is not None:
        equipment.area_m2 = payload.area_m2
    if payload.ocupacao_fixa is not None:
        equipment.ocupacao_fixa = payload.ocupacao_fixa
    if payload.ocupacao_flutuante is not None:
        equipment.ocupacao_flutuante = payload.ocupacao_flutuante
    if payload.carga_termica_total is not None:
        equipment.carga_termica_total = payload.carga_termica_total
    if payload.massa_gas_kg is not None:
        equipment.massa_gas_kg = payload.massa_gas_kg
    if payload.corrente_nominal_a is not None:
        equipment.corrente_nominal_a = payload.corrente_nominal_a
    if payload.filtro_tipo is not None:
        equipment.filtro_tipo = payload.filtro_tipo
    if payload.filtro_quantidade is not None:
        equipment.filtro_quantidade = payload.filtro_quantidade
    if payload.filtro_dimensoes is not None:
        equipment.filtro_dimensoes = payload.filtro_dimensoes
    if payload.filtro_periodicidade_limpeza is not None:
        equipment.filtro_periodicidade_limpeza = payload.filtro_periodicidade_limpeza
    if payload.ativo is not None:
        equipment.ativo = payload.ativo
    db.commit()
    db.refresh(equipment)
    return equipment


@router.delete(
    "/{client_id}/equipments/{equipment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def deactivate_client_equipment(
    client_id: int,
    equipment_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    equipment = db.execute(
        select(Equipment)
        .join(Client, Client.id == Equipment.client_id)
        .where(
            Equipment.id == equipment_id,
            Equipment.client_id == client_id,
            Client.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if equipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found.")
    equipment.ativo = False
    db.commit()
    return None


@router.get(
    "/{client_id}/equipments/{equipment_id}/history",
    response_model=list[EquipmentHistoryRowOut],
)
def equipment_history(
    client_id: int,
    equipment_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[EquipmentHistoryRowOut]:
    equipment = db.execute(
        select(Equipment)
        .join(Client, Client.id == Equipment.client_id)
        .where(Equipment.id == equipment_id, Equipment.client_id == client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if equipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found.")
    rows = db.execute(
        select(
            ServiceOrderServiceItemEquipmentAudit.changed_at,
            ServiceOrderServiceItemEquipmentAudit.source,
            ServiceOrderServiceItemEquipmentAudit.previous_equipment_id,
            ServiceOrderServiceItemEquipmentAudit.new_equipment_id,
            ServiceOrderServiceItemEquipmentAudit.service_order_id,
            ServiceOrderServiceItemEquipmentAudit.service_item_id,
            Service.name,
            ServiceOrderServiceItemEquipmentAudit.changed_by_user_id,
            User.full_name,
        )
        .join(
            ServiceOrder,
            ServiceOrder.id == ServiceOrderServiceItemEquipmentAudit.service_order_id,
        )
        .join(
            ServiceOrderServiceItem,
            ServiceOrderServiceItem.id == ServiceOrderServiceItemEquipmentAudit.service_item_id,
        )
        .join(Service, Service.id == ServiceOrderServiceItem.service_id)
        .outerjoin(User, User.id == ServiceOrderServiceItemEquipmentAudit.changed_by_user_id)
        .where(
            ServiceOrder.tenant_id == current_user.tenant_id,
            or_(
                ServiceOrderServiceItemEquipmentAudit.previous_equipment_id == equipment_id,
                ServiceOrderServiceItemEquipmentAudit.new_equipment_id == equipment_id,
            ),
        )
        .order_by(ServiceOrderServiceItemEquipmentAudit.changed_at.desc())
    ).all()
    audit_out = [
        EquipmentHistoryRowOut(
            changed_at=row[0],
            source=row[1],
            previous_equipment_id=row[2],
            new_equipment_id=row[3],
            service_order_id=row[4],
            service_item_id=row[5],
            service_name=row[6],
            changed_by_user_id=row[7],
            changed_by_user_name=row[8],
        )
        for row in rows
    ]
    visit_rows = db.execute(
        select(
            ServiceOrder.closed_at,
            ServiceOrder.opened_at,
            ServiceOrder.id,
            ServiceOrderServiceItem.id,
            Service.name,
        )
        .select_from(ServiceOrderServiceItem)
        .join(ServiceOrder, ServiceOrder.id == ServiceOrderServiceItem.service_order_id)
        .join(Service, Service.id == ServiceOrderServiceItem.service_id)
        .where(
            ServiceOrder.tenant_id == current_user.tenant_id,
            ServiceOrder.client_id == client_id,
            ServiceOrderServiceItem.equipment_id == equipment_id,
            ServiceOrder.status == OrderStatus.DONE,
        )
    ).all()
    visit_out = [
        EquipmentHistoryRowOut(
            changed_at=row[0] or row[1],
            source="ordem_concluida",
            previous_equipment_id=None,
            new_equipment_id=equipment_id,
            service_order_id=row[2],
            service_item_id=row[3],
            service_name=row[4],
            changed_by_user_id=None,
            changed_by_user_name=None,
        )
        for row in visit_rows
    ]
    combined = audit_out + visit_out
    combined.sort(key=lambda r: r.changed_at, reverse=True)
    return combined


@router.get(
    "/{client_id}/service-items-links",
    response_model=list[ClientServiceItemLinkRowOut],
)
def list_client_service_items_links(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    only_without_equipment: Annotated[bool, Query()] = False,
) -> list[ClientServiceItemLinkRowOut]:
    client = db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")
    query = (
        select(
            ServiceOrderServiceItem.service_order_id,
            ServiceOrderServiceItem.id,
            ServiceOrderServiceItem.service_id,
            Service.name,
            ServiceOrder.status,
            ServiceOrderServiceItem.equipment_id,
        )
        .join(ServiceOrder, ServiceOrder.id == ServiceOrderServiceItem.service_order_id)
        .join(Service, Service.id == ServiceOrderServiceItem.service_id)
        .where(ServiceOrder.client_id == client.id, ServiceOrder.tenant_id == current_user.tenant_id)
    )
    if only_without_equipment:
        query = query.where(ServiceOrderServiceItem.equipment_id.is_(None))
    rows = db.execute(query.order_by(ServiceOrderServiceItem.id.desc())).all()
    return [
        ClientServiceItemLinkRowOut(
            service_order_id=row[0],
            service_item_id=row[1],
            service_id=row[2],
            service_name=row[3],
            order_status=row[4].value if hasattr(row[4], "value") else str(row[4]),
            equipment_id=row[5],
        )
        for row in rows
    ]
