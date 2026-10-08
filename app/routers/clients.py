import csv
import io
import json
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.routers.equipment_documents import serialize_equipment_document_out
from app.schemas import (
    ClientAuditEntryOut,
    ClientCountOut,
    ClientCreate,
    ClientImportSummaryOut,
    ClientOut,
    ClientServiceItemLinkRowOut,
    ClientUpdate,
    EquipmentCreate,
    EquipmentDocumentWithEquipmentOut,
    EquipmentHistoryRowOut,
    EquipmentOut,
    EquipmentUpdate,
)
from app.tax_id import digits_only, normalize_and_validate_tax_document
from models import (
    Budget,
    Client,
    ClientAuditLog,
    Equipment,
    EquipmentDocument,
    NfseInvoice,
    OrderStatus,
    Schedule,
    Service,
    ServiceOrder,
    ServiceOrderServiceItem,
    ServiceOrderServiceItemEquipmentAudit,
    User,
    UserRole,
)

router = APIRouter(prefix="/clients", tags=["clients"])

_CLIENT_SNAPSHOT_KEYS: tuple[str, ...] = (
    "name",
    "document",
    "tax_id_kind",
    "optante_mei",
    "phone",
    "whatsapp",
    "email",
    "trade_name",
    "contact_person_name",
    "state_registration",
    "ie_indicator",
    "municipal_registration",
    "address_street",
    "address_number",
    "address_complement",
    "address_district",
    "address_city",
    "address_state",
    "address_postal_code",
    "address_country",
    "address_ibge_code",
    "preventive_campaign_opt_out",
    "is_active",
)


def _client_snapshot(client: Client) -> dict[str, Any]:
    return {
        "name": client.name,
        "document": client.document,
        "tax_id_kind": client.tax_id_kind,
        "optante_mei": bool(client.optante_mei),
        "phone": client.phone,
        "whatsapp": client.whatsapp,
        "email": client.email,
        "trade_name": client.trade_name,
        "contact_person_name": client.contact_person_name,
        "state_registration": client.state_registration,
        "ie_indicator": client.ie_indicator,
        "municipal_registration": client.municipal_registration,
        "address_street": client.address_street,
        "address_number": client.address_number,
        "address_complement": client.address_complement,
        "address_district": client.address_district,
        "address_city": client.address_city,
        "address_state": client.address_state,
        "address_postal_code": client.address_postal_code,
        "address_country": client.address_country,
        "address_ibge_code": client.address_ibge_code,
        "preventive_campaign_opt_out": bool(client.preventive_campaign_opt_out),
        "is_active": bool(client.is_active),
    }


def _audit_field_diff(before: dict[str, Any], after: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for k in _CLIENT_SNAPSHOT_KEYS:
        if before.get(k) != after.get(k):
            out[k] = {"old": before.get(k), "new": after.get(k)}
    return out


def _append_client_audit(
    db: Session,
    *,
    tenant_id: int,
    client_id: int,
    user_id: int | None,
    action: str,
    changes: dict[str, Any],
) -> None:
    db.add(
        ClientAuditLog(
            tenant_id=tenant_id,
            client_id=client_id,
            user_id=user_id,
            action=action,
            changes_json=json.dumps(changes, default=str),
        )
    )


def _apply_status_filter(query, status_filter: Literal["active", "inactive", "all"]):
    if status_filter == "active":
        return query.where(Client.is_active.is_(True))
    if status_filter == "inactive":
        return query.where(Client.is_active.is_(False))
    return query


def _delete_blockers(db: Session, tenant_id: int, client_id: int) -> list[str]:
    reasons: list[str] = []
    n_os = db.scalar(
        select(func.count()).select_from(ServiceOrder).where(
            ServiceOrder.tenant_id == tenant_id, ServiceOrder.client_id == client_id
        )
    )
    if n_os:
        reasons.append(f"{int(n_os)} ordem(ns) de serviço")
    n_bd = db.scalar(
        select(func.count()).select_from(Budget).where(Budget.tenant_id == tenant_id, Budget.client_id == client_id)
    )
    if n_bd:
        reasons.append(f"{int(n_bd)} orçamento(s)")
    n_sc = db.scalar(
        select(func.count()).select_from(Schedule).where(Schedule.tenant_id == tenant_id, Schedule.client_id == client_id)
    )
    if n_sc:
        reasons.append(f"{int(n_sc)} agendamento(s)")
    n_nf = db.scalar(
        select(func.count()).select_from(NfseInvoice).where(
            NfseInvoice.tenant_id == tenant_id, NfseInvoice.client_id == client_id
        )
    )
    if n_nf:
        reasons.append(f"{int(n_nf)} NFS-e")
    return reasons


CSV_HEADERS = [
    "id",
    "name",
    "document",
    "tax_id_kind",
    "optante_mei",
    "phone",
    "whatsapp",
    "email",
    "trade_name",
    "contact_person_name",
    "state_registration",
    "ie_indicator",
    "municipal_registration",
    "address_street",
    "address_number",
    "address_complement",
    "address_district",
    "address_city",
    "address_state",
    "address_postal_code",
    "address_country",
    "address_ibge_code",
    "preventive_campaign_opt_out",
    "is_active",
]


def _csv_cell(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "1" if v else "0"
    return str(v).replace("\r\n", " ").replace("\n", " ")


@router.get("", response_model=list[ClientOut])
def list_clients(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    q: Annotated[str | None, Query(description="Filter by name, document or email")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 20,
    status_filter: Annotated[
        Literal["active", "inactive", "all"], Query(alias="status", description="Cadastro ativo/inativo")
    ] = "active",
) -> list[Client]:
    query = select(Client).where(Client.tenant_id == current_user.tenant_id)
    query = _apply_status_filter(query, status_filter)
    if q:
        term = f"%{q}%"
        query = query.where(
            or_(
                Client.name.ilike(term),
                Client.document.ilike(term),
                Client.email.ilike(term),
                Client.phone.ilike(term),
                Client.whatsapp.ilike(term),
                Client.contact_person_name.ilike(term),
            )
        )
    return db.execute(query.order_by(Client.id.desc()).offset(skip).limit(limit)).scalars().all()


@router.get("/count", response_model=ClientCountOut)
def count_clients(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    q: Annotated[str | None, Query()] = None,
    status_filter: Annotated[
        Literal["active", "inactive", "all"], Query(alias="status", description="Cadastro ativo/inativo")
    ] = "active",
) -> ClientCountOut:
    query = select(func.count(Client.id)).where(Client.tenant_id == current_user.tenant_id)
    query = _apply_status_filter(query, status_filter)
    if q:
        term = f"%{q}%"
        query = query.where(
            or_(
                Client.name.ilike(term),
                Client.document.ilike(term),
                Client.email.ilike(term),
                Client.phone.ilike(term),
                Client.whatsapp.ilike(term),
                Client.contact_person_name.ilike(term),
            )
        )
    total = db.scalar(query)
    return ClientCountOut(total=int(total or 0))


@router.get(
    "/export",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def export_clients_csv(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status_filter: Annotated[
        Literal["active", "inactive", "all"], Query(alias="status", description="Exportar subset por status")
    ] = "all",
):
    query = select(Client).where(Client.tenant_id == current_user.tenant_id)
    query = _apply_status_filter(query, status_filter)
    rows = db.execute(query.order_by(Client.id.asc())).scalars().all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_HEADERS)
    for c in rows:
        w.writerow(
            [
                c.id,
                _csv_cell(c.name),
                _csv_cell(c.document),
                _csv_cell(c.tax_id_kind),
                _csv_cell(bool(c.optante_mei)),
                _csv_cell(c.phone),
                _csv_cell(c.whatsapp),
                _csv_cell(c.email),
                _csv_cell(c.trade_name),
                _csv_cell(c.contact_person_name),
                _csv_cell(c.state_registration),
                _csv_cell(c.ie_indicator),
                _csv_cell(c.municipal_registration),
                _csv_cell(c.address_street),
                _csv_cell(c.address_number),
                _csv_cell(c.address_complement),
                _csv_cell(c.address_district),
                _csv_cell(c.address_city),
                _csv_cell(c.address_state),
                _csv_cell(c.address_postal_code),
                _csv_cell(c.address_country),
                _csv_cell(c.address_ibge_code),
                _csv_cell(bool(c.preventive_campaign_opt_out)),
                _csv_cell(bool(c.is_active)),
            ]
        )

    data = "\ufeff" + buf.getvalue()
    return StreamingResponse(
        iter([data.encode("utf-8")]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="clientes.csv"'},
    )


@router.post("/import", response_model=ClientImportSummaryOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
def import_clients_csv(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: Annotated[UploadFile, File()],
) -> ClientImportSummaryOut:
    raw = file.file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo vazio.")
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV sem cabeçalho.")

    created = 0
    updated = 0
    skipped = 0
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):
        try:
            with db.begin_nested():
                name = (row.get("name") or "").strip()
                if not name:
                    raise ValueError("Nome é obrigatório.")

                row_id_raw = (row.get("id") or "").strip()
                client: Client | None = None
                if row_id_raw.isdigit():
                    client = db.execute(
                        select(Client).where(
                            Client.id == int(row_id_raw), Client.tenant_id == current_user.tenant_id
                        )
                    ).scalar_one_or_none()

                tax_kind = (row.get("tax_id_kind") or "cnpj").strip().lower()
                if tax_kind not in ("cpf", "cnpj"):
                    tax_kind = "cnpj"

                doc_raw = (row.get("document") or "").strip()
                document_val: str | None = None
                if doc_raw:
                    try:
                        document_val = normalize_and_validate_tax_document(doc_raw, tax_kind)  # type: ignore[arg-type]
                    except ValueError as exc:
                        raise ValueError(f"documento inválido ({exc})") from exc

                phone = (row.get("phone") or "").strip() or None
                whatsapp = (row.get("whatsapp") or "").strip() or None
                email_raw = (row.get("email") or "").strip().lower() or None

                optante_mei = (row.get("optante_mei") or "").strip().lower() in ("1", "true", "yes", "sim")
                preventive_opt = (row.get("preventive_campaign_opt_out") or "").strip().lower() in (
                    "1",
                    "true",
                    "yes",
                    "sim",
                )
                is_active_raw = (row.get("is_active") or "1").strip().lower()
                is_active_val = is_active_raw not in ("0", "false", "no", "nao", "não", "inativo")

                ibge_digits = digits_only(row.get("address_ibge_code") or "")[:7]
                ie_raw = (row.get("ie_indicator") or "").strip()
                ie_val = ie_raw[:2] if ie_raw else None

                payload_common = dict(
                    name=name,
                    document=document_val,
                    tax_id_kind=tax_kind,
                    optante_mei=optante_mei,
                    phone=phone,
                    whatsapp=whatsapp,
                    email=email_raw,
                    trade_name=(row.get("trade_name") or "").strip() or None,
                    contact_person_name=(row.get("contact_person_name") or "").strip() or None,
                    state_registration=(row.get("state_registration") or "").strip() or None,
                    ie_indicator=ie_val,
                    municipal_registration=(row.get("municipal_registration") or "").strip() or None,
                    address_street=(row.get("address_street") or "").strip() or None,
                    address_number=(row.get("address_number") or "").strip() or None,
                    address_complement=(row.get("address_complement") or "").strip() or None,
                    address_district=(row.get("address_district") or "").strip() or None,
                    address_city=(row.get("address_city") or "").strip() or None,
                    address_state=((row.get("address_state") or "").strip().upper()[:2] or None),
                    address_postal_code=(row.get("address_postal_code") or "").strip() or None,
                    address_country=(row.get("address_country") or "").strip() or "Brasil",
                    address_ibge_code=ibge_digits if len(ibge_digits) == 7 else None,
                    preventive_campaign_opt_out=preventive_opt,
                    is_active=is_active_val,
                )

                if client is not None:
                    for k, v in payload_common.items():
                        setattr(client, k, v)
                    db.flush()
                    updated += 1
                else:
                    if document_val:
                        existing = db.execute(
                            select(Client).where(
                                Client.tenant_id == current_user.tenant_id, Client.document == document_val
                            )
                        ).scalar_one_or_none()
                        if existing:
                            for k, v in payload_common.items():
                                setattr(existing, k, v)
                            db.flush()
                            updated += 1
                            continue
                    if phone:
                        existing_p = db.execute(
                            select(Client).where(Client.tenant_id == current_user.tenant_id, Client.phone == phone)
                        ).scalar_one_or_none()
                        if existing_p:
                            for k, v in payload_common.items():
                                setattr(existing_p, k, v)
                            db.flush()
                            updated += 1
                            continue

                    cnew = Client(tenant_id=current_user.tenant_id, **payload_common)
                    db.add(cnew)
                    db.flush()
                    _append_client_audit(
                        db,
                        tenant_id=current_user.tenant_id,
                        client_id=cnew.id,
                        user_id=current_user.id,
                        action="created",
                        changes={"record": _client_snapshot(cnew)},
                    )
                    created += 1
        except ValueError as exc:
            skipped += 1
            errors.append(f"Linha {i}: {exc}")
            continue
        except IntegrityError:
            skipped += 1
            errors.append(f"Linha {i}: conflito de unicidade (documento, telefone ou WhatsApp).")
            continue

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Importação falhou ao gravar: {exc.orig}",
        ) from exc

    return ClientImportSummaryOut(created=created, updated=updated, skipped=skipped, errors=errors[:50])


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


@router.get("/{client_id}/audit", response_model=list[ClientAuditEntryOut])
def list_client_audit(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[ClientAuditEntryOut]:
    client = db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")

    rows = db.execute(
        select(ClientAuditLog, User.full_name)
        .outerjoin(User, User.id == ClientAuditLog.user_id)
        .where(ClientAuditLog.client_id == client_id, ClientAuditLog.tenant_id == current_user.tenant_id)
        .order_by(ClientAuditLog.id.desc())
        .limit(limit)
    ).all()
    out: list[ClientAuditEntryOut] = []
    for log, user_name in rows:
        try:
            changes = json.loads(log.changes_json or "{}")
        except json.JSONDecodeError:
            changes = {}
        out.append(
            ClientAuditEntryOut(
                id=log.id,
                user_id=log.user_id,
                user_name=user_name,
                action=log.action,
                changes=changes if isinstance(changes, dict) else {},
                created_at=log.created_at,
            )
        )
    return out


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
    phone = (payload.phone or "").strip() or None
    if payload.document:
        existing = db.execute(
            select(Client).where(Client.tenant_id == current_user.tenant_id, Client.document == payload.document)
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe um cliente com este CPF/CNPJ nesta empresa.",
            )
    if phone:
        existing_phone = db.execute(
            select(Client).where(Client.tenant_id == current_user.tenant_id, Client.phone == phone)
        ).scalar_one_or_none()
        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe um cliente com este telefone nesta empresa.",
            )
    wa = (payload.whatsapp or "").strip() or None
    if wa:
        existing_wa = db.execute(
            select(Client).where(Client.tenant_id == current_user.tenant_id, Client.whatsapp == wa)
        ).scalar_one_or_none()
        if existing_wa:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe um cliente com este WhatsApp nesta empresa.",
            )

    client = Client(
        tenant_id=current_user.tenant_id,
        name=payload.name,
        document=payload.document,
        tax_id_kind=payload.tax_id_kind,  # set by ClientCreate validator (infer CPF/CNPJ from digits)
        optante_mei=bool(payload.optante_mei),
        phone=phone,
        whatsapp=wa,
        email=payload.email.lower() if payload.email else None,
        trade_name=payload.trade_name,
        contact_person_name=(payload.contact_person_name or "").strip() or None,
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
        preventive_campaign_opt_out=bool(payload.preventive_campaign_opt_out),
        is_active=bool(payload.is_active),
    )
    db.add(client)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não foi possível salvar: conflito de CPF/CNPJ, telefone ou WhatsApp.",
        ) from exc
    _append_client_audit(
        db,
        tenant_id=current_user.tenant_id,
        client_id=client.id,
        user_id=current_user.id,
        action="created",
        changes={"record": _client_snapshot(client)},
    )
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

    before = _client_snapshot(client)

    fields_set = payload.model_fields_set

    def _strip_opt(v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        return s or None

    if "tax_id_kind" in fields_set and payload.tax_id_kind is not None:
        client.tax_id_kind = payload.tax_id_kind
    if "optante_mei" in fields_set and payload.optante_mei is not None:
        client.optante_mei = bool(payload.optante_mei)

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
        phone = _strip_opt(payload.phone)
        if phone:
            existing_phone = db.execute(
                select(Client).where(
                    Client.tenant_id == current_user.tenant_id,
                    Client.phone == phone,
                    Client.id != client_id,
                )
            ).scalar_one_or_none()
            if existing_phone:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Já existe um cliente com este telefone nesta empresa.",
                )
        client.phone = phone

    if "whatsapp" in fields_set:
        wa = _strip_opt(payload.whatsapp) if payload.whatsapp is not None else None
        if wa:
            existing_wa = db.execute(
                select(Client).where(
                    Client.tenant_id == current_user.tenant_id,
                    Client.whatsapp == wa,
                    Client.id != client_id,
                )
            ).scalar_one_or_none()
            if existing_wa:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Já existe um cliente com este WhatsApp nesta empresa.",
                )
        client.whatsapp = wa

    if "email" in fields_set:
        client.email = payload.email.lower() if payload.email else None

    if "trade_name" in fields_set:
        client.trade_name = _strip_opt(payload.trade_name)
    if "contact_person_name" in fields_set:
        client.contact_person_name = _strip_opt(payload.contact_person_name)

    if "state_registration" in fields_set:
        client.state_registration = _strip_opt(payload.state_registration)

    if "ie_indicator" in fields_set:
        client.ie_indicator = payload.ie_indicator

    if "municipal_registration" in fields_set:
        client.municipal_registration = _strip_opt(payload.municipal_registration)

    if "address_street" in fields_set:
        client.address_street = _strip_opt(payload.address_street)

    if "address_number" in fields_set:
        client.address_number = _strip_opt(payload.address_number)

    if "address_complement" in fields_set:
        client.address_complement = _strip_opt(payload.address_complement)

    if "address_district" in fields_set:
        client.address_district = _strip_opt(payload.address_district)

    if "address_city" in fields_set:
        client.address_city = _strip_opt(payload.address_city)

    if "address_state" in fields_set:
        client.address_state = payload.address_state

    if "address_postal_code" in fields_set:
        client.address_postal_code = _strip_opt(payload.address_postal_code)

    if "address_country" in fields_set:
        client.address_country = _strip_opt(payload.address_country) or "Brasil"

    if "address_ibge_code" in fields_set:
        client.address_ibge_code = payload.address_ibge_code

    if "preventive_campaign_opt_out" in fields_set and payload.preventive_campaign_opt_out is not None:
        client.preventive_campaign_opt_out = bool(payload.preventive_campaign_opt_out)

    if "is_active" in fields_set and payload.is_active is not None:
        client.is_active = bool(payload.is_active)

    after = _client_snapshot(client)
    diff = _audit_field_diff(before, after)
    if diff:
        _append_client_audit(
            db,
            tenant_id=current_user.tenant_id,
            client_id=client.id,
            user_id=current_user.id,
            action="updated",
            changes=diff,
        )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não foi possível salvar: possível WhatsApp duplicado.",
        ) from exc
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

    reasons = _delete_blockers(db, current_user.tenant_id, client_id)
    if reasons:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não é possível excluir: há "
            + ", ".join(reasons)
            + ". Inative o cliente ou remova os vínculos antes de excluir permanentemente.",
        )

    db.delete(client)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não é possível excluir este cliente enquanto existirem registros vinculados.",
        ) from exc
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
