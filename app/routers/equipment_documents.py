import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.equipment_documents_media import (
    delete_equipment_document_attachment_if_exists,
    upload_equipment_document_attachment,
)
from app.schemas import (
    EquipmentDocumentAttachmentOut,
    EquipmentDocumentCreate,
    EquipmentDocumentEventOut,
    EquipmentDocumentOut,
    EquipmentDocumentUpdate,
)
from models import (
    Client,
    Equipment,
    EquipmentDocumentAttachment,
    EquipmentDocument,
    EquipmentDocumentEvent,
    EquipmentDocumentField,
    ServiceOrder,
    User,
    UserRole,
)

router = APIRouter(prefix="/equipments", tags=["equipment-documents"])


def _get_equipment_for_tenant(db: Session, equipment_id: int, tenant_id: int) -> Equipment:
    equipment = db.execute(
        select(Equipment).join(Client, Client.id == Equipment.client_id).where(Equipment.id == equipment_id, Client.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if equipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found.")
    return equipment


def _next_document_number(db: Session, tenant_id: int, document_type: str) -> int:
    latest = db.execute(
        select(func.max(EquipmentDocument.document_number)).where(
            EquipmentDocument.tenant_id == tenant_id, EquipmentDocument.document_type == document_type
        )
    ).scalar_one()
    return int(latest or 0) + 1


def _validate_optional_refs(db: Session, tenant_id: int, service_order_id: int | None, technician_id: int | None) -> None:
    if service_order_id is not None:
        order = db.execute(
            select(ServiceOrder).where(ServiceOrder.id == service_order_id, ServiceOrder.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service order not found.")
    if technician_id is not None:
        tech = db.execute(
            select(User).where(User.id == technician_id, User.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if tech is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found.")


def serialize_equipment_document_out(db: Session, document: EquipmentDocument) -> EquipmentDocumentOut:
    """Último payload JSON do documento (para listagens)."""
    field = db.execute(
        select(EquipmentDocumentField)
        .where(EquipmentDocumentField.document_id == document.id)
        .order_by(EquipmentDocumentField.id.desc())
        .limit(1)
    ).scalar_one_or_none()
    return _to_out(document, field)


def _to_out(document: EquipmentDocument, field: EquipmentDocumentField | None) -> EquipmentDocumentOut:
    payload = {}
    schema_version = "v1"
    if field is not None:
        schema_version = field.schema_version
        try:
            payload = json.loads(field.payload_json or "{}")
        except json.JSONDecodeError:
            payload = {}
    return EquipmentDocumentOut(
        id=document.id,
        tenant_id=document.tenant_id,
        equipment_id=document.equipment_id,
        service_order_id=document.service_order_id,
        responsible_user_id=document.responsible_user_id,
        technician_id=document.technician_id,
        document_type=document.document_type.value,
        status=document.status.value,
        document_number=document.document_number,
        title=document.title,
        issued_at=document.issued_at,
        valid_until=document.valid_until,
        next_due_at=document.next_due_at,
        notes=document.notes,
        schema_version=schema_version,
        payload=payload,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


@router.get("/{equipment_id}/documents", response_model=list[EquipmentDocumentOut])
def list_equipment_documents(
    equipment_id: int,
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
) -> list[EquipmentDocumentOut]:
    _get_equipment_for_tenant(db, equipment_id, current_user.tenant_id)
    query = select(EquipmentDocument).where(
        EquipmentDocument.tenant_id == current_user.tenant_id,
        EquipmentDocument.equipment_id == equipment_id,
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
        query = query.where(EquipmentDocument.next_due_at.is_not(None), EquipmentDocument.next_due_at < func.current_date())
    docs = db.execute(query.order_by(EquipmentDocument.id.desc()).limit(limit)).scalars().all()
    if not docs:
        return []
    fields = db.execute(
        select(EquipmentDocumentField)
        .where(EquipmentDocumentField.document_id.in_([d.id for d in docs]))
        .order_by(EquipmentDocumentField.document_id, EquipmentDocumentField.id.desc())
    ).scalars().all()
    field_map: dict[int, EquipmentDocumentField] = {}
    for f in fields:
        field_map.setdefault(f.document_id, f)
    return [_to_out(d, field_map.get(d.id)) for d in docs]


@router.post(
    "/{equipment_id}/documents",
    response_model=EquipmentDocumentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def create_equipment_document(
    equipment_id: int,
    payload: EquipmentDocumentCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentDocumentOut:
    _get_equipment_for_tenant(db, equipment_id, current_user.tenant_id)
    _validate_optional_refs(db, current_user.tenant_id, payload.service_order_id, payload.technician_id)
    doc = EquipmentDocument(
        tenant_id=current_user.tenant_id,
        equipment_id=equipment_id,
        service_order_id=payload.service_order_id,
        responsible_user_id=current_user.id,
        technician_id=payload.technician_id,
        document_type=payload.document_type,
        status=payload.status,
        document_number=_next_document_number(db, current_user.tenant_id, payload.document_type),
        title=payload.title,
        issued_at=payload.issued_at,
        valid_until=payload.valid_until,
        next_due_at=payload.next_due_at,
        notes=payload.notes,
    )
    db.add(doc)
    db.flush()
    field = EquipmentDocumentField(
        document_id=doc.id,
        schema_version=payload.schema_version,
        payload_json=json.dumps(payload.payload, ensure_ascii=False),
    )
    db.add(field)
    db.add(
        EquipmentDocumentEvent(
            document_id=doc.id,
            event_type="created",
            actor_user_id=current_user.id,
            metadata_json=json.dumps({"status": payload.status, "type": payload.document_type}),
        )
    )
    db.commit()
    db.refresh(doc)
    return _to_out(doc, field)


@router.get(
    "/{equipment_id}/documents/{document_id}/attachments",
    response_model=list[EquipmentDocumentAttachmentOut],
)
def list_equipment_document_attachments(
    equipment_id: int,
    document_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[EquipmentDocumentAttachment]:
    _get_equipment_for_tenant(db, equipment_id, current_user.tenant_id)
    doc = db.execute(
        select(EquipmentDocument).where(
            EquipmentDocument.id == document_id,
            EquipmentDocument.tenant_id == current_user.tenant_id,
            EquipmentDocument.equipment_id == equipment_id,
        )
    ).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return db.execute(
        select(EquipmentDocumentAttachment)
        .where(EquipmentDocumentAttachment.document_id == doc.id)
        .order_by(EquipmentDocumentAttachment.id.desc())
    ).scalars().all()


@router.post(
    "/{equipment_id}/documents/{document_id}/attachments",
    response_model=EquipmentDocumentAttachmentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
async def upload_equipment_document_attachment_route(
    equipment_id: int,
    document_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> EquipmentDocumentAttachment:
    _get_equipment_for_tenant(db, equipment_id, current_user.tenant_id)
    doc = db.execute(
        select(EquipmentDocument).where(
            EquipmentDocument.id == document_id,
            EquipmentDocument.tenant_id == current_user.tenant_id,
            EquipmentDocument.equipment_id == equipment_id,
        )
    ).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    raw = await file.read()
    try:
        uploaded = upload_equipment_document_attachment(
            tenant_id=current_user.tenant_id,
            equipment_id=equipment_id,
            document_id=document_id,
            file_bytes=raw,
            source_filename=file.filename,
            source_content_type=file.content_type,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    attachment = EquipmentDocumentAttachment(
        document_id=doc.id,
        file_type=uploaded.content_type,
        file_name=uploaded.file_name,
        file_s3_key=uploaded.s3_key,
        file_url=uploaded.public_url,
        uploaded_by_user_id=current_user.id,
    )
    db.add(attachment)
    db.add(
        EquipmentDocumentEvent(
            document_id=doc.id,
            event_type="attachment_uploaded",
            actor_user_id=current_user.id,
            metadata_json=json.dumps({"file_name": uploaded.file_name}),
        )
    )
    db.commit()
    db.refresh(attachment)
    return attachment


@router.delete(
    "/{equipment_id}/documents/{document_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def delete_equipment_document_attachment_route(
    equipment_id: int,
    document_id: int,
    attachment_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    _get_equipment_for_tenant(db, equipment_id, current_user.tenant_id)
    row = db.execute(
        select(EquipmentDocumentAttachment)
        .join(EquipmentDocument, EquipmentDocument.id == EquipmentDocumentAttachment.document_id)
        .where(
            EquipmentDocumentAttachment.id == attachment_id,
            EquipmentDocumentAttachment.document_id == document_id,
            EquipmentDocument.equipment_id == equipment_id,
            EquipmentDocument.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")
    delete_equipment_document_attachment_if_exists(row.file_s3_key, db)
    db.delete(row)
    db.add(
        EquipmentDocumentEvent(
            document_id=document_id,
            event_type="attachment_deleted",
            actor_user_id=current_user.id,
            metadata_json=json.dumps({"attachment_id": attachment_id}),
        )
    )
    db.commit()
    return None


@router.get(
    "/{equipment_id}/documents/{document_id}/events",
    response_model=list[EquipmentDocumentEventOut],
)
def list_equipment_document_events(
    equipment_id: int,
    document_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[EquipmentDocumentEvent]:
    _get_equipment_for_tenant(db, equipment_id, current_user.tenant_id)
    doc = db.execute(
        select(EquipmentDocument).where(
            EquipmentDocument.id == document_id,
            EquipmentDocument.tenant_id == current_user.tenant_id,
            EquipmentDocument.equipment_id == equipment_id,
        )
    ).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return db.execute(
        select(EquipmentDocumentEvent)
        .where(EquipmentDocumentEvent.document_id == doc.id)
        .order_by(EquipmentDocumentEvent.id.desc())
        .limit(limit)
    ).scalars().all()


@router.get("/{equipment_id}/documents/{document_id}", response_model=EquipmentDocumentOut)
def get_equipment_document(
    equipment_id: int,
    document_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentDocumentOut:
    _get_equipment_for_tenant(db, equipment_id, current_user.tenant_id)
    doc = db.execute(
        select(EquipmentDocument).where(
            EquipmentDocument.id == document_id,
            EquipmentDocument.tenant_id == current_user.tenant_id,
            EquipmentDocument.equipment_id == equipment_id,
        )
    ).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    field = db.execute(
        select(EquipmentDocumentField)
        .where(EquipmentDocumentField.document_id == doc.id)
        .order_by(EquipmentDocumentField.id.desc())
        .limit(1)
    ).scalar_one_or_none()
    return _to_out(doc, field)


@router.patch(
    "/{equipment_id}/documents/{document_id}",
    response_model=EquipmentDocumentOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def update_equipment_document(
    equipment_id: int,
    document_id: int,
    payload: EquipmentDocumentUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentDocumentOut:
    _get_equipment_for_tenant(db, equipment_id, current_user.tenant_id)
    doc = db.execute(
        select(EquipmentDocument).where(
            EquipmentDocument.id == document_id,
            EquipmentDocument.tenant_id == current_user.tenant_id,
            EquipmentDocument.equipment_id == equipment_id,
        )
    ).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    _validate_optional_refs(db, current_user.tenant_id, payload.service_order_id, payload.technician_id)
    if payload.title is not None:
        doc.title = payload.title
    if payload.status is not None:
        doc.status = payload.status
    if payload.issued_at is not None:
        doc.issued_at = payload.issued_at
    if payload.valid_until is not None:
        doc.valid_until = payload.valid_until
    if payload.next_due_at is not None:
        doc.next_due_at = payload.next_due_at
    if payload.service_order_id is not None:
        doc.service_order_id = payload.service_order_id
    if payload.technician_id is not None:
        doc.technician_id = payload.technician_id
    if payload.notes is not None:
        doc.notes = payload.notes
    field: EquipmentDocumentField | None = None
    if payload.payload is not None or payload.schema_version is not None:
        field = EquipmentDocumentField(
            document_id=doc.id,
            schema_version=payload.schema_version or "v1",
            payload_json=json.dumps(payload.payload or {}, ensure_ascii=False),
        )
        db.add(field)
    db.add(
        EquipmentDocumentEvent(
            document_id=doc.id,
            event_type="updated",
            actor_user_id=current_user.id,
            metadata_json=json.dumps({"at": datetime.now(timezone.utc).isoformat()}),
        )
    )
    db.commit()
    db.refresh(doc)
    if field is None:
        field = db.execute(
            select(EquipmentDocumentField)
            .where(EquipmentDocumentField.document_id == doc.id)
            .order_by(EquipmentDocumentField.id.desc())
            .limit(1)
        ).scalar_one_or_none()
    return _to_out(doc, field)
