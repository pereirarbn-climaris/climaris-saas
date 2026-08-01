"""Rotas públicas (sem login): ficha do equipamento para QR."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user
from app.equipment_history import list_equipment_service_visits
from app.pmoc_public_validation import build_public_pmoc_validation
from app.schemas import (
    EquipmentTokenResolveOut,
    PublicEquipmentHistoryEntryOut,
    PublicEquipmentPageOut,
    PublicPmocValidationEquipmentOut,
    PublicPmocValidationOut,
    PmocComplianceIndicatorOut,
    PublicEquipmentTechnicalSpecOut,
)
from app.services.qrcode_labels import get_qrcode_by_code_id, normalize_code_id, resolve_equipment_id_from_public_key
from app.services.category_field_definitions import (
    build_technical_spec_display,
    resolve_category_field_definitions,
    technical_data_from_catalog,
)
from models import (
    Client,
    ClientEquipment,
    ClientEquipmentComponent,
    Equipment,
    EquipmentCatalog,
    EquipmentCatalogComponentType,
    OrderStatus,
    QrCode,
    Service,
    ServiceOrder,
    ServiceOrderEquipmentService,
    ServiceOrderServiceItem,
    ServiceOrderServiceItemEquipmentAudit,
    Tenant,
    User,
)

router = APIRouter(prefix="/public", tags=["public"])
equipment_token_router = APIRouter(prefix="/equipment-public", tags=["equipment-public"])


def _primary_catalog_component(components: list[ClientEquipmentComponent]) -> ClientEquipmentComponent | None:
    for row in components:
        if row.catalog.component_type == EquipmentCatalogComponentType.CONDENSADORA:
            return row
    return components[0] if components else None


def _legacy_technical_specs(equipment: Equipment) -> list[PublicEquipmentTechnicalSpecOut]:
    rows: list[PublicEquipmentTechnicalSpecOut] = []
    if equipment.capacidade_btu:
        rows.append(
            PublicEquipmentTechnicalSpecOut(
                key="capacity",
                label="Capacidade",
                value=f"{equipment.capacidade_btu:,}".replace(",", ".") + " BTUs",
            )
        )
    if equipment.tipo_gas:
        rows.append(
            PublicEquipmentTechnicalSpecOut(key="fluid_type", label="Fluido refrigerante", value=equipment.tipo_gas)
        )
    if equipment.voltagem:
        rows.append(PublicEquipmentTechnicalSpecOut(key="voltage", label="Tensão", value=equipment.voltagem))
    return rows


def _format_tenant_street_line(tenant: Tenant) -> str | None:
    parts: list[str] = []
    street = (tenant.address_street or "").strip()
    number = (tenant.address_number or "").strip()
    complement = (tenant.address_complement or "").strip()
    district = (tenant.address_district or "").strip()
    if street:
        line = street
        if number:
            line = f"{line}, {number}"
        if complement:
            line = f"{line} — {complement}"
        parts.append(line)
    if district:
        parts.append(district)
    return " — ".join(parts) if parts else None


def _installation_technical_specs(installation: ClientEquipment) -> list[PublicEquipmentTechnicalSpecOut]:
    components = list(installation.components or [])
    primary = _primary_catalog_component(components)
    if primary is None or primary.catalog is None:
        return []
    catalog = primary.catalog
    category = catalog.category
    definitions = resolve_category_field_definitions(category) if category else []
    data = technical_data_from_catalog(catalog)
    return [
        PublicEquipmentTechnicalSpecOut(key=row["key"], label=row["label"], value=row["value"])
        for row in build_technical_spec_display(definitions, data)
    ]


def _public_equipment_not_found_detail(db: Session, key: str) -> str:
    normalized = normalize_code_id(key)
    if normalized.upper().startswith("QR"):
        row = get_qrcode_by_code_id(db, normalized)
        if row is None:
            return "Etiqueta não encontrada ou inválida."
        if row.linked_to_equipment_id is None:
            return "Etiqueta ainda não vinculada a um equipamento."
    return "Equipamento não encontrado."


def _equipment_status_label(db: Session, *, equipment_id: int, tenant_id: int, is_active: bool) -> str:
    if not is_active:
        return "Inativo"
    open_statuses = (
        OrderStatus.OPEN,
        OrderStatus.SCHEDULED,
        OrderStatus.IN_PROGRESS,
        OrderStatus.APPROVED,
    )
    has_open = db.execute(
        select(ServiceOrder.id)
        .join(ServiceOrderEquipmentService, ServiceOrderEquipmentService.service_order_id == ServiceOrder.id)
        .where(
            ServiceOrder.tenant_id == tenant_id,
            ServiceOrderEquipmentService.equipment_id == equipment_id,
            ServiceOrder.status.in_(open_statuses),
        )
        .limit(1)
    ).scalar_one_or_none()
    if has_open is not None:
        return "Em Manutenção"
    return "Operacional"


def _load_equipment_tenant_row(db: Session, key: str) -> tuple[Equipment, Tenant, QrCode | None] | None:
    equipment_id = resolve_equipment_id_from_public_key(db, key)
    if equipment_id is None:
        return None
    row = db.execute(
        select(Equipment, Tenant)
        .join(Client, Client.id == Equipment.client_id)
        .join(Tenant, Tenant.id == Client.tenant_id)
        .where(Equipment.id == equipment_id)
    ).first()
    if row is None:
        return None
    equipment, tenant = row[0], row[1]
    qr = db.execute(
        select(QrCode).where(QrCode.linked_to_equipment_id == equipment.id).order_by(QrCode.id.desc())
    ).scalar_one_or_none()
    return equipment, tenant, qr


@router.get("/equipment/{token}", response_model=PublicEquipmentPageOut)
def public_equipment_page(
    token: str,
    db: Annotated[Session, Depends(get_db)],
) -> PublicEquipmentPageOut:
    key = token.strip()
    loaded = _load_equipment_tenant_row(db, key)
    if loaded is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=_public_equipment_not_found_detail(db, key),
        )
    equipment, tenant, qr_row = loaded
    tenant_id = tenant.id
    eq_id = equipment.id
    entries: list[PublicEquipmentHistoryEntryOut] = []

    installation = db.execute(
        select(ClientEquipment)
        .options(
            joinedload(ClientEquipment.components)
            .joinedload(ClientEquipmentComponent.catalog)
            .joinedload(EquipmentCatalog.category),
        )
        .where(ClientEquipment.legacy_equipment_id == eq_id)
    ).unique().scalar_one_or_none()

    technical_specs = _installation_technical_specs(installation) if installation else []
    if not technical_specs:
        technical_specs = _legacy_technical_specs(equipment)

    category_name: str | None = None
    if installation:
        primary = _primary_catalog_component(list(installation.components or []))
        if primary and primary.catalog and primary.catalog.category:
            category_name = primary.catalog.category.name

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
            ServiceOrderServiceItemEquipmentAudit.new_equipment_id == eq_id,
            ServiceOrderServiceItemEquipmentAudit.source != "manual_correction_inversion",
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

    for visit in list_equipment_service_visits(db, tenant_id=tenant_id, equipment_id=eq_id):
        detail_parts: list[str] = []
        if visit.service_type:
            detail_parts.append(visit.service_type)
        if visit.technician_name:
            detail_parts.append(f"Técnico: {visit.technician_name}")
        status_label = visit.order_status_label or ""
        entries.append(
            PublicEquipmentHistoryEntryOut(
                occurred_at=visit.changed_at,
                kind="servico",
                title=(
                    f"OS #{visit.service_order_number} — {status_label} — "
                    f"{visit.service_name or 'Serviço'}"
                ),
                detail=" · ".join(detail_parts) if detail_parts else None,
            )
        )

    entries.sort(key=lambda e: e.occurred_at, reverse=True)

    tipo_val = equipment.tipo.value if hasattr(equipment.tipo, "value") else str(equipment.tipo)
    is_active = installation.is_active if installation else equipment.ativo
    status_label = _equipment_status_label(
        db, equipment_id=eq_id, tenant_id=tenant_id, is_active=is_active
    )
    return PublicEquipmentPageOut(
        equipment_id=equipment.id,
        client_id=equipment.client_id,
        qrcode_code_id=qr_row.code_id if qr_row is not None else normalize_code_id(token),
        equipment_status_label=status_label,
        tenant_name=str(tenant.name or "—"),
        tenant_cnpj=(tenant.cnpj or "").strip() or None,
        tenant_phone=(tenant.phone or "").strip() or None,
        tenant_email=(tenant.email or "").strip() or None,
        tenant_address=_format_tenant_street_line(tenant),
        tenant_city=(tenant.address_city or "").strip() or None,
        tenant_state=(tenant.address_state or "").strip() or None,
        tenant_website=(tenant.website or "").strip() or None,
        tenant_logo_url=(tenant.logo_url or "").strip() or None,
        identificacao=equipment.identificacao,
        tipo=tipo_val,
        modelo=equipment.modelo,
        fabricante=equipment.fabricante,
        category_name=category_name,
        serial=equipment.serial,
        is_active=is_active,
        technical_specs=technical_specs,
        entries=entries,
    )


@router.get("/pmoc-validation/{pmoc_id}", response_model=PublicPmocValidationOut)
def public_pmoc_validation_page(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> PublicPmocValidationOut:
    """Validação pública de conformidade PMOC (QR Code no laudo PDF). Sem autenticação."""
    try:
        result = build_public_pmoc_validation(db, pmoc_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return PublicPmocValidationOut(
        pmoc_id=result.pmoc_id,
        plan_title=result.plan_title,
        plan_status=result.plan_status,
        client_name=result.client_name,
        establishment_label=result.establishment_label,
        establishment_city=result.establishment_city,
        establishment_state=result.establishment_state,
        responsible_name=result.responsible_name,
        art_number=result.art_number,
        art_valid_until=result.art_valid_until,
        overall_status=result.overall_status,
        indicators=[
            PmocComplianceIndicatorOut(
                key=i.key,
                label=i.label,
                status=i.status,
                summary=i.summary,
                detail=i.detail,
            )
            for i in result.indicators
        ],
        last_maintenance_at=result.last_maintenance_at,
        next_maintenance_expected=result.next_maintenance_expected,
        equipments=[
            PublicPmocValidationEquipmentOut(
                label=eq.label,
                model=eq.model,
                location=eq.location,
                conservation_status=eq.conservation_status,
                last_inspection_at=eq.last_inspection_at,
            )
            for eq in result.equipments
        ],
        validated_at=result.validated_at,
        validation_url=result.validation_url,
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
