from __future__ import annotations

import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.pagination import clamp_limit
from app.schemas import (
    EquipmentCatalogDuplicateCheckOut,
    EquipmentCatalogListOut,
    EquipmentCatalogOut,
    EquipmentCategoryListOut,
    EquipmentCategoryOut,
    EquipmentLabelExtractionOut,
)
from app.services.catalog_duplicate import find_catalog_duplicate
from app.services.category_field_definitions import (
    parse_field_definitions,
    sync_legacy_catalog_columns,
    validate_technical_data,
)
from app.services.equipment_category_fields import (
    empty_to_none,
    extract_extra_technical_fields,
    is_split_ac_category,
    normalize_catalog_technical_fields,
)
from app.services.platform_catalog import resolve_catalog_list_tenant_id, resolve_catalog_write_tenant_id
from app.services.equipment_catalog_form import (
    has_manual_pdf_upload,
    read_catalog_create_multipart,
    read_catalog_existing_manual_multipart,
)
from app.platform_credentials import resolve_claude_api_key, resolve_claude_model
from app.services.equipment_label_vision import (
    extract_ac_label_from_images,
    extract_climatizador_label_from_images,
)
from app.services.equipment_manuals import (
    build_catalog_display_model,
    create_equipment_manual_from_pdf,
    get_equipment_manual_or_404,
)
from models import EquipmentCatalog, EquipmentCatalogComponentType, EquipmentCategory, User, UserRole

router = APIRouter(prefix="/equipment-catalog", tags=["equipment-catalog"])


def _manual_upload_http_error(exc: ValueError) -> HTTPException:
    """Mapeia erros de validação de PDF; tamanho excedido → HTTP 413."""
    msg = str(exc)
    lowered = msg.lower()
    if "grande" in lowered or "máximo" in lowered or "máx." in lowered:
        return HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=msg)
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _catalog_query():
    return select(EquipmentCatalog).options(
        joinedload(EquipmentCatalog.manual),
        joinedload(EquipmentCatalog.category),
    )


def _get_catalog_entry_or_404(
    db: Session, catalog_id: uuid.UUID, tenant_id: int, *, current_user: User | None = None
) -> EquipmentCatalog:
    catalog_tenant_id = tenant_id
    if current_user is not None:
        catalog_tenant_id = resolve_catalog_list_tenant_id(db, current_user)
    entry = db.execute(
        _catalog_query().where(
            EquipmentCatalog.id == catalog_id,
            EquipmentCatalog.tenant_id == catalog_tenant_id,
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modelo não encontrado no catálogo.")
    return entry


def _get_category_or_404(db: Session, category_id: uuid.UUID, tenant_id: int) -> EquipmentCategory:
    category = db.execute(
        select(EquipmentCategory).where(
            EquipmentCategory.id == category_id,
            EquipmentCategory.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria não encontrada.")
    return category


async def _create_manual_from_upload(
    *,
    file: UploadFile,
    title: str,
    tenant_id: int,
    db: Session,
) -> uuid.UUID:
    try:
        manual = await create_equipment_manual_from_pdf(
            file=file,
            title=title,
            tenant_id=tenant_id,
            db=db,
        )
    except ValueError as exc:
        raise _manual_upload_http_error(exc) from exc
    except TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc) or "Tempo esgotado ao enviar o manual para o armazenamento.",
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return manual.id


async def _merge_extra_manuals_into_entry(
    *,
    entry: EquipmentCatalog,
    extra_pdfs: dict[str, UploadFile],
    brand: str,
    tenant_id: int,
    db: Session,
) -> None:
    """Persiste IDs de manuais adicionais (usuário/instalação/serviço) em technical_data."""
    if not extra_pdfs:
        return
    labels = {
        "manual_usuario_pdf": "Manual do usuário",
        "manual_instalacao_pdf": "Manual de instalação",
        "manual_servico_pdf": "Manual de serviço",
    }
    id_keys = {
        "manual_usuario_pdf": "manual_usuario_id",
        "manual_instalacao_pdf": "manual_instalacao_id",
        "manual_servico_pdf": "manual_servico_id",
    }
    td = dict(entry.technical_data or {})
    for form_key, pdf in extra_pdfs.items():
        title = f"{brand.strip()} — {labels.get(form_key, 'Manual')}"
        manual_id = await _create_manual_from_upload(
            file=pdf,
            title=title,
            tenant_id=tenant_id,
            db=db,
        )
        td[id_keys.get(form_key, form_key)] = str(manual_id)
    entry.technical_data = td


def _apply_combined_usuario_instalacao_manual(entry: EquipmentCatalog, manual_id: uuid.UUID) -> None:
    """Um único PDF serve como manual do usuário e de instalação."""
    td = dict(entry.technical_data or {})
    mid = str(manual_id)
    td["manual_usuario_id"] = mid
    td["manual_instalacao_id"] = mid
    entry.technical_data = td


def _collect_extra_manual_pdfs(
    *,
    manual_usuario_pdf: UploadFile | None,
    manual_instalacao_pdf: UploadFile | None,
    manual_servico_pdf: UploadFile | None,
) -> dict[str, UploadFile]:
    extra_pdfs: dict[str, UploadFile] = {}
    for key, pdf in (
        ("manual_usuario_pdf", manual_usuario_pdf),
        ("manual_instalacao_pdf", manual_instalacao_pdf),
        ("manual_servico_pdf", manual_servico_pdf),
    ):
        if has_manual_pdf_upload(pdf):
            extra_pdfs[key] = pdf
    return extra_pdfs


async def _assign_primary_manual_from_pdf(
    *,
    entry: EquipmentCatalog,
    manual_pdf: UploadFile,
    manual_title: str | None,
    tenant_id: int,
    db: Session,
) -> uuid.UUID:
    title = (manual_title or "").strip()
    if not title and manual_pdf.filename:
        title = manual_pdf.filename.rsplit(".", 1)[0].strip() or manual_pdf.filename.strip()
    if not title:
        title = "Manual tecnico"
    try:
        manual = await create_equipment_manual_from_pdf(
            file=manual_pdf,
            title=title,
            tenant_id=tenant_id,
            db=db,
        )
    except ValueError as exc:
        raise _manual_upload_http_error(exc) from exc
    except TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc) or "Tempo esgotado ao enviar o manual para o armazenamento.",
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    entry.manual_id = manual.id
    return manual.id


def _apply_catalog_fields(
    entry: EquipmentCatalog,
    *,
    category: EquipmentCategory,
    brand: str,
    model_evaporator: str | None,
    model_condenser: str | None,
    capacity: str | None = None,
    fluid_type: str | None = None,
    voltage: str | None = None,
    technical_data: dict | None = None,
    model_fallback: str | None = None,
) -> None:
    definitions = parse_field_definitions(getattr(category, "field_definitions", None) or [])
    merged_technical: dict = {}
    extra_technical: dict = {}
    if technical_data is not None:
        payload_for_validation, extra_technical = extract_extra_technical_fields(technical_data)
        try:
            merged_technical = validate_technical_data(definitions, payload_for_validation)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        if extra_technical:
            merged_technical.update(extra_technical)
    else:
        legacy_payload = {
            k: v
            for k, v in (
                ("capacity", empty_to_none(capacity)),
                ("fluid_type", empty_to_none(fluid_type)),
                ("voltage", empty_to_none(voltage)),
            )
            if v
        }
        if legacy_payload:
            try:
                merged_technical = validate_technical_data(definitions, legacy_payload)
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    entry.technical_data = merged_technical
    sync_legacy_catalog_columns(entry, merged_technical)

    cap, fluid, volt = normalize_catalog_technical_fields(
        category,
        capacity=entry.capacity,
        fluid_type=entry.fluid_type,
        voltage=entry.voltage,
    )
    entry.capacity = cap
    entry.fluid_type = fluid
    entry.voltage = volt
    entry.category_id = category.id
    entry.brand = brand.strip()
    entry.model_evaporator = empty_to_none(model_evaporator)
    entry.model_condenser = empty_to_none(model_condenser)
    entry.model = build_catalog_display_model(
        model_evaporator=entry.model_evaporator,
        model_condenser=entry.model_condenser,
        fallback=empty_to_none(model_fallback),
    )
    evap = entry.model_evaporator
    cond = entry.model_condenser
    split_ac = is_split_ac_category(category)
    if evap and cond:
        entry.component_type = EquipmentCatalogComponentType.UNICO
    elif split_ac and evap and not cond:
        entry.component_type = EquipmentCatalogComponentType.EVAPORADORA
        entry.model = evap
    elif split_ac and cond and not evap:
        entry.component_type = EquipmentCatalogComponentType.CONDENSADORA
        entry.model = cond
    else:
        entry.component_type = EquipmentCatalogComponentType.UNICO
        if not entry.model and evap:
            entry.model = evap
        elif not entry.model and cond:
            entry.model = cond


def _search_filter(base, q: str):
    term = f"%{q.strip()}%"
    return base.where(
        or_(
            EquipmentCatalog.brand.ilike(term),
            EquipmentCatalog.model.ilike(term),
            EquipmentCatalog.model_evaporator.ilike(term),
            EquipmentCatalog.model_condenser.ilike(term),
        )
    )


def _apply_catalog_list_filters(
    stmt,
    *,
    tenant_id: int,
    category_id: uuid.UUID | None,
    brand: str | None,
    model: str | None,
    q: str | None,
):
    stmt = stmt.where(EquipmentCatalog.tenant_id == tenant_id)
    if category_id is not None:
        stmt = stmt.where(EquipmentCatalog.category_id == category_id)
    if brand and brand.strip():
        stmt = stmt.where(EquipmentCatalog.brand.ilike(f"%{brand.strip()}%"))
    if model and model.strip():
        term = f"%{model.strip()}%"
        stmt = stmt.where(
            or_(
                EquipmentCatalog.model.ilike(term),
                EquipmentCatalog.model_evaporator.ilike(term),
                EquipmentCatalog.model_condenser.ilike(term),
            )
        )
    if q and q.strip():
        stmt = _search_filter(stmt, q)
    return stmt


@router.post(
    "/ai/extract-label",
    response_model=EquipmentLabelExtractionOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def extract_equipment_label_from_photos(
    db: Annotated[Session, Depends(get_db)],
    equipment_kind: Annotated[str, Form()] = "ar_condicionado",
    evaporator_image: Annotated[UploadFile | None, File()] = None,
    condenser_image: Annotated[UploadFile | None, File()] = None,
    label_image: Annotated[UploadFile | None, File()] = None,
) -> EquipmentLabelExtractionOut:
    """Extrai dados estruturados de etiquetas via IA multimodal (ar-condicionado ou climatizador)."""
    kind = (equipment_kind or "ar_condicionado").strip().lower()
    claude_key = resolve_claude_api_key(db)
    claude_model = resolve_claude_model(db)

    if kind in ("climatizador", "clima"):
        label = label_image or evaporator_image
        label_bytes = await label.read() if label else None
        result = await extract_climatizador_label_from_images(
            label_bytes=label_bytes,
            label_content_type=label.content_type if label else None,
            label_filename=label.filename if label else None,
            claude_api_key=claude_key,
            claude_model=claude_model,
        )
        return EquipmentLabelExtractionOut.model_validate(result)

    evap_bytes = await evaporator_image.read() if evaporator_image else None
    cond_bytes = await condenser_image.read() if condenser_image else None
    result = await extract_ac_label_from_images(
        evaporator_bytes=evap_bytes,
        evaporator_content_type=evaporator_image.content_type if evaporator_image else None,
        evaporator_filename=evaporator_image.filename if evaporator_image else None,
        condenser_bytes=cond_bytes,
        condenser_content_type=condenser_image.content_type if condenser_image else None,
        condenser_filename=condenser_image.filename if condenser_image else None,
        claude_api_key=claude_key,
        claude_model=claude_model,
    )
    return EquipmentLabelExtractionOut.model_validate(result)


@router.get("/categories", response_model=EquipmentCategoryListOut)
def list_catalog_categories(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentCategoryListOut:
    """Categorias do catálogo global — qualquer usuário autenticado do workspace."""
    catalog_tenant_id = resolve_catalog_list_tenant_id(db, current_user)
    rows = db.execute(
        select(EquipmentCategory)
        .where(EquipmentCategory.tenant_id == catalog_tenant_id)
        .order_by(EquipmentCategory.sort_order.asc(), EquipmentCategory.name.asc())
    ).scalars().all()
    return EquipmentCategoryListOut(items=[EquipmentCategoryOut.model_validate(row) for row in rows])


@router.get("/check-duplicate", response_model=EquipmentCatalogDuplicateCheckOut)
def check_equipment_catalog_duplicate(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    category_id: Annotated[uuid.UUID, Query()],
    brand: Annotated[str, Query(min_length=1, max_length=120)],
    model_evaporator: Annotated[str | None, Query(max_length=120)] = None,
    model_condenser: Annotated[str | None, Query(max_length=120)] = None,
    model: Annotated[str | None, Query(max_length=120)] = None,
    exclude_catalog_id: Annotated[uuid.UUID | None, Query()] = None,
) -> EquipmentCatalogDuplicateCheckOut:
    """Verifica se marca/modelo já existem no catálogo (evita cadastro duplicado)."""
    catalog_tenant_id = resolve_catalog_list_tenant_id(db, current_user)
    category = _get_category_or_404(db, category_id, catalog_tenant_id)
    existing = find_catalog_duplicate(
        db,
        tenant_id=catalog_tenant_id,
        category=category,
        brand=brand,
        model_evaporator=model_evaporator,
        model_condenser=model_condenser,
        model_fallback=model,
        exclude_catalog_id=exclude_catalog_id,
    )
    if existing is None:
        return EquipmentCatalogDuplicateCheckOut(exists=False)
    return EquipmentCatalogDuplicateCheckOut(
        exists=True,
        catalog_id=str(existing.id),
        brand=existing.brand,
        model=existing.model,
        category_name=category.name,
    )


@router.get("", response_model=EquipmentCatalogListOut)
def list_equipment_catalog(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1)] = 50,
    category_id: Annotated[uuid.UUID | None, Query()] = None,
    brand: Annotated[str | None, Query(max_length=120)] = None,
    model: Annotated[str | None, Query(max_length=120)] = None,
    q: Annotated[str | None, Query(max_length=120, description="Busca em marca ou modelos")] = None,
) -> EquipmentCatalogListOut:
    limit = clamp_limit(limit)
    catalog_tenant_id = resolve_catalog_list_tenant_id(db, current_user)
    filters = {
        "tenant_id": catalog_tenant_id,
        "category_id": category_id,
        "brand": brand,
        "model": model,
        "q": q,
    }
    base = _apply_catalog_list_filters(_catalog_query(), **filters)
    count_stmt = _apply_catalog_list_filters(
        select(func.count()).select_from(EquipmentCatalog),
        **filters,
    )
    total = db.execute(count_stmt).scalar_one()
    rows = db.execute(
        base.order_by(EquipmentCatalog.brand, EquipmentCatalog.model).offset(skip).limit(limit)
    ).unique().scalars().all()
    return EquipmentCatalogListOut(
        items=[EquipmentCatalogOut.model_validate(row) for row in rows],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post(
    "",
    response_model=EquipmentCatalogOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def create_equipment_catalog_with_manual_upload(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentCatalog:
    form_data, manual_pdf, extra_pdfs, manual_combinado = await read_catalog_create_multipart(request)

    if not has_manual_pdf_upload(manual_pdf):
        for promote_key in ("manual_instalacao_pdf", "manual_usuario_pdf", "manual_servico_pdf"):
            if promote_key in extra_pdfs:
                manual_pdf = extra_pdfs.pop(promote_key)
                break

    catalog_tenant_id = resolve_catalog_write_tenant_id(db, current_user)
    category = _get_category_or_404(db, form_data.category_id, catalog_tenant_id)

    manual_id: uuid.UUID | None = None
    if has_manual_pdf_upload(manual_pdf):
        title = form_data.manual_title
        if not title and manual_pdf and manual_pdf.filename:
            title = manual_pdf.filename.rsplit(".", 1)[0].strip() or manual_pdf.filename.strip()
        if not title:
            title = "Manual tecnico"
        try:
            manual = await create_equipment_manual_from_pdf(
                file=manual_pdf,
                title=title,
                tenant_id=catalog_tenant_id,
                db=db,
            )
        except ValueError as exc:
            raise _manual_upload_http_error(exc) from exc
        except TimeoutError as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail=str(exc) or "Tempo esgotado ao enviar o manual para o armazenamento.",
            ) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
        manual_id = manual.id

    entry = EquipmentCatalog(
        tenant_id=catalog_tenant_id,
        category_id=category.id,
        manual_id=manual_id,
        brand="",
        model="—",
    )
    try:
        _apply_catalog_fields(
            entry,
            category=category,
            brand=form_data.brand,
            model_evaporator=form_data.model_evaporator,
            model_condenser=form_data.model_condenser,
            capacity=form_data.capacity,
            fluid_type=form_data.fluid_type,
            voltage=form_data.voltage,
            technical_data=form_data.parsed_technical_data(),
            model_fallback=form_data.model,
        )
    except HTTPException:
        raise
    duplicate = find_catalog_duplicate(
        db,
        tenant_id=catalog_tenant_id,
        category=category,
        brand=form_data.brand,
        model_evaporator=form_data.model_evaporator,
        model_condenser=form_data.model_condenser,
        model_fallback=form_data.model,
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Este equipamento já está cadastrado no catálogo: "
                f"{duplicate.brand} {duplicate.model} ({category.name}). "
                "Não cadastre novamente — edite o registro existente se precisar atualizar dados."
            ),
        )
    db.add(entry)
    await _merge_extra_manuals_into_entry(
        entry=entry,
        extra_pdfs=extra_pdfs,
        brand=form_data.brand,
        tenant_id=catalog_tenant_id,
        db=db,
    )
    if manual_combinado and entry.manual_id is not None:
        _apply_combined_usuario_instalacao_manual(entry, entry.manual_id)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Este equipamento já está cadastrado no catálogo com a mesma marca, modelo e categoria. "
                "Não cadastre novamente."
            ),
        ) from exc
    return db.execute(_catalog_query().where(EquipmentCatalog.id == entry.id)).scalar_one()


@router.post(
    "/with-existing-manual",
    response_model=EquipmentCatalogOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def create_equipment_catalog_with_existing_manual(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentCatalog:
    form_data = await read_catalog_existing_manual_multipart(request)

    catalog_tenant_id = resolve_catalog_write_tenant_id(db, current_user)
    category = _get_category_or_404(db, form_data.category_id, catalog_tenant_id)
    try:
        get_equipment_manual_or_404(db, form_data.manual_id, catalog_tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    entry = EquipmentCatalog(
        tenant_id=catalog_tenant_id,
        category_id=category.id,
        manual_id=form_data.manual_id,
        brand="",
        model="—",
    )
    try:
        _apply_catalog_fields(
            entry,
            category=category,
            brand=form_data.brand,
            model_evaporator=form_data.model_evaporator,
            model_condenser=form_data.model_condenser,
            capacity=form_data.capacity,
            fluid_type=form_data.fluid_type,
            voltage=form_data.voltage,
            technical_data=form_data.parsed_technical_data(),
            model_fallback=form_data.model,
        )
    except HTTPException:
        raise
    duplicate = find_catalog_duplicate(
        db,
        tenant_id=catalog_tenant_id,
        category=category,
        brand=form_data.brand,
        model_evaporator=form_data.model_evaporator,
        model_condenser=form_data.model_condenser,
        model_fallback=form_data.model,
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Este equipamento já está cadastrado no catálogo: "
                f"{duplicate.brand} {duplicate.model} ({category.name}). "
                "Não cadastre novamente — edite o registro existente se precisar atualizar dados."
            ),
        )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Este equipamento já está cadastrado no catálogo com a mesma marca, modelo e categoria. "
                "Não cadastre novamente."
            ),
        ) from exc
    return db.execute(_catalog_query().where(EquipmentCatalog.id == entry.id)).scalar_one()


@router.patch(
    "/{catalog_id}",
    response_model=EquipmentCatalogOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def update_equipment_catalog_entry(
    catalog_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    category_id: Annotated[uuid.UUID | None, Form()] = None,
    brand: Annotated[str | None, Form(min_length=1, max_length=120)] = None,
    model_evaporator: Annotated[str | None, Form(max_length=120)] = None,
    model_condenser: Annotated[str | None, Form(max_length=120)] = None,
    model: Annotated[str | None, Form(max_length=120)] = None,
    capacity: Annotated[str | None, Form(max_length=80)] = None,
    fluid_type: Annotated[str | None, Form(max_length=40)] = None,
    voltage: Annotated[str | None, Form(max_length=40)] = None,
    technical_data: Annotated[str | None, Form()] = None,
    manual_id: Annotated[uuid.UUID | None, Form()] = None,
    manual_title: Annotated[str | None, Form(max_length=200)] = None,
    manual_pdf: Annotated[UploadFile | None, File()] = None,
    manual_usuario_pdf: Annotated[UploadFile | None, File()] = None,
    manual_instalacao_pdf: Annotated[UploadFile | None, File()] = None,
    manual_servico_pdf: Annotated[UploadFile | None, File()] = None,
    manual_combinado_usuario_instalacao: Annotated[bool, Form()] = False,
    clear_manual: Annotated[bool, Form()] = False,
) -> EquipmentCatalog:
    catalog_tenant_id = resolve_catalog_write_tenant_id(db, current_user)
    entry = _get_catalog_entry_or_404(db, catalog_id, current_user.tenant_id, current_user=current_user)
    category = entry.category

    if category_id is not None:
        category = _get_category_or_404(db, category_id, catalog_tenant_id)
        entry.category_id = category.id

    if brand is not None:
        entry.brand = brand.strip()
    if model_evaporator is not None:
        entry.model_evaporator = empty_to_none(model_evaporator)
    if model_condenser is not None:
        entry.model_condenser = empty_to_none(model_condenser)

    parsed_technical: dict | None = None
    if technical_data is not None and str(technical_data).strip():
        try:
            raw = json.loads(str(technical_data))
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="technical_data deve ser um JSON válido.",
            ) from exc
        if not isinstance(raw, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="technical_data deve ser um objeto JSON.",
            )
        parsed_technical = raw

    if any(
        v is not None
        for v in (capacity, fluid_type, voltage, category_id, technical_data)
    ):
        merged_technical: dict = dict(entry.technical_data or {})
        if parsed_technical is not None:
            merged_technical.update(parsed_technical)
        for key, form_val in (
            ("capacity", capacity),
            ("fluid_type", fluid_type),
            ("voltage", voltage),
        ):
            if form_val is not None:
                stripped = empty_to_none(form_val)
                if stripped:
                    merged_technical[key] = stripped
                else:
                    merged_technical.pop(key, None)
        try:
            _apply_catalog_fields(
                entry,
                category=category,
                brand=entry.brand,
                model_evaporator=entry.model_evaporator,
                model_condenser=entry.model_condenser,
                technical_data=merged_technical,
                model_fallback=model or entry.model,
            )
        except HTTPException:
            raise

    if clear_manual:
        entry.manual_id = None
    else:
        extra_pdfs = _collect_extra_manual_pdfs(
            manual_usuario_pdf=manual_usuario_pdf,
            manual_instalacao_pdf=manual_instalacao_pdf,
            manual_servico_pdf=manual_servico_pdf,
        )
        primary_pdf = manual_pdf
        if not has_manual_pdf_upload(primary_pdf) and entry.manual_id is None:
            for promote_key in ("manual_instalacao_pdf", "manual_usuario_pdf", "manual_servico_pdf"):
                if promote_key in extra_pdfs:
                    primary_pdf = extra_pdfs.pop(promote_key)
                    break

        if has_manual_pdf_upload(primary_pdf):
            await _assign_primary_manual_from_pdf(
                entry=entry,
                manual_pdf=primary_pdf,
                manual_title=manual_title,
                tenant_id=catalog_tenant_id,
                db=db,
            )
            if manual_combinado_usuario_instalacao and entry.manual_id is not None:
                _apply_combined_usuario_instalacao_manual(entry, entry.manual_id)
        elif manual_id is not None:
            try:
                get_equipment_manual_or_404(db, manual_id, catalog_tenant_id)
                entry.manual_id = manual_id
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

        if extra_pdfs:
            await _merge_extra_manuals_into_entry(
                entry=entry,
                extra_pdfs=extra_pdfs,
                brand=entry.brand,
                tenant_id=catalog_tenant_id,
                db=db,
            )

    entry.model = build_catalog_display_model(
        model_evaporator=entry.model_evaporator,
        model_condenser=entry.model_condenser,
        fallback=model or entry.model,
    )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe um item no catálogo com esta marca, modelos e categoria.",
        ) from exc
    return db.execute(_catalog_query().where(EquipmentCatalog.id == entry.id)).scalar_one()
