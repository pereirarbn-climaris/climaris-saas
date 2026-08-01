import csv
import io
import json
import re
from datetime import datetime, timezone
from typing import Annotated, Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.pagination import clamp_limit
from app.dependencies import get_current_user, require_roles
from app.campaign_processor import list_segmented_clients
from app.contract_attachments_media import (
    delete_client_contract_attachment_if_exists,
    upload_client_contract_attachment,
)
from app.routers.equipment_documents import serialize_equipment_document_out
from app.client_cnpj import (
    CNPJ_COMMERCIAL_COOLDOWN_DAYS,
    apply_cnpj_lookup_to_client,
    cnpj_commercial_cooldown_remaining,
)
from app.cnpja_client import CnpjaHttpError, fetch_office_commercial, office_payload_to_lookup
from app.platform_credentials import resolve_cnpja_api_key
from app.spreadsheet_rows import normalize_rows_shape, parse_csv_rows, parse_xlsx_rows, rows_to_dict_records
from app.routers.cnpj import _http_error_from_cnpja
from app.schemas import (
    ClientAddressCreate,
    ClientAddressOut,
    ClientAddressUpdate,
    ClientAuditEntryOut,
    ClientCnpjCommercialRefreshOut,
    ClientContactCreate,
    ClientContactOut,
    ClientContactUpdate,
    ClientContractAttachmentOut,
    ClientContractCreate,
    ClientContractNextNumberOut,
    ClientContractOut,
    ClientContractUpdate,
    ClientCountOut,
    ClientCreate,
    ClientDuplicateCheckOut,
    ClientImportSummaryOut,
    ClientOut,
    ClientServiceItemLinkRowOut,
    ClientSiteCreate,
    ClientSiteOut,
    ClientSiteUpdate,
    ClientUpdate,
    CnpjCommercialLookupOut,
    EquipmentCreate,
    EquipmentDocumentWithEquipmentOut,
    EquipmentHistoryRowOut,
    EquipmentOut,
    EquipmentUpdate,
)
from app.services.client_sites import (
    get_client_for_tenant as _get_client_for_tenant,
    get_client_site_for_client as _get_client_site_for_client,
    validate_equipment_client_site as _validate_equipment_client_site,
)
from app.equipment_history import list_equipment_preventive_visits, list_equipment_service_visits
from app.tax_id import digits_only, normalize_and_validate_tax_document
from models import (
    Budget,
    Client,
    ClientAddress,
    ClientAuditLog,
    ClientContact,
    ClientContract,
    ClientContractAttachment,
    ClientContractEquipment,
    ClientContractService,
    ClientEquipment,
    ClientSite,
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
    "rg",
    "birth_date",
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
    "main_activity_code",
    "main_activity_description",
    "legal_nature",
    "registration_status",
    "founded_at",
    "notes",
    "tags",
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
        "rg": client.rg,
        "birth_date": client.birth_date.isoformat() if client.birth_date else None,
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
        "is_verified_cnpj": bool(client.is_verified_cnpj),
        "main_activity_code": client.main_activity_code,
        "main_activity_description": client.main_activity_description,
        "legal_nature": client.legal_nature,
        "registration_status": client.registration_status,
        "founded_at": client.founded_at.isoformat() if client.founded_at else None,
        "notes": client.notes,
        "tags": list(client.tags or []),
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


def _ensure_matriz_and_principal_address(db: Session, client: Client) -> None:
    """Cria automaticamente o endereço "Principal" (e, no caso de Pessoa
    Jurídica, também a unidade "Matriz") a partir dos dados já preenchidos
    no cadastro do cliente (inclusive os trazidos pela consulta de CNPJ),
    na primeira vez que o cliente é salvo. Só atua quando ainda não existe
    Matriz/Principal — depois de criados, esses registros passam a ser
    independentes e editáveis nas abas Unidades/Filiais e Endereços, sem
    re-sincronização automática.

    - Pessoa Jurídica (CNPJ): cria Matriz + Endereço Principal vinculado a ela.
    - Pessoa Física (CPF): não existe conceito de Matriz/filial; cria apenas
      o Endereço Principal (sem vínculo com unidade), se houver dados de
      endereço no cadastro.
    """
    is_pj = client.tax_id_kind == "cnpj" and bool((client.document or "").strip())

    matriz: ClientSite | None = None
    if is_pj:
        matriz = (
            db.execute(
                select(ClientSite).where(ClientSite.client_id == client.id, ClientSite.site_type == "matriz")
            )
            .scalars()
            .first()
        )

        if matriz is None:
            site_name = (
                f"Matriz - {client.address_city}"
                if (client.address_city or "").strip()
                else (client.trade_name or client.name or "Matriz")
            )
            matriz = ClientSite(
                tenant_id=client.tenant_id,
                client_id=client.id,
                name=site_name,
                site_type="matriz",
                nickname=client.trade_name,
                contact_name=client.contact_person_name,
                phone=client.whatsapp or client.phone,
                email=client.email,
                has_own_document=True,
                document=client.document,
                legal_name=client.name,
                trade_name=client.trade_name,
                state_registration=client.state_registration,
                municipal_registration=client.municipal_registration,
                street=client.address_street,
                number=client.address_number,
                complement=client.address_complement,
                neighborhood=client.address_district,
                city=client.address_city,
                state=client.address_state,
                cep=client.address_postal_code,
                has_equipment=True,
                participates_pmoc=False,
                use_main_contacts=True,
                use_main_billing_address=True,
                is_active=True,
            )
            db.add(matriz)
            db.flush()

    has_address_data = bool(
        (client.address_street or "").strip()
        or (client.address_city or "").strip()
        or (client.address_postal_code or "").strip()
    )
    if not has_address_data:
        return

    has_principal_address = (
        db.execute(
            select(ClientAddress).where(
                ClientAddress.client_id == client.id, ClientAddress.address_type == "principal"
            )
        )
        .scalars()
        .first()
    )
    if has_principal_address is not None:
        return

    db.add(
        ClientAddress(
            tenant_id=client.tenant_id,
            client_id=client.id,
            client_site_id=matriz.id if matriz is not None else None,
            address_type="principal",
            street=client.address_street,
            number=client.address_number,
            complement=client.address_complement,
            neighborhood=client.address_district,
            city=client.address_city,
            state=client.address_state,
            cep=client.address_postal_code,
            is_principal=True,
            use_for_billing=True,
            use_for_pmoc=True,
            use_for_service_orders=True,
            use_for_correspondence=True,
            is_active=True,
        )
    )


def _apply_status_filter(query, status_filter: Literal["active", "inactive", "all"]):
    if status_filter == "active":
        return query.where(Client.is_active.is_(True))
    if status_filter == "inactive":
        return query.where(Client.is_active.is_(False))
    return query


def _apply_client_search_filter(query, q: str | None):
    if not q:
        return query
    term = f"%{q}%"
    return query.where(
        or_(
            Client.name.ilike(term),
            Client.document.ilike(term),
            Client.email.ilike(term),
            Client.phone.ilike(term),
            Client.whatsapp.ilike(term),
            Client.contact_person_name.ilike(term),
        )
    )


def _client_list_base_query(
    tenant_id: int,
    status_filter: Literal["active", "inactive", "all"],
    q: str | None,
):
    query = select(Client).where(Client.tenant_id == tenant_id)
    query = _apply_status_filter(query, status_filter)
    return _apply_client_search_filter(query, q)


def _apply_client_list_order(
    query,
    sort_key: Literal["name", "email", "whatsapp"],
    sort_dir: Literal["asc", "desc"],
):
    cols = {
        "name": Client.name,
        "email": Client.email,
        "whatsapp": Client.whatsapp,
    }
    col = cols.get(sort_key, Client.name)
    if sort_dir == "desc":
        return query.order_by(col.desc(), Client.id.desc())
    return query.order_by(col.asc(), Client.id.asc())


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


def _client_import_rows_from_upload(raw: bytes, filename: str) -> list[dict[str, str]]:
    lower = (filename or "").lower()
    if lower.endswith(".xlsx"):
        matrix = normalize_rows_shape(parse_xlsx_rows(raw))
        records = rows_to_dict_records(matrix)
        if not records:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Planilha sem cabeçalho ou dados.")
        return records
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV sem cabeçalho.")
    return [dict(row) for row in reader]


@router.get("", response_model=list[ClientOut])
def list_clients(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    q: Annotated[str | None, Query(description="Filter by name, document or email")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1)] = 20,
    status_filter: Annotated[
        Literal["active", "inactive", "all"], Query(alias="status", description="Cadastro ativo/inativo")
    ] = "active",
    sort_key: Annotated[
        Literal["name", "email", "whatsapp"], Query(description="Coluna de ordenação")
    ] = "name",
    sort_dir: Annotated[Literal["asc", "desc"], Query(description="Direção da ordenação")] = "asc",
) -> list[Client]:
    limit = clamp_limit(limit)
    query = _client_list_base_query(current_user.tenant_id, status_filter, q)
    query = _apply_client_list_order(query, sort_key, sort_dir)
    return db.execute(query.offset(skip).limit(limit)).scalars().all()


@router.get("/count", response_model=ClientCountOut)
def count_clients(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    q: Annotated[str | None, Query()] = None,
    status_filter: Annotated[
        Literal["active", "inactive", "all"], Query(alias="status", description="Cadastro ativo/inativo")
    ] = "active",
) -> ClientCountOut:
    def count_filtered(*extra) -> int:
        query = select(func.count(Client.id)).where(Client.tenant_id == current_user.tenant_id)
        query = _apply_status_filter(query, status_filter)
        query = _apply_client_search_filter(query, q)
        for clause in extra:
            query = query.where(clause)
        return int(db.scalar(query) or 0)

    return ClientCountOut(
        total=count_filtered(),
        empresas=count_filtered(Client.tax_id_kind == "cnpj"),
        pessoas=count_filtered(Client.tax_id_kind == "cpf"),
        ativos=count_filtered(Client.is_active.is_(True)),
    )


@router.get("/check-duplicate", response_model=ClientDuplicateCheckOut)
def check_client_duplicate(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    document: Annotated[str | None, Query(description="CPF/CNPJ para validação de duplicidade")] = None,
    whatsapp: Annotated[str | None, Query(description="WhatsApp para validação de duplicidade")] = None,
    exclude_client_id: Annotated[int | None, Query(ge=1)] = None,
) -> ClientDuplicateCheckOut:
    document_exists = False
    whatsapp_exists = False

    normalized_document: str | None = None
    if document:
        raw_document = document.strip()
        if raw_document:
            doc_digits = digits_only(raw_document)
            inferred_kind: Literal["cpf", "cnpj"] | None = None
            if len(doc_digits) == 11:
                inferred_kind = "cpf"
            elif len(doc_digits) == 14:
                inferred_kind = "cnpj"
            # No fluxo de digitação (onBlur), documento parcial ou inválido não deve
            # disparar erro de API; só validamos duplicidade quando houver formato útil.
            if inferred_kind is not None:
                try:
                    normalized_document = normalize_and_validate_tax_document(raw_document, inferred_kind)
                except ValueError:
                    normalized_document = None

    normalized_whatsapp: str | None = None
    if whatsapp:
        wa_digits = digits_only(whatsapp)
        if wa_digits:
            normalized_whatsapp = wa_digits

    if normalized_document:
        query_document = select(Client.id).where(
            Client.tenant_id == current_user.tenant_id,
            Client.document == normalized_document,
        )
        if exclude_client_id is not None:
            query_document = query_document.where(Client.id != exclude_client_id)
        document_exists = db.execute(query_document.limit(1)).scalar_one_or_none() is not None

    if normalized_whatsapp:
        query_whatsapp = select(Client.id).where(
            Client.tenant_id == current_user.tenant_id,
            Client.whatsapp == normalized_whatsapp,
        )
        if exclude_client_id is not None:
            query_whatsapp = query_whatsapp.where(Client.id != exclude_client_id)
        whatsapp_exists = db.execute(query_whatsapp.limit(1)).scalar_one_or_none() is not None

    return ClientDuplicateCheckOut(
        document_exists=document_exists,
        whatsapp_exists=whatsapp_exists,
    )


@router.get(
    "/segmentation",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def segment_clients(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    inactive_days: Annotated[int, Query(ge=1, le=3650, description="Clientes sem atendimento há mais de N dias")] = 180,
    respect_opt_out: Annotated[bool, Query()] = True,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> dict[str, Any]:
    """Segmentação para campanhas: clientes elegíveis por data do último serviço."""
    return list_segmented_clients(
        db,
        tenant_id=current_user.tenant_id,
        segment_kind="inactive_since",
        segment_params={"inactive_days": inactive_days, "respect_preventive_opt_out": respect_opt_out},
        limit=limit,
    )


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
    filename = file.filename or ""
    lower = filename.lower()
    if not (lower.endswith(".csv") or lower.endswith(".txt") or lower.endswith(".xlsx")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato inválido. Use .csv ou .xlsx.")
    try:
        import_rows = _client_import_rows_from_upload(raw, filename)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    created = 0
    updated = 0
    skipped = 0
    errors: list[str] = []

    for i, row in enumerate(import_rows, start=2):
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
    limit: Annotated[int, Query(ge=1)] = 200,
) -> list[ClientAuditEntryOut]:
    limit = clamp_limit(limit)
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
        rg=(payload.rg or "").strip() or None,
        birth_date=payload.birth_date,
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
        is_verified_cnpj=bool(payload.is_verified_cnpj),
        main_activity_code=(payload.main_activity_code or "").strip() or None,
        main_activity_description=(payload.main_activity_description or "").strip() or None,
        legal_nature=(payload.legal_nature or "").strip() or None,
        registration_status=(payload.registration_status or "").strip() or None,
        founded_at=payload.founded_at,
        notes=(payload.notes or "").strip() or None,
        tags=list(payload.tags or []),
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
    _ensure_matriz_and_principal_address(db, client)
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

    if client.is_verified_cnpj and client.tax_id_kind == "cnpj":
        from app.tax_id import digits_only

        if "document" in fields_set and payload.document is not None:
            new_doc = digits_only(payload.document)
            if new_doc and new_doc != digits_only(client.document or ""):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="CNPJ validado na Receita Federal não pode ser alterado.",
                )
        if "name" in fields_set and payload.name is not None:
            if str(payload.name).strip() != (client.name or "").strip():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Razão social validada na Receita Federal não pode ser alterada.",
                )
        if "tax_id_kind" in fields_set and payload.tax_id_kind is not None:
            if payload.tax_id_kind != client.tax_id_kind:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Tipo de pessoa não pode ser alterado após validação do CNPJ.",
                )

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

    if "rg" in fields_set:
        client.rg = _strip_opt(payload.rg)

    if "birth_date" in fields_set:
        client.birth_date = payload.birth_date

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

    if "is_verified_cnpj" in fields_set and payload.is_verified_cnpj is True:
        client.is_verified_cnpj = True

    if "main_activity_code" in fields_set:
        client.main_activity_code = _strip_opt(payload.main_activity_code)

    if "main_activity_description" in fields_set:
        client.main_activity_description = _strip_opt(payload.main_activity_description)

    if "legal_nature" in fields_set:
        client.legal_nature = _strip_opt(payload.legal_nature)

    if "registration_status" in fields_set:
        client.registration_status = _strip_opt(payload.registration_status)

    if "founded_at" in fields_set:
        client.founded_at = payload.founded_at

    if "notes" in fields_set:
        client.notes = _strip_opt(payload.notes)

    if "tags" in fields_set and payload.tags is not None:
        client.tags = list(payload.tags)

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

    _ensure_matriz_and_principal_address(db, client)

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


@router.get("/{client_id}/hvac-equipments", response_model=list[EquipmentOut])
def list_client_equipments(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    only_active: Annotated[bool, Query()] = False,
    client_site_id: Annotated[int | None, Query(ge=1)] = None,
) -> list[Equipment]:
    client = db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")
    query = select(Equipment).where(
        Equipment.client_id == client.id,
        Equipment.preventive_reminder_only.is_(False),
    )
    if only_active:
        query = query.where(Equipment.ativo.is_(True))
    if client_site_id is not None:
        _get_client_site_for_client(
            db, site_id=client_site_id, client_id=client_id, tenant_id=current_user.tenant_id
        )
        catalog_legacy_ids = select(ClientEquipment.legacy_equipment_id).where(
            ClientEquipment.client_id == client.id,
            ClientEquipment.client_site_id == client_site_id,
            ClientEquipment.is_active.is_(True),
            ClientEquipment.legacy_equipment_id.isnot(None),
        )
        query = query.where(
            or_(
                Equipment.client_site_id == client_site_id,
                Equipment.id.in_(catalog_legacy_ids),
            )
        )
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
    limit: Annotated[int, Query(ge=1)] = 100,
) -> list[EquipmentDocumentWithEquipmentOut]:
    limit = clamp_limit(limit)
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
    "/{client_id}/hvac-equipments",
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
    _validate_equipment_client_site(
        db,
        client_site_id=payload.client_site_id,
        client_id=client.id,
        tenant_id=current_user.tenant_id,
    )
    equipment = Equipment(
        client_id=client.id,
        client_site_id=payload.client_site_id,
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
        installation_reference=payload.installation_reference,
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
    "/{client_id}/hvac-equipments/{equipment_id}",
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
    if payload.installation_reference is not None:
        equipment.installation_reference = payload.installation_reference
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
    if "client_site_id" in payload.model_fields_set:
        if payload.client_site_id is not None:
            _validate_equipment_client_site(
                db,
                client_site_id=payload.client_site_id,
                client_id=client_id,
                tenant_id=current_user.tenant_id,
            )
        equipment.client_site_id = payload.client_site_id
    db.commit()
    db.refresh(equipment)
    return equipment


@router.delete(
    "/{client_id}/hvac-equipments/{equipment_id}",
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
    from app.services.client_equipment_deactivation import deactivate_legacy_equipment_row

    deactivate_legacy_equipment_row(db, equipment, tenant_id=current_user.tenant_id)
    db.commit()
    return None


@router.get(
    "/{client_id}/hvac-equipments/{equipment_id}/history",
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
            # Só vínculos *para* este equipamento. Incluir previous_equipment_id
            # fazia trocas/correções aparecerem como REGISTRO nos dois aparelhos.
            ServiceOrderServiceItemEquipmentAudit.new_equipment_id == equipment_id,
            ServiceOrderServiceItemEquipmentAudit.source != "manual_correction_inversion",
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
    visit_out = list_equipment_service_visits(
        db,
        tenant_id=current_user.tenant_id,
        equipment_id=equipment_id,
        client_id=client_id,
        preventive_only=False,
    )
    combined = audit_out + visit_out
    combined.sort(key=lambda r: r.changed_at, reverse=True)
    return combined


@router.get(
    "/{client_id}/hvac-equipments/{equipment_id}/history/preventives",
    response_model=list[EquipmentHistoryRowOut],
)
def equipment_preventive_history(
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
    return list_equipment_preventive_visits(
        db,
        tenant_id=current_user.tenant_id,
        equipment_id=equipment_id,
        client_id=client_id,
    )


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


@router.post(
    "/{client_id}/cnpj-commercial-refresh",
    response_model=ClientCnpjCommercialRefreshOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def refresh_client_cnpj_commercial(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    merge_address: Annotated[bool, Query(description="Atualizar endereço com dados da Receita")] = True,
) -> ClientCnpjCommercialRefreshOut:
    """Atualiza cadastro via CNPJá comercial (máximo 1x a cada 60 dias por cliente)."""
    client = _get_client_for_tenant(db, client_id, current_user.tenant_id)
    if client.tax_id_kind != "cnpj":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Consulta comercial disponível apenas para clientes com CNPJ.",
        )
    digits = digits_only(client.document or "")
    if len(digits) != 14:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cliente sem CNPJ válido para consulta na Receita.",
        )

    days_left = cnpj_commercial_cooldown_remaining(client)
    if days_left is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"A última atualização comercial foi há menos de {CNPJ_COMMERCIAL_COOLDOWN_DAYS} dias. "
                f"Tente novamente em aproximadamente {days_left} dia(s) para economizar créditos da API."
            ),
        )

    api_key = resolve_cnpja_api_key(db)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API CNPJá comercial não configurada. Cadastre a chave em Credenciais da plataforma (CNPJá).",
        )

    before = _client_snapshot(client)
    try:
        raw = fetch_office_commercial(digits, api_key)
    except CnpjaHttpError as exc:
        raise _http_error_from_cnpja(exc) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível contatar o serviço CNPJá.",
        ) from exc

    lookup = office_payload_to_lookup(raw, "commercial")
    if not lookup.company_name.strip():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="CNPJ sem razão social na resposta da CNPJá.",
        )
    if lookup.tax_id != digits:
        lookup = lookup.model_copy(update={"tax_id": digits})

    apply_cnpj_lookup_to_client(client, lookup, merge_address=merge_address)
    client.last_cnpj_commercial_update = datetime.now(timezone.utc)

    after = _client_snapshot(client)
    diff = _audit_field_diff(before, after)
    if diff:
        _append_client_audit(
            db,
            tenant_id=current_user.tenant_id,
            client_id=client.id,
            user_id=current_user.id,
            action="cnpj_commercial_refresh",
            changes=diff,
        )
    db.commit()
    db.refresh(client)
    commercial_out = CnpjCommercialLookupOut(**lookup.model_dump(), full=raw)
    return ClientCnpjCommercialRefreshOut(client=client, lookup=commercial_out)


@router.get("/{client_id}/sites", response_model=list[ClientSiteOut])
def list_client_sites(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[ClientSite]:
    _get_client_for_tenant(db, client_id, current_user.tenant_id)
    return list(
        db.execute(
            select(ClientSite)
            .where(ClientSite.client_id == client_id, ClientSite.tenant_id == current_user.tenant_id)
            .order_by(ClientSite.name.asc())
        ).scalars().all()
    )


@router.post(
    "/{client_id}/sites",
    response_model=ClientSiteOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def create_client_site(
    client_id: int,
    payload: ClientSiteCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientSite:
    client = _get_client_for_tenant(db, client_id, current_user.tenant_id)
    site = ClientSite(
        tenant_id=client.tenant_id,
        client_id=client.id,
        name=payload.name.strip(),
        site_type=payload.site_type,
        nickname=(payload.nickname or "").strip() or None,
        contact_name=(payload.contact_name or "").strip() or None,
        responsible_role=(payload.responsible_role or "").strip() or None,
        phone=(payload.phone or "").strip() or None,
        email=(payload.email or "").strip().lower() or None if payload.email else None,
        has_own_document=bool(payload.has_own_document),
        document=payload.document if payload.has_own_document else None,
        legal_name=(payload.legal_name or "").strip() or None,
        trade_name=(payload.trade_name or "").strip() or None,
        state_registration=(payload.state_registration or "").strip() or None,
        municipal_registration=(payload.municipal_registration or "").strip() or None,
        street=(payload.street or "").strip() or None,
        number=(payload.number or "").strip() or None,
        complement=(payload.complement or "").strip() or None,
        neighborhood=(payload.neighborhood or "").strip() or None,
        city=(payload.city or "").strip() or None,
        state=payload.state,
        cep=payload.cep,
        reference_point=(payload.reference_point or "").strip() or None,
        has_equipment=bool(payload.has_equipment),
        participates_pmoc=bool(payload.participates_pmoc),
        use_main_contacts=bool(payload.use_main_contacts),
        use_main_billing_address=bool(payload.use_main_billing_address),
        is_active=bool(payload.is_active),
        notes=(payload.notes or "").strip() or None,
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


@router.get("/{client_id}/sites/{site_id}", response_model=ClientSiteOut)
def get_client_site(
    client_id: int,
    site_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientSite:
    return _get_client_site_for_client(db, site_id=site_id, client_id=client_id, tenant_id=current_user.tenant_id)


@router.put(
    "/{client_id}/sites/{site_id}",
    response_model=ClientSiteOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def update_client_site(
    client_id: int,
    site_id: int,
    payload: ClientSiteUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientSite:
    site = _get_client_site_for_client(db, site_id=site_id, client_id=client_id, tenant_id=current_user.tenant_id)
    fields_set = payload.model_fields_set
    if payload.name is not None:
        site.name = payload.name.strip()
    if "site_type" in fields_set and payload.site_type is not None:
        site.site_type = payload.site_type
    if "nickname" in fields_set:
        site.nickname = (payload.nickname or "").strip() or None
    if payload.contact_name is not None:
        site.contact_name = payload.contact_name.strip() or None
    if "responsible_role" in fields_set:
        site.responsible_role = (payload.responsible_role or "").strip() or None
    if payload.phone is not None:
        site.phone = payload.phone.strip() or None
    if "email" in fields_set:
        site.email = (payload.email or "").strip().lower() or None if payload.email else None
    if "has_own_document" in fields_set and payload.has_own_document is not None:
        site.has_own_document = bool(payload.has_own_document)
        if not site.has_own_document:
            site.document = None
    if "document" in fields_set and site.has_own_document:
        site.document = payload.document
    if "legal_name" in fields_set:
        site.legal_name = (payload.legal_name or "").strip() or None
    if "trade_name" in fields_set:
        site.trade_name = (payload.trade_name or "").strip() or None
    if "state_registration" in fields_set:
        site.state_registration = (payload.state_registration or "").strip() or None
    if "municipal_registration" in fields_set:
        site.municipal_registration = (payload.municipal_registration or "").strip() or None
    if payload.street is not None:
        site.street = payload.street.strip() or None
    if payload.number is not None:
        site.number = payload.number.strip() or None
    if payload.complement is not None:
        site.complement = payload.complement.strip() or None
    if payload.neighborhood is not None:
        site.neighborhood = payload.neighborhood.strip() or None
    if payload.city is not None:
        site.city = payload.city.strip() or None
    if payload.state is not None:
        site.state = payload.state
    if payload.cep is not None:
        site.cep = payload.cep
    if "reference_point" in fields_set:
        site.reference_point = (payload.reference_point or "").strip() or None
    if "has_equipment" in fields_set and payload.has_equipment is not None:
        site.has_equipment = bool(payload.has_equipment)
    if "participates_pmoc" in fields_set and payload.participates_pmoc is not None:
        site.participates_pmoc = bool(payload.participates_pmoc)
    if "use_main_contacts" in fields_set and payload.use_main_contacts is not None:
        site.use_main_contacts = bool(payload.use_main_contacts)
    if "use_main_billing_address" in fields_set and payload.use_main_billing_address is not None:
        site.use_main_billing_address = bool(payload.use_main_billing_address)
    if "is_active" in fields_set and payload.is_active is not None:
        site.is_active = bool(payload.is_active)
    if "notes" in fields_set:
        site.notes = (payload.notes or "").strip() or None
    db.commit()
    db.refresh(site)
    return site


@router.delete(
    "/{client_id}/sites/{site_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def delete_client_site(
    client_id: int,
    site_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    site = _get_client_site_for_client(db, site_id=site_id, client_id=client_id, tenant_id=current_user.tenant_id)
    db.delete(site)
    db.commit()


def _get_client_address_for_client(db: Session, *, address_id: int, client_id: int, tenant_id: int) -> ClientAddress:
    address = db.execute(
        select(ClientAddress).where(
            ClientAddress.id == address_id,
            ClientAddress.client_id == client_id,
            ClientAddress.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if address is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endereço não encontrado.")
    return address


def _unset_other_principal_addresses(db: Session, *, client_id: int, tenant_id: int, keep_id: int | None) -> None:
    rows = db.execute(
        select(ClientAddress).where(
            ClientAddress.client_id == client_id,
            ClientAddress.tenant_id == tenant_id,
            ClientAddress.is_principal.is_(True),
        )
    ).scalars().all()
    for row in rows:
        if row.id != keep_id:
            row.is_principal = False


@router.get("/{client_id}/addresses", response_model=list[ClientAddressOut])
def list_client_addresses(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[ClientAddress]:
    _get_client_for_tenant(db, client_id, current_user.tenant_id)
    return list(
        db.execute(
            select(ClientAddress)
            .where(ClientAddress.client_id == client_id, ClientAddress.tenant_id == current_user.tenant_id)
            .order_by(ClientAddress.created_at.asc())
        ).scalars().all()
    )


@router.post(
    "/{client_id}/addresses",
    response_model=ClientAddressOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def create_client_address(
    client_id: int,
    payload: ClientAddressCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientAddress:
    client = _get_client_for_tenant(db, client_id, current_user.tenant_id)
    if payload.client_site_id is not None:
        _get_client_site_for_client(
            db, site_id=payload.client_site_id, client_id=client.id, tenant_id=current_user.tenant_id
        )
    address = ClientAddress(
        tenant_id=client.tenant_id,
        client_id=client.id,
        client_site_id=payload.client_site_id,
        address_type=payload.address_type,
        street=payload.street.strip(),
        number=payload.number.strip(),
        complement=(payload.complement or "").strip() or None,
        neighborhood=payload.neighborhood.strip(),
        city=payload.city.strip(),
        state=payload.state,
        cep=payload.cep,
        reference_point=(payload.reference_point or "").strip() or None,
        is_principal=bool(payload.is_principal),
        use_for_billing=bool(payload.use_for_billing),
        use_for_pmoc=bool(payload.use_for_pmoc),
        use_for_service_orders=bool(payload.use_for_service_orders),
        use_for_correspondence=bool(payload.use_for_correspondence),
        is_active=bool(payload.is_active),
    )
    db.add(address)
    db.flush()
    if address.is_principal:
        _unset_other_principal_addresses(
            db, client_id=client.id, tenant_id=current_user.tenant_id, keep_id=address.id
        )
    db.commit()
    db.refresh(address)
    return address


@router.get("/{client_id}/addresses/{address_id}", response_model=ClientAddressOut)
def get_client_address(
    client_id: int,
    address_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientAddress:
    return _get_client_address_for_client(
        db, address_id=address_id, client_id=client_id, tenant_id=current_user.tenant_id
    )


@router.put(
    "/{client_id}/addresses/{address_id}",
    response_model=ClientAddressOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def update_client_address(
    client_id: int,
    address_id: int,
    payload: ClientAddressUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientAddress:
    address = _get_client_address_for_client(
        db, address_id=address_id, client_id=client_id, tenant_id=current_user.tenant_id
    )
    fields_set = payload.model_fields_set
    if "client_site_id" in fields_set:
        if payload.client_site_id is not None:
            _get_client_site_for_client(
                db, site_id=payload.client_site_id, client_id=client_id, tenant_id=current_user.tenant_id
            )
        address.client_site_id = payload.client_site_id
    if "address_type" in fields_set and payload.address_type is not None:
        address.address_type = payload.address_type
    if payload.street is not None:
        address.street = payload.street.strip()
    if payload.number is not None:
        address.number = payload.number.strip()
    if "complement" in fields_set:
        address.complement = (payload.complement or "").strip() or None
    if payload.neighborhood is not None:
        address.neighborhood = payload.neighborhood.strip()
    if payload.city is not None:
        address.city = payload.city.strip()
    if payload.state is not None:
        address.state = payload.state
    if payload.cep is not None:
        address.cep = payload.cep
    if "reference_point" in fields_set:
        address.reference_point = (payload.reference_point or "").strip() or None
    if "use_for_billing" in fields_set and payload.use_for_billing is not None:
        address.use_for_billing = bool(payload.use_for_billing)
    if "use_for_pmoc" in fields_set and payload.use_for_pmoc is not None:
        address.use_for_pmoc = bool(payload.use_for_pmoc)
    if "use_for_service_orders" in fields_set and payload.use_for_service_orders is not None:
        address.use_for_service_orders = bool(payload.use_for_service_orders)
    if "use_for_correspondence" in fields_set and payload.use_for_correspondence is not None:
        address.use_for_correspondence = bool(payload.use_for_correspondence)
    if "is_active" in fields_set and payload.is_active is not None:
        address.is_active = bool(payload.is_active)
    if "is_principal" in fields_set and payload.is_principal is not None:
        address.is_principal = bool(payload.is_principal)
        if address.is_principal:
            db.flush()
            _unset_other_principal_addresses(
                db, client_id=client_id, tenant_id=current_user.tenant_id, keep_id=address.id
            )
    db.commit()
    db.refresh(address)
    return address


@router.delete(
    "/{client_id}/addresses/{address_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def delete_client_address(
    client_id: int,
    address_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    address = _get_client_address_for_client(
        db, address_id=address_id, client_id=client_id, tenant_id=current_user.tenant_id
    )
    db.delete(address)
    db.commit()


@router.post(
    "/{client_id}/addresses/{address_id}/duplicate",
    response_model=ClientAddressOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def duplicate_client_address(
    client_id: int,
    address_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientAddress:
    source = _get_client_address_for_client(
        db, address_id=address_id, client_id=client_id, tenant_id=current_user.tenant_id
    )
    copy = ClientAddress(
        tenant_id=source.tenant_id,
        client_id=source.client_id,
        client_site_id=source.client_site_id,
        address_type=source.address_type,
        street=source.street,
        number=source.number,
        complement=source.complement,
        neighborhood=source.neighborhood,
        city=source.city,
        state=source.state,
        cep=source.cep,
        reference_point=source.reference_point,
        is_principal=False,
        use_for_billing=source.use_for_billing,
        use_for_pmoc=source.use_for_pmoc,
        use_for_service_orders=source.use_for_service_orders,
        use_for_correspondence=source.use_for_correspondence,
        is_active=source.is_active,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return copy


def _get_client_contact_for_client(db: Session, *, contact_id: int, client_id: int, tenant_id: int) -> ClientContact:
    contact = db.execute(
        select(ClientContact).where(
            ClientContact.id == contact_id,
            ClientContact.client_id == client_id,
            ClientContact.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if contact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contato não encontrado.")
    return contact


def _unset_other_principal_contacts(db: Session, *, client_id: int, tenant_id: int, keep_id: int | None) -> None:
    rows = db.execute(
        select(ClientContact).where(
            ClientContact.client_id == client_id,
            ClientContact.tenant_id == tenant_id,
            ClientContact.is_principal.is_(True),
        )
    ).scalars().all()
    for row in rows:
        if row.id != keep_id:
            row.is_principal = False


@router.get("/{client_id}/contacts", response_model=list[ClientContactOut])
def list_client_contacts(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[ClientContact]:
    _get_client_for_tenant(db, client_id, current_user.tenant_id)
    return list(
        db.execute(
            select(ClientContact)
            .where(ClientContact.client_id == client_id, ClientContact.tenant_id == current_user.tenant_id)
            .order_by(ClientContact.id.asc())
        ).scalars().all()
    )


@router.post(
    "/{client_id}/contacts",
    response_model=ClientContactOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def create_client_contact(
    client_id: int,
    payload: ClientContactCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientContact:
    client = _get_client_for_tenant(db, client_id, current_user.tenant_id)
    if payload.client_site_id is not None:
        _get_client_site_for_client(
            db, site_id=payload.client_site_id, client_id=client.id, tenant_id=current_user.tenant_id
        )
    contact = ClientContact(
        tenant_id=client.tenant_id,
        client_id=client.id,
        client_site_id=payload.client_site_id,
        name=payload.name.strip(),
        category=payload.category,
        role=(payload.role or "").strip() or None,
        department=(payload.department or "").strip() or None,
        whatsapp=(payload.whatsapp or "").strip() or None,
        phone=(payload.phone or "").strip() or None,
        email=(payload.email or "").strip() or None,
        receives_service_orders=payload.receives_service_orders,
        receives_pmoc=payload.receives_pmoc,
        receives_financial=payload.receives_financial,
        receives_contracts=payload.receives_contracts,
        receives_whatsapp_notifications=payload.receives_whatsapp_notifications,
        receives_automatic_emails=payload.receives_automatic_emails,
        is_principal=bool(payload.is_principal),
        is_active=bool(payload.is_active),
        notes=(payload.notes or "").strip() or None,
    )
    db.add(contact)
    db.flush()
    if contact.is_principal:
        _unset_other_principal_contacts(db, client_id=client.id, tenant_id=current_user.tenant_id, keep_id=contact.id)
    db.commit()
    db.refresh(contact)
    return contact


@router.put(
    "/{client_id}/contacts/{contact_id}",
    response_model=ClientContactOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def update_client_contact(
    client_id: int,
    contact_id: int,
    payload: ClientContactUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientContact:
    contact = _get_client_contact_for_client(db, contact_id=contact_id, client_id=client_id, tenant_id=current_user.tenant_id)
    fields_set = payload.model_fields_set
    if payload.name is not None:
        contact.name = payload.name.strip()
    if "category" in fields_set and payload.category is not None:
        contact.category = payload.category
    if payload.role is not None:
        contact.role = payload.role.strip() or None
    if payload.department is not None:
        contact.department = payload.department.strip() or None
    if "client_site_id" in fields_set:
        if payload.client_site_id is not None:
            _get_client_site_for_client(
                db, site_id=payload.client_site_id, client_id=client_id, tenant_id=current_user.tenant_id
            )
        contact.client_site_id = payload.client_site_id
    if payload.whatsapp is not None:
        contact.whatsapp = payload.whatsapp.strip() or None
    if payload.phone is not None:
        contact.phone = payload.phone.strip() or None
    if payload.email is not None:
        contact.email = payload.email.strip() or None
    if payload.receives_service_orders is not None:
        contact.receives_service_orders = payload.receives_service_orders
    if payload.receives_pmoc is not None:
        contact.receives_pmoc = payload.receives_pmoc
    if payload.receives_financial is not None:
        contact.receives_financial = payload.receives_financial
    if "receives_contracts" in fields_set and payload.receives_contracts is not None:
        contact.receives_contracts = payload.receives_contracts
    if "receives_whatsapp_notifications" in fields_set and payload.receives_whatsapp_notifications is not None:
        contact.receives_whatsapp_notifications = payload.receives_whatsapp_notifications
    if "receives_automatic_emails" in fields_set and payload.receives_automatic_emails is not None:
        contact.receives_automatic_emails = payload.receives_automatic_emails
    if "is_active" in fields_set and payload.is_active is not None:
        contact.is_active = bool(payload.is_active)
    if "notes" in fields_set:
        contact.notes = (payload.notes or "").strip() or None
    if "is_principal" in fields_set and payload.is_principal is not None:
        contact.is_principal = bool(payload.is_principal)
        if contact.is_principal:
            db.flush()
            _unset_other_principal_contacts(
                db, client_id=client_id, tenant_id=current_user.tenant_id, keep_id=contact.id
            )
    db.commit()
    db.refresh(contact)
    return contact


@router.delete(
    "/{client_id}/contacts/{contact_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def delete_client_contact(
    client_id: int,
    contact_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    contact = _get_client_contact_for_client(db, contact_id=contact_id, client_id=client_id, tenant_id=current_user.tenant_id)
    db.delete(contact)
    db.commit()


@router.post(
    "/{client_id}/contacts/{contact_id}/duplicate",
    response_model=ClientContactOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def duplicate_client_contact(
    client_id: int,
    contact_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientContact:
    source = _get_client_contact_for_client(db, contact_id=contact_id, client_id=client_id, tenant_id=current_user.tenant_id)
    copy = ClientContact(
        tenant_id=source.tenant_id,
        client_id=source.client_id,
        client_site_id=source.client_site_id,
        name=f"{source.name} (cópia)",
        category=source.category,
        role=source.role,
        department=source.department,
        whatsapp=source.whatsapp,
        phone=source.phone,
        email=source.email,
        receives_service_orders=source.receives_service_orders,
        receives_pmoc=source.receives_pmoc,
        receives_financial=source.receives_financial,
        receives_contracts=source.receives_contracts,
        receives_whatsapp_notifications=source.receives_whatsapp_notifications,
        receives_automatic_emails=source.receives_automatic_emails,
        is_principal=False,
        is_active=source.is_active,
        notes=source.notes,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return copy


def _client_contract_load_options():
    return (
        selectinload(ClientContract.contract_equipments),
        selectinload(ClientContract.contract_services),
        selectinload(ClientContract.attachments),
    )


def _get_client_contract_for_client(db: Session, *, contract_id: int, client_id: int, tenant_id: int) -> ClientContract:
    contract = db.execute(
        select(ClientContract)
        .options(*_client_contract_load_options())
        .where(
            ClientContract.id == contract_id,
            ClientContract.client_id == client_id,
            ClientContract.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if contract is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contrato não encontrado.")
    return contract


def _sync_contract_equipments(
    db: Session,
    *,
    contract: ClientContract,
    client_id: int,
    tenant_id: int,
    equipment_ids: list[Any],
) -> None:
    unique_ids: list[Any] = []
    seen: set[str] = set()
    for raw in equipment_ids:
        key = str(raw)
        if key in seen:
            continue
        seen.add(key)
        unique_ids.append(raw)
    if unique_ids:
        found = db.execute(
            select(ClientEquipment.id).where(
                ClientEquipment.client_id == client_id,
                ClientEquipment.tenant_id == tenant_id,
                ClientEquipment.id.in_(unique_ids),
            )
        ).scalars().all()
        found_set = {str(item) for item in found}
        missing = [str(item) for item in unique_ids if str(item) not in found_set]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Um ou mais equipamentos não pertencem a este cliente.",
            )
    contract.contract_equipments.clear()
    for idx, equipment_id in enumerate(unique_ids):
        contract.contract_equipments.append(
            ClientContractEquipment(client_equipment_id=equipment_id, sort_order=idx)
        )


def _sync_contract_services(contract: ClientContract, services: list[str]) -> None:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in services:
        name = (raw or "").strip()[:200]
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(name)
    contract.contract_services.clear()
    for idx, name in enumerate(cleaned):
        contract.contract_services.append(ClientContractService(service_name=name, sort_order=idx))


def _next_client_contract_number(db: Session, *, tenant_id: int, year: int) -> tuple[str, int]:
    """Gera CTR-YYYY-NNN sequencial por tenant/ano (ex.: CTR-2026-001)."""
    prefix = f"CTR-{year}-"
    numbers = db.execute(
        select(ClientContract.contract_number).where(
            ClientContract.tenant_id == tenant_id,
            ClientContract.contract_number.like(f"{prefix}%"),
        )
    ).scalars().all()
    max_seq = 0
    pattern = re.compile(rf"^CTR-{year}-(\d+)$", re.IGNORECASE)
    for raw in numbers:
        match = pattern.match(str(raw or "").strip())
        if not match:
            continue
        max_seq = max(max_seq, int(match.group(1)))
    sequence = max_seq + 1
    return f"{prefix}{sequence:03d}", sequence


@router.get("/{client_id}/contracts", response_model=list[ClientContractOut])
def list_client_contracts(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[ClientContractOut]:
    _get_client_for_tenant(db, client_id, current_user.tenant_id)
    rows = db.execute(
        select(ClientContract)
        .options(*_client_contract_load_options())
        .where(ClientContract.client_id == client_id, ClientContract.tenant_id == current_user.tenant_id)
        .order_by(ClientContract.created_at.desc())
    ).scalars().all()
    return [ClientContractOut.from_model(row) for row in rows]


@router.get(
    "/{client_id}/contracts/next-number",
    response_model=ClientContractNextNumberOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def get_client_contract_next_number(
    client_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
) -> ClientContractNextNumberOut:
    _get_client_for_tenant(db, client_id, current_user.tenant_id)
    contract_year = year or datetime.now(timezone.utc).year
    number, sequence = _next_client_contract_number(
        db, tenant_id=current_user.tenant_id, year=contract_year
    )
    return ClientContractNextNumberOut(
        contract_number=number,
        contract_year=contract_year,
        sequence=sequence,
        preview=True,
    )


@router.post(
    "/{client_id}/contracts",
    response_model=ClientContractOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def create_client_contract(
    client_id: int,
    payload: ClientContractCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientContractOut:
    client = _get_client_for_tenant(db, client_id, current_user.tenant_id)
    if payload.end_date < payload.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A data de término não pode ser anterior à data de início.",
        )
    if payload.status == "active" and payload.value <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contrato ativo precisa ter valor maior que zero.",
        )
    site_id = payload.client_site_id
    if site_id is not None:
        _get_client_site_for_client(db, site_id=site_id, client_id=client.id, tenant_id=current_user.tenant_id)
    if payload.responsible_user_id is not None:
        responsible = db.execute(
            select(User).where(
                User.id == payload.responsible_user_id,
                User.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if responsible is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Responsável não encontrado.")
    category = (payload.category or "sob_demanda").strip().lower() or "sob_demanda"
    contract_year = payload.contract_year or payload.start_date.year
    last_error: Exception | None = None
    for _attempt in range(5):
        contract_number, sequence = _next_client_contract_number(
            db, tenant_id=client.tenant_id, year=contract_year
        )
        display_number = (payload.display_number or "").strip() or f"Nº: {contract_year}.{sequence:03d}.0001"
        contract = ClientContract(
            tenant_id=client.tenant_id,
            client_id=client.id,
            client_site_id=site_id,
            responsible_user_id=payload.responsible_user_id,
            contract_number=contract_number,
            display_number=display_number,
            contract_year=contract_year,
            contract_type=payload.contract_type.strip(),
            category=category,
            form_category_label=(payload.form_category_label or "").strip() or None,
            title=payload.title.strip(),
            status=payload.status,
            recurrence=payload.recurrence,
            start_date=payload.start_date,
            end_date=payload.end_date,
            value_cents=round(payload.value * 100),
            next_due_date=payload.next_due_date,
            payment_method=(payload.payment_method or "").strip() or None,
            due_day=payload.due_day,
            adjustment_index=(payload.adjustment_index or "").strip() or None,
            adjustment_period=(payload.adjustment_period or "").strip() or None,
            late_fee_percent=payload.late_fee_percent,
            interest_percent=payload.interest_percent,
            auto_renewal=bool(payload.auto_renewal),
            expiry_notice_days=payload.expiry_notice_days,
            coverage_location=(payload.coverage_location or "").strip() or None,
            billing_notes=(payload.billing_notes or "").strip() or None,
            notes=(payload.notes or "").strip() or None,
        )
        db.add(contract)
        try:
            db.flush()
            _sync_contract_equipments(
                db,
                contract=contract,
                client_id=client.id,
                tenant_id=current_user.tenant_id,
                equipment_ids=list(payload.equipment_ids or []),
            )
            _sync_contract_services(contract, list(payload.services or []))
            db.commit()
            contract = _get_client_contract_for_client(
                db, contract_id=contract.id, client_id=client.id, tenant_id=current_user.tenant_id
            )
            return ClientContractOut.from_model(contract)
        except HTTPException:
            db.rollback()
            raise
        except IntegrityError as exc:
            db.rollback()
            last_error = exc
            continue
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Não foi possível gerar um número de contrato único. Tente novamente.",
    ) from last_error


@router.put(
    "/{client_id}/contracts/{contract_id}",
    response_model=ClientContractOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def update_client_contract(
    client_id: int,
    contract_id: int,
    payload: ClientContractUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ClientContractOut:
    contract = _get_client_contract_for_client(
        db, contract_id=contract_id, client_id=client_id, tenant_id=current_user.tenant_id
    )
    if payload.contract_number is not None:
        contract.contract_number = payload.contract_number.strip()
    if payload.contract_type is not None:
        contract.contract_type = payload.contract_type.strip()
    if payload.title is not None:
        contract.title = payload.title.strip()
    if payload.status is not None:
        contract.status = payload.status
    if payload.recurrence is not None:
        contract.recurrence = payload.recurrence
    if payload.start_date is not None:
        contract.start_date = payload.start_date
    if payload.end_date is not None:
        contract.end_date = payload.end_date
    if payload.value is not None:
        contract.value_cents = round(payload.value * 100)
    if payload.payment_method is not None:
        contract.payment_method = payload.payment_method.strip() or None
    if payload.due_day is not None:
        contract.due_day = payload.due_day
    if payload.notes is not None:
        contract.notes = payload.notes.strip() or None
    if payload.client_site_id is not None:
        _get_client_site_for_client(
            db, site_id=payload.client_site_id, client_id=client_id, tenant_id=current_user.tenant_id
        )
        contract.client_site_id = payload.client_site_id
    if payload.responsible_user_id is not None:
        responsible = db.execute(
            select(User).where(
                User.id == payload.responsible_user_id,
                User.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if responsible is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Responsável não encontrado.")
        contract.responsible_user_id = payload.responsible_user_id
    if payload.category is not None:
        contract.category = payload.category.strip().lower() or contract.category
    if payload.form_category_label is not None:
        contract.form_category_label = payload.form_category_label.strip() or None
    if payload.next_due_date is not None:
        contract.next_due_date = payload.next_due_date
    if payload.adjustment_index is not None:
        contract.adjustment_index = payload.adjustment_index.strip() or None
    if payload.adjustment_period is not None:
        contract.adjustment_period = payload.adjustment_period.strip() or None
    if payload.late_fee_percent is not None:
        contract.late_fee_percent = payload.late_fee_percent
    if payload.interest_percent is not None:
        contract.interest_percent = payload.interest_percent
    if payload.auto_renewal is not None:
        contract.auto_renewal = payload.auto_renewal
    if payload.expiry_notice_days is not None:
        contract.expiry_notice_days = payload.expiry_notice_days
    if payload.coverage_location is not None:
        contract.coverage_location = payload.coverage_location.strip() or None
    if payload.billing_notes is not None:
        contract.billing_notes = payload.billing_notes.strip() or None
    if payload.display_number is not None:
        contract.display_number = payload.display_number.strip() or None
    if payload.contract_year is not None:
        contract.contract_year = payload.contract_year
    if payload.equipment_ids is not None:
        _sync_contract_equipments(
            db,
            contract=contract,
            client_id=client_id,
            tenant_id=current_user.tenant_id,
            equipment_ids=list(payload.equipment_ids),
        )
    if payload.services is not None:
        _sync_contract_services(contract, list(payload.services))
    start = contract.start_date
    end = contract.end_date
    if end < start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A data de término não pode ser anterior à data de início.",
        )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe um contrato com este número nesta empresa.",
        )
    contract = _get_client_contract_for_client(
        db, contract_id=contract_id, client_id=client_id, tenant_id=current_user.tenant_id
    )
    return ClientContractOut.from_model(contract)


@router.delete(
    "/{client_id}/contracts/{contract_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def delete_client_contract(
    client_id: int,
    contract_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    contract = _get_client_contract_for_client(
        db, contract_id=contract_id, client_id=client_id, tenant_id=current_user.tenant_id
    )
    for attachment in list(contract.attachments or []):
        delete_client_contract_attachment_if_exists(
            attachment.file_s3_key,
            content_type=attachment.file_type,
            db=db,
        )
    db.delete(contract)
    db.commit()


@router.get(
    "/{client_id}/contracts/{contract_id}/attachments",
    response_model=list[ClientContractAttachmentOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def list_client_contract_attachments(
    client_id: int,
    contract_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[ClientContractAttachment]:
    _get_client_contract_for_client(
        db, contract_id=contract_id, client_id=client_id, tenant_id=current_user.tenant_id
    )
    rows = db.execute(
        select(ClientContractAttachment)
        .where(ClientContractAttachment.client_contract_id == contract_id)
        .order_by(ClientContractAttachment.created_at.desc())
    ).scalars().all()
    return list(rows)


@router.post(
    "/{client_id}/contracts/{contract_id}/attachments",
    response_model=ClientContractAttachmentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
async def upload_client_contract_attachment_route(
    client_id: int,
    contract_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> ClientContractAttachment:
    contract = _get_client_contract_for_client(
        db, contract_id=contract_id, client_id=client_id, tenant_id=current_user.tenant_id
    )
    raw = await file.read()
    try:
        uploaded = upload_client_contract_attachment(
            tenant_id=current_user.tenant_id,
            client_id=client_id,
            contract_id=contract.id,
            file_bytes=raw,
            source_filename=file.filename,
            source_content_type=file.content_type,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    attachment = ClientContractAttachment(
        client_contract_id=contract.id,
        file_type=uploaded.content_type,
        file_name=uploaded.file_name,
        file_s3_key=uploaded.s3_key,
        file_url=uploaded.public_url,
        size_bytes=uploaded.size_bytes,
        uploaded_by_user_id=current_user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.delete(
    "/{client_id}/contracts/{contract_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def delete_client_contract_attachment_route(
    client_id: int,
    contract_id: int,
    attachment_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    _get_client_contract_for_client(
        db, contract_id=contract_id, client_id=client_id, tenant_id=current_user.tenant_id
    )
    attachment = db.execute(
        select(ClientContractAttachment).where(
            ClientContractAttachment.id == attachment_id,
            ClientContractAttachment.client_contract_id == contract_id,
        )
    ).scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anexo não encontrado.")
    delete_client_contract_attachment_if_exists(
        attachment.file_s3_key,
        content_type=attachment.file_type,
        db=db,
    )
    db.delete(attachment)
    db.commit()
