"""API do PMOC (Lei Federal nº 13.589/2018) — plano por estabelecimento, fichas por equipamento."""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.pmoc_compliance import compute_pmoc_compliance_summary
from app.pmoc_pdf import build_pmoc_report_pdf
from app.pmoc_pending_tasks import compute_pmoc_pending_tasks
from app.pmoc_schedule import compute_pmoc_estimated_time
from app.services.client_equipment_deactivation import assert_equipment_active_for_operations
from app.pmoc_service import (
    DEFAULT_LAW_NOTE,
    apply_pmoc_rt_fields,
    build_pmoc_create_validation_issues,
    client_site_snapshot_dict,
    deactivate_other_active_plans,
    extras_default,
    merge_planning_scheduled_rows,
    parse_extras,
    parse_planning_scheduled_rows,
    refresh_pmoc_computed_fields,
    seed_default_activities,
    serialize_extras,
)
from app.services.client_sites import get_client_site_for_client
from app.pmoc_storage import delete_pmoc_file_if_exists, upload_pmoc_file, validate_pmoc_pdf_upload
from app.tenant_logo import generate_tenant_logo_presigned_url
from app.schemas import (
    PmocActivePlanCheckOut,
    PmocAirQualityAnalysisCreate,
    PmocAirQualityAnalysisOut,
    PmocClientSummaryOut,
    PmocExecutionCreate,
    PmocExecutionOut,
    PmocEstimatedTimeLineOut,
    PmocEstimatedTimeOut,
    PmocFieldInspectionCreate,
    PmocFieldInspectionOut,
    PmocComplianceIndicatorOut,
    PmocComplianceSummaryOut,
    PmocOccurrenceAlertOut,
    PmocOccurrenceCreate,
    PmocOccurrenceOut,
    PmocPendingTaskOut,
    PmocPendingTasksOut,
    PmocPlanCreate,
    PmocCreateIn,
    PmocCreateValidationIssueOut,
    PmocPlanEquipmentOut,
    PmocPlanEquipmentsReplace,
    PmocPlanOut,
    PmocPlanUpdate,
    PmocPlanningScheduleCreate,
    PmocActivityServiceOut,
    PmocScheduledActivityCreate,
    PmocScheduledActivityOut,
    PmocScheduledActivityUpdate,
    ScheduleOut,
)
from app.routers.service_orders import (
    _check_technician_conflict,
    _check_technician_work_rules,
    _ensure_inside_workday,
    _tenant_tz,
)
from models import (
    Client,
    ClientSite,
    Equipment,
    PmocActivityFrequency,
    PmocAirQualityAnalysis,
    PmocExecution,
    PmocExecutionCompletion,
    PmocOccurrence,
    PmocOccurrenceStatus,
    PmocPlan,
    PmocPlanEquipment,
    PmocPlanStatus,
    PmocScheduledActivity,
    Schedule,
    ScheduleStatus,
    ScheduleTechnician,
    Service,
    Tenant,
    TenantHoliday,
    User,
    UserRole,
)

router = APIRouter(prefix="/pmoc", tags=["pmoc"])


def _get_plan(db: Session, tenant_id: int, pmoc_id: int) -> PmocPlan:
    plan = db.execute(select(PmocPlan).where(PmocPlan.id == pmoc_id, PmocPlan.tenant_id == tenant_id)).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PMOC não encontrado.")
    return plan


def _snapshot_from_plan(plan: PmocPlan) -> dict[str, Any]:
    if not plan.establishment_snapshot_json:
        return {}
    try:
        data = json.loads(plan.establishment_snapshot_json)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _establishment_name_from_plan(plan: PmocPlan) -> str | None:
    snap = _snapshot_from_plan(plan)
    site_name = snap.get("site_name")
    if isinstance(site_name, str) and site_name.strip():
        return site_name.strip()
    return None


def _plan_to_out(plan: PmocPlan, db: Session, *, include_client: bool = True) -> PmocPlanOut:
    extras = parse_extras(plan.extras_json)
    client_out = None
    establishment_name = _establishment_name_from_plan(plan)
    if establishment_name is None and plan.client_site_id is not None:
        site = db.get(ClientSite, plan.client_site_id)
        if site is not None:
            establishment_name = site.name
    if include_client:
        c = db.get(Client, plan.client_id)
        if c is not None:
            client_out = PmocClientSummaryOut.model_validate(c)
    return PmocPlanOut(
        id=plan.id,
        tenant_id=plan.tenant_id,
        client_id=plan.client_id,
        client_site_id=plan.client_site_id,
        establishment_name=establishment_name,
        status=plan.status.value,
        title=plan.title,
        version_label=plan.version_label,
        establishment_snapshot=_snapshot_from_plan(plan),
        law_reference_note=plan.law_reference_note,
        internal_notes=plan.internal_notes,
        extras=extras,
        total_btu_sum=plan.total_btu_sum,
        air_analysis_required=plan.air_analysis_required,
        next_air_analysis_due=plan.next_air_analysis_due,
        responsible_name=plan.responsible_name,
        responsible_council=plan.responsible_council,
        responsible_registration=plan.responsible_registration,
        art_number=plan.art_number,
        art_issued_at=plan.art_issued_at,
        art_file_url=plan.art_file_url,
        activated_at=plan.activated_at,
        deactivated_at=plan.deactivated_at,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        client=client_out,
    )


def _equipment_row_out(link: PmocPlanEquipment, eq: Equipment | None) -> PmocPlanEquipmentOut:
    return PmocPlanEquipmentOut(
        id=link.id,
        pmoc_id=link.pmoc_id,
        equipment_id=link.equipment_id,
        sort_order=link.sort_order,
        ficha_notes=link.ficha_notes,
        identificacao=eq.identificacao if eq else None,
        modelo=eq.modelo if eq else None,
        capacidade_btu=eq.capacidade_btu if eq else None,
        local_instalacao=eq.local_instalacao if eq else None,
        installation_reference=eq.installation_reference if eq else None,
    )


def _air_analysis_next_semester_due(analysis_date: date) -> date:
    """Próximo vencimento semestral (6 meses após a data da análise)."""
    month_index = analysis_date.month - 1 + 6
    year = analysis_date.year + month_index // 12
    month = month_index % 12 + 1
    import calendar

    last_day = calendar.monthrange(year, month)[1]
    day = min(analysis_date.day, last_day)
    return date(year, month, day)


@router.post(
    "/{pmoc_id}/analise-ar",
    response_model=PmocAirQualityAnalysisOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
async def upload_pmoc_analise_ar(
    pmoc_id: int,
    analise_date: Annotated[date, Form()],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> PmocAirQualityAnalysisOut:
    """Upload semestral de laudo PDF de qualidade do ar — S3 + histórico no plano PMOC."""
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    raw = await file.read()
    try:
        validate_pmoc_pdf_upload(file.filename, file.content_type, raw)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    next_due = _air_analysis_next_semester_due(analise_date)
    row = PmocAirQualityAnalysis(
        pmoc_id=plan.id,
        analysis_date=analise_date,
        lab_name=None,
        summary="Laudo semestral de qualidade do ar (upload PDF).",
        next_due_date=next_due,
        created_by_user_id=current_user.id,
    )
    db.add(row)
    db.flush()

    try:
        up = upload_pmoc_file(
            tenant_id=current_user.tenant_id,
            pmoc_id=plan.id,
            subfolder="analises",
            file_bytes=raw,
            source_filename=file.filename,
            source_content_type=file.content_type or "application/pdf",
            db=db,
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    row.file_s3_key = up.s3_key
    row.file_url = up.public_url
    plan.next_air_analysis_due = next_due
    db.commit()
    db.refresh(row)
    return PmocAirQualityAnalysisOut.model_validate(row)


@router.get("/plans", response_model=list[PmocPlanOut])
def list_pmoc_plans(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    client_id: Annotated[int | None, Query()] = None,
    q: Annotated[str | None, Query()] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[PmocPlanOut]:
    query = select(PmocPlan).where(PmocPlan.tenant_id == current_user.tenant_id)
    if status_filter:
        query = query.where(PmocPlan.status == status_filter)
    if client_id is not None:
        query = query.where(PmocPlan.client_id == client_id)
    if q and q.strip():
        term = f"%{q.strip()}%"
        client_ids = select(Client.id).where(Client.tenant_id == current_user.tenant_id, Client.name.ilike(term))
        query = query.where(
            or_(PmocPlan.title.ilike(term), PmocPlan.internal_notes.ilike(term), PmocPlan.client_id.in_(client_ids))
        )
    plans = db.execute(query.order_by(PmocPlan.id.desc()).offset(skip).limit(limit)).scalars().all()
    return [_plan_to_out(p, db) for p in plans]


@router.get("/plans/active-for-site", response_model=PmocActivePlanCheckOut)
def check_active_pmoc_for_site(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    client_id: Annotated[int, Query(ge=1)],
    client_site_id: Annotated[int, Query(ge=1)],
) -> PmocActivePlanCheckOut:
    get_client_site_for_client(
        db, site_id=client_site_id, client_id=client_id, tenant_id=current_user.tenant_id
    )
    active = db.execute(
        select(PmocPlan).where(
            PmocPlan.tenant_id == current_user.tenant_id,
            PmocPlan.client_id == client_id,
            PmocPlan.client_site_id == client_site_id,
            PmocPlan.status == PmocPlanStatus.ACTIVE,
        )
    ).scalar_one_or_none()
    if active is None:
        return PmocActivePlanCheckOut(has_active=False)
    return PmocActivePlanCheckOut(
        has_active=True,
        active_plan_id=active.id,
        active_plan_title=active.title,
    )


@router.post(
    "/plans",
    response_model=PmocPlanOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def create_pmoc_plan(
    payload: PmocPlanCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocPlanOut:
    client = db.execute(
        select(Client).where(Client.id == payload.client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")
    site = get_client_site_for_client(
        db, site_id=payload.client_site_id, client_id=client.id, tenant_id=current_user.tenant_id
    )
    snap = client_site_snapshot_dict(client, site)
    plan = PmocPlan(
        tenant_id=current_user.tenant_id,
        client_id=client.id,
        client_site_id=site.id,
        status=PmocPlanStatus.DRAFT,
        title=payload.title.strip(),
        establishment_snapshot_json=json.dumps(snap, ensure_ascii=False),
        law_reference_note=DEFAULT_LAW_NOTE,
        extras_json=json.dumps(extras_default(), ensure_ascii=False),
    )
    db.add(plan)
    db.flush()
    seed_default_activities(db, plan.id)
    refresh_pmoc_computed_fields(db, plan)
    db.commit()
    db.refresh(plan)
    return _plan_to_out(plan, db)


@router.post(
    "/create",
    response_model=PmocPlanOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def create_pmoc_full(
    payload: PmocCreateIn,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocPlanOut:
    """Cadastro completo: plano + equipamentos + cronograma customizado + dados RT/ART."""
    rt_name = payload.rt_data.responsible_name if payload.rt_data else None
    issues = build_pmoc_create_validation_issues(
        client_id=payload.client_id,
        client_site_id=payload.client_site_id,
        equipment_ids=payload.equipment_ids,
        responsible_name=rt_name,
    )
    if issues:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Corrija os campos obrigatórios antes de salvar o PMOC.",
                "errors": [PmocCreateValidationIssueOut.model_validate(i).model_dump() for i in issues],
            },
        )

    client = db.execute(
        select(Client).where(Client.id == payload.client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")
    site = get_client_site_for_client(
        db, site_id=payload.client_site_id, client_id=client.id, tenant_id=current_user.tenant_id
    )
    if site is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Obra/filial inválida para este cliente.")

    equipment_ids = list(dict.fromkeys(payload.equipment_ids))
    for eid in equipment_ids:
        eq = db.execute(
            select(Equipment).where(Equipment.id == eid, Equipment.client_id == client.id)
        ).scalar_one_or_none()
        if eq is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Equipamento {eid} não pertence a este cliente.",
            )
        if eq.client_site_id != site.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Equipamento {eid} não pertence à obra/unidade selecionada.",
            )

    snap = client_site_snapshot_dict(client, site)
    plan = PmocPlan(
        tenant_id=current_user.tenant_id,
        client_id=client.id,
        client_site_id=site.id,
        status=PmocPlanStatus.DRAFT,
        title=payload.title.strip(),
        establishment_snapshot_json=json.dumps(snap, ensure_ascii=False),
        law_reference_note=DEFAULT_LAW_NOTE,
        extras_json=json.dumps(extras_default(), ensure_ascii=False),
    )
    db.add(plan)
    db.flush()
    seed_default_activities(db, plan.id)

    for idx, eid in enumerate(equipment_ids):
        db.add(PmocPlanEquipment(pmoc_id=plan.id, equipment_id=eid, sort_order=idx))

    apply_pmoc_rt_fields(plan, payload.rt_data)

    if payload.activities:
        db.execute(delete(PmocScheduledActivity).where(PmocScheduledActivity.pmoc_id == plan.id))
        for idx, act_in in enumerate(payload.activities):
            service = db.execute(
                select(Service).where(Service.id == act_in.service_id, Service.tenant_id == current_user.tenant_id)
            ).scalar_one_or_none()
            if service is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Serviço {act_in.service_id} inválido ou inexistente.",
                )
            if act_in.equipment_id is not None:
                eq = db.execute(
                    select(Equipment).where(
                        Equipment.id == act_in.equipment_id,
                        Equipment.client_id == client.id,
                    )
                ).scalar_one_or_none()
                if eq is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Equipamento {act_in.equipment_id} inválido para atividade do cronograma.",
                    )
            title = (act_in.title or service.name or "").strip()
            if len(title) < 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Título da atividade deve ter ao menos 2 caracteres.",
                )
            db.add(
                PmocScheduledActivity(
                    pmoc_id=plan.id,
                    equipment_id=act_in.equipment_id,
                    service_id=act_in.service_id,
                    frequency=PmocActivityFrequency(act_in.frequency),
                    task_code=act_in.task_code,
                    title=title[:200],
                    description=act_in.description,
                    sort_order=idx,
                    is_system_seed=False,
                )
            )

    refresh_pmoc_computed_fields(db, plan)
    db.commit()
    db.refresh(plan)
    return _plan_to_out(plan, db)


@router.get("/plans/{pmoc_id}", response_model=PmocPlanOut)
def get_pmoc_plan(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocPlanOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    return _plan_to_out(plan, db)


@router.patch(
    "/plans/{pmoc_id}",
    response_model=PmocPlanOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def update_pmoc_plan(
    pmoc_id: int,
    payload: PmocPlanUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocPlanOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    if payload.title is not None:
        plan.title = payload.title.strip()
    if payload.version_label is not None:
        plan.version_label = payload.version_label.strip()[:40]
    if payload.law_reference_note is not None:
        plan.law_reference_note = payload.law_reference_note.strip() or None
    if payload.internal_notes is not None:
        plan.internal_notes = payload.internal_notes.strip() or None
    if payload.extras is not None:
        merged = extras_default()
        merged.update({k: str(v)[:8000] for k, v in payload.extras.items() if isinstance(v, str)})
        plan.extras_json = serialize_extras(merged)
    if payload.responsible_name is not None:
        plan.responsible_name = payload.responsible_name.strip() or None
    if payload.responsible_council is not None:
        plan.responsible_council = payload.responsible_council.strip()[:16] or None
    if payload.responsible_registration is not None:
        plan.responsible_registration = payload.responsible_registration.strip()[:80] or None
    if payload.art_number is not None:
        plan.art_number = payload.art_number.strip()[:120] or None
    if payload.art_issued_at is not None:
        plan.art_issued_at = payload.art_issued_at
    if payload.next_air_analysis_due is not None:
        plan.next_air_analysis_due = payload.next_air_analysis_due
    db.commit()
    db.refresh(plan)
    return _plan_to_out(plan, db)


@router.post(
    "/plans/{pmoc_id}/activate",
    response_model=PmocPlanOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def activate_pmoc_plan(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocPlanOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    rows = db.execute(select(func.count()).select_from(PmocPlanEquipment).where(PmocPlanEquipment.pmoc_id == plan.id)).scalar_one()
    if int(rows or 0) < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inclua ao menos um equipamento no PMOC antes de ativar.",
        )
    now = datetime.now(timezone.utc)
    deactivate_other_active_plans(
        db, current_user.tenant_id, plan.client_id, plan.id, client_site_id=plan.client_site_id
    )
    plan.status = PmocPlanStatus.ACTIVE
    plan.activated_at = now
    plan.deactivated_at = None
    refresh_pmoc_computed_fields(db, plan)
    db.commit()
    db.refresh(plan)
    return _plan_to_out(plan, db)


@router.post(
    "/plans/{pmoc_id}/deactivate",
    response_model=PmocPlanOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def deactivate_pmoc_plan(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocPlanOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    plan.status = PmocPlanStatus.INACTIVE
    plan.deactivated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(plan)
    return _plan_to_out(plan, db)


@router.post(
    "/plans/{pmoc_id}/archive",
    response_model=PmocPlanOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def archive_pmoc_plan(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocPlanOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    plan.status = PmocPlanStatus.ARCHIVED
    plan.deactivated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(plan)
    return _plan_to_out(plan, db)


@router.get("/plans/{pmoc_id}/equipments", response_model=list[PmocPlanEquipmentOut])
def list_pmoc_equipments(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[PmocPlanEquipmentOut]:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    rows = db.execute(
        select(PmocPlanEquipment, Equipment)
        .join(Equipment, Equipment.id == PmocPlanEquipment.equipment_id)
        .where(
            PmocPlanEquipment.pmoc_id == plan.id,
            Equipment.ativo.is_(True),
        )
        .order_by(PmocPlanEquipment.sort_order, PmocPlanEquipment.id)
    ).all()
    return [_equipment_row_out(link, eq) for link, eq in rows]


@router.put(
    "/plans/{pmoc_id}/equipments",
    response_model=list[PmocPlanEquipmentOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def replace_pmoc_equipments(
    pmoc_id: int,
    payload: PmocPlanEquipmentsReplace,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[PmocPlanEquipmentOut]:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    ids = list(dict.fromkeys(payload.equipment_ids))
    for eid in ids:
        eq = db.execute(
            select(Equipment).where(Equipment.id == eid, Equipment.client_id == plan.client_id)
        ).scalar_one_or_none()
        if eq is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Equipamento {eid} não pertence a este cliente.")
        assert_equipment_active_for_operations(eq)
        if plan.client_site_id is not None and eq.client_site_id != plan.client_site_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Equipamento {eid} não pertence à obra/unidade deste PMOC.",
            )
    db.execute(delete(PmocPlanEquipment).where(PmocPlanEquipment.pmoc_id == plan.id))
    for idx, eid in enumerate(ids):
        db.add(PmocPlanEquipment(pmoc_id=plan.id, equipment_id=eid, sort_order=idx))
    refresh_pmoc_computed_fields(db, plan)
    db.commit()
    return list_pmoc_equipments(pmoc_id, db, current_user)


def _get_service_for_tenant(db: Session, tenant_id: int, service_id: int) -> Service:
    svc = db.execute(
        select(Service).where(Service.id == service_id, Service.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if svc is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Serviço inválido ou inexistente.")
    return svc


def _activity_to_out(act: PmocScheduledActivity, service: Service | None = None) -> PmocScheduledActivityOut:
    svc_out = None
    if service is not None:
        svc_out = PmocActivityServiceOut(
            id=service.id,
            name=service.name,
            duration_minutes=int(service.duration_minutes or 0),
        )
    return PmocScheduledActivityOut(
        id=act.id,
        pmoc_id=act.pmoc_id,
        equipment_id=act.equipment_id,
        service_id=act.service_id,
        service=svc_out,
        frequency=act.frequency.value,
        task_code=act.task_code,
        title=act.title,
        description=act.description,
        sort_order=act.sort_order,
        is_system_seed=act.is_system_seed,
    )


def _activities_to_out(db: Session, tenant_id: int, acts: list[PmocScheduledActivity]) -> list[PmocScheduledActivityOut]:
    service_ids = {a.service_id for a in acts if a.service_id}
    services: dict[int, Service] = {}
    if service_ids:
        rows = db.execute(
            select(Service).where(Service.tenant_id == tenant_id, Service.id.in_(service_ids))
        ).scalars().all()
        services = {s.id: s for s in rows}
    return [_activity_to_out(a, services.get(a.service_id) if a.service_id else None) for a in acts]


@router.get("/plans/{pmoc_id}/estimated-time", response_model=PmocEstimatedTimeOut)
def pmoc_estimated_time(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    equipment_ids: Annotated[str | None, Query(description="IDs de equipamentos separados por vírgula")] = None,
) -> PmocEstimatedTimeOut:
    _get_plan(db, current_user.tenant_id, pmoc_id)
    today = date.today()
    y = year if year is not None else today.year
    m = month if month is not None else today.month
    parsed_equipment_ids: list[int] | None = None
    if equipment_ids:
        parsed: list[int] = []
        for part in equipment_ids.split(","):
            part = part.strip()
            if not part:
                continue
            try:
                parsed.append(int(part))
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="equipment_ids inválido.",
                ) from exc
        parsed_equipment_ids = parsed
    result = compute_pmoc_estimated_time(
        db,
        pmoc_id=pmoc_id,
        tenant_id=current_user.tenant_id,
        year=y,
        month=m,
        equipment_ids=parsed_equipment_ids,
    )
    return PmocEstimatedTimeOut(
        total_minutes=result.total_minutes,
        equipment_count=result.equipment_count,
        activities_in_period=result.activities_in_period,
        period_year=result.period_year,
        period_month=result.period_month,
        breakdown=[
            PmocEstimatedTimeLineOut(
                activity_id=line.activity_id,
                title=line.title,
                service_name=line.service_name,
                minutes_per_unit=line.minutes_per_unit,
                occurrences=line.occurrences,
                total_minutes=line.total_minutes,
            )
            for line in result.breakdown
        ],
    )


@router.get("/plans/{pmoc_id}/pending-tasks", response_model=PmocPendingTasksOut)
def pmoc_pending_tasks(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
) -> PmocPendingTasksOut:
    _get_plan(db, current_user.tenant_id, pmoc_id)
    result = compute_pmoc_pending_tasks(
        db,
        pmoc_id=pmoc_id,
        tenant_id=current_user.tenant_id,
        year=year,
        month=month,
    )
    return PmocPendingTasksOut(
        period_year=result.period_year,
        period_month=result.period_month,
        total_pending=len(result.tasks),
        tasks=[
            PmocPendingTaskOut(
                equipment_id=task.equipment_id,
                equipment_label=task.equipment_label,
                activity_id=task.activity_id,
                activity_title=task.activity_title,
                service_id=task.service_id,
                service_name=task.service_name,
                status="pending",
            )
            for task in result.tasks
        ],
    )


def _schedule_out_from_row(row: Schedule, client: Client | None) -> ScheduleOut:
    client_name = client.name if client is not None else None
    client_phone = client.phone if client is not None else None
    client_whatsapp = client.whatsapp if client is not None else None
    if client is not None:
        parts = [client.address_street, client.address_number, client.address_district, client.address_city]
        client_address = ", ".join([str(p).strip() for p in parts if p and str(p).strip()])
    else:
        client_address = None
    return ScheduleOut.model_validate(
        {
            "id": row.id,
            "tenant_id": row.tenant_id,
            "client_id": row.client_id,
            "client_name": client_name,
            "client_phone": client_phone,
            "client_whatsapp": client_whatsapp,
            "client_address": client_address,
            "service_order_id": row.service_order_id,
            "starts_at": row.starts_at,
            "ends_at": row.ends_at,
            "status": row.status.value if hasattr(row.status, "value") else str(row.status),
            "notes": row.notes,
        }
    )


@router.post(
    "/plans/{pmoc_id}/planning-schedule",
    response_model=ScheduleOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def create_pmoc_planning_schedule(
    pmoc_id: int,
    payload: PmocPlanningScheduleCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ScheduleOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    if not payload.row_keys:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selecione ao menos uma atividade.")

    extras = parse_extras(plan.extras_json)
    already_scheduled = parse_planning_scheduled_rows(extras)
    overlap = already_scheduled.intersection({key.strip() for key in payload.row_keys if key.strip()})
    if overlap:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Uma ou mais atividades selecionadas já foram agendadas.",
        )

    technician = db.execute(
        select(User).where(
            User.id == payload.technician_id,
            User.tenant_id == current_user.tenant_id,
            User.role == UserRole.TECHNICIAN,
            User.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if technician is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Técnico não encontrado.")

    tenant = db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id)).scalar_one()
    tenant_tz = _tenant_tz(tenant)
    holidays = set(
        db.execute(select(TenantHoliday.holiday_date).where(TenantHoliday.tenant_id == current_user.tenant_id)).scalars().all()
    )
    starts_at = payload.starts_at if payload.starts_at.tzinfo else payload.starts_at.replace(tzinfo=timezone.utc)
    ends_at = starts_at + timedelta(minutes=payload.duration_minutes)
    _ensure_inside_workday(starts_at, ends_at, tenant=tenant, holidays=holidays)
    _check_technician_conflict(
        db=db,
        tenant_id=current_user.tenant_id,
        technician_id=payload.technician_id,
        starts_at=starts_at,
        ends_at=ends_at,
    )
    _check_technician_work_rules(
        db=db,
        tenant_id=current_user.tenant_id,
        technician_id=payload.technician_id,
        starts_at=starts_at,
        ends_at=ends_at,
        tenant_tz=tenant_tz,
    )

    period_label = f"{payload.period_month:02d}/{payload.period_year}"
    hours = payload.duration_minutes // 60
    mins = payload.duration_minutes % 60
    if hours and mins:
        duration_label = f"{hours}h {mins}min"
    elif hours:
        duration_label = f"{hours}h"
    else:
        duration_label = f"{mins}min"
    notes = f"[PMOC] {plan.title} — {period_label} — {payload.activity_count} atividade(s) — {duration_label}"
    schedule = Schedule(
        tenant_id=current_user.tenant_id,
        client_id=plan.client_id,
        service_order_id=None,
        starts_at=starts_at,
        ends_at=ends_at,
        status=ScheduleStatus.CONFIRMED,
        notes=notes,
    )
    db.add(schedule)
    db.flush()
    db.add(ScheduleTechnician(schedule_id=schedule.id, technician_id=payload.technician_id))

    plan.extras_json = serialize_extras(merge_planning_scheduled_rows(extras, payload.row_keys))
    db.commit()
    db.refresh(schedule)
    client = db.get(Client, plan.client_id)
    return _schedule_out_from_row(schedule, client)


def _occurrence_to_out(row: PmocOccurrence, db: Session) -> PmocOccurrenceOut:
    equipment_label = None
    if row.equipment_id is not None:
        eq = db.get(Equipment, row.equipment_id)
        equipment_label = eq.identificacao if eq else f"Equipamento #{row.equipment_id}"
    client_name = None
    plan = row.pmoc if row.pmoc is not None else db.get(PmocPlan, row.pmoc_id)
    if plan is not None:
        client = db.get(Client, plan.client_id)
        client_name = client.name if client else None
    return PmocOccurrenceOut(
        id=row.id,
        pmoc_id=row.pmoc_id,
        equipment_id=row.equipment_id,
        service_order_id=row.service_order_id,
        checklist_item_id=row.checklist_item_id,
        checklist_item_descricao=row.checklist_item_descricao,
        failure_description=row.failure_description,
        status=row.status.value,
        created_by_user_id=row.created_by_user_id,
        resolved_at=row.resolved_at,
        created_at=row.created_at,
        equipment_label=equipment_label,
        client_name=client_name,
    )


@router.get("/plans/{pmoc_id}/compliance-summary", response_model=PmocComplianceSummaryOut)
def pmoc_compliance_summary(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocComplianceSummaryOut:
    _get_plan(db, current_user.tenant_id, pmoc_id)
    open_count = db.execute(
        select(func.count())
        .select_from(PmocOccurrence)
        .where(
            PmocOccurrence.pmoc_id == pmoc_id,
            PmocOccurrence.tenant_id == current_user.tenant_id,
            PmocOccurrence.status == PmocOccurrenceStatus.OPEN,
        )
    ).scalar_one()
    result = compute_pmoc_compliance_summary(
        db,
        pmoc_id=pmoc_id,
        tenant_id=current_user.tenant_id,
        open_occurrences=int(open_count or 0),
    )
    return PmocComplianceSummaryOut(
        pmoc_id=result.pmoc_id,
        overall_status=result.overall_status,
        monthly_execution_pct=result.monthly_execution_pct,
        open_occurrences=result.open_occurrences,
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
    )


@router.get("/plans/{pmoc_id}/occurrences", response_model=list[PmocOccurrenceOut])
def list_pmoc_occurrences(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> list[PmocOccurrenceOut]:
    _get_plan(db, current_user.tenant_id, pmoc_id)
    query = select(PmocOccurrence).where(
        PmocOccurrence.pmoc_id == pmoc_id,
        PmocOccurrence.tenant_id == current_user.tenant_id,
    )
    if status_filter in ("open", "resolved"):
        query = query.where(PmocOccurrence.status == PmocOccurrenceStatus(status_filter))
    rows = db.execute(query.order_by(PmocOccurrence.created_at.desc()).limit(200)).scalars().all()
    return [_occurrence_to_out(row, db) for row in rows]


@router.post(
    "/plans/{pmoc_id}/occurrences",
    response_model=PmocOccurrenceOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def create_pmoc_occurrence(
    pmoc_id: int,
    payload: PmocOccurrenceCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocOccurrenceOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    if payload.equipment_id is not None:
        eq = db.execute(
            select(Equipment).where(
                Equipment.id == payload.equipment_id,
                Equipment.client_id == plan.client_id,
            )
        ).scalar_one_or_none()
        if eq is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Equipamento inválido.")
    row = PmocOccurrence(
        tenant_id=current_user.tenant_id,
        pmoc_id=plan.id,
        equipment_id=payload.equipment_id,
        service_order_id=payload.service_order_id,
        checklist_item_id=payload.checklist_item_id,
        checklist_item_descricao=payload.checklist_item_descricao.strip(),
        failure_description=payload.failure_description.strip(),
        status=PmocOccurrenceStatus.OPEN,
        created_by_user_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _occurrence_to_out(row, db)


@router.get("/occurrence-alerts", response_model=list[PmocOccurrenceAlertOut])
def list_pmoc_occurrence_alerts(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[PmocOccurrenceAlertOut]:
    rows = db.execute(
        select(PmocOccurrence, PmocPlan, Client, Equipment)
        .join(PmocPlan, PmocPlan.id == PmocOccurrence.pmoc_id)
        .join(Client, Client.id == PmocPlan.client_id)
        .outerjoin(Equipment, Equipment.id == PmocOccurrence.equipment_id)
        .where(
            PmocOccurrence.tenant_id == current_user.tenant_id,
            PmocOccurrence.status == PmocOccurrenceStatus.OPEN,
        )
        .order_by(PmocOccurrence.created_at.desc())
        .limit(limit)
    ).all()
    alerts: list[PmocOccurrenceAlertOut] = []
    for occ, plan, client, eq in rows:
        alerts.append(
            PmocOccurrenceAlertOut(
                id=occ.id,
                pmoc_id=occ.pmoc_id,
                pmoc_title=plan.title,
                client_name=client.name,
                equipment_label=eq.identificacao if eq else None,
                checklist_item_descricao=occ.checklist_item_descricao,
                failure_description=occ.failure_description,
                created_at=occ.created_at,
            )
        )
    return alerts


@router.get("/plans/{pmoc_id}/activities", response_model=list[PmocScheduledActivityOut])
def list_pmoc_activities(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[PmocScheduledActivityOut]:
    _get_plan(db, current_user.tenant_id, pmoc_id)
    acts = db.execute(
        select(PmocScheduledActivity)
        .outerjoin(Equipment, Equipment.id == PmocScheduledActivity.equipment_id)
        .where(
            PmocScheduledActivity.pmoc_id == pmoc_id,
            (PmocScheduledActivity.equipment_id.is_(None)) | (Equipment.ativo.is_(True)),
        )
        .order_by(PmocScheduledActivity.sort_order, PmocScheduledActivity.id)
    ).scalars().all()
    return _activities_to_out(db, current_user.tenant_id, list(acts))


@router.post(
    "/plans/{pmoc_id}/activities",
    response_model=PmocScheduledActivityOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def create_pmoc_activity(
    pmoc_id: int,
    payload: PmocScheduledActivityCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocScheduledActivityOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    if payload.equipment_id is not None:
        eq = db.execute(
            select(Equipment).where(
                Equipment.id == payload.equipment_id,
                Equipment.client_id == plan.client_id,
            )
        ).scalar_one_or_none()
        if eq is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Equipamento inválido para este PMOC.")
        assert_equipment_active_for_operations(eq)
    service: Service | None = None
    if payload.service_id is not None:
        service = _get_service_for_tenant(db, current_user.tenant_id, payload.service_id)
    act = PmocScheduledActivity(
        pmoc_id=plan.id,
        equipment_id=payload.equipment_id,
        service_id=payload.service_id,
        frequency=PmocActivityFrequency(payload.frequency),
        task_code=payload.task_code,
        title=payload.title.strip(),
        description=payload.description,
        sort_order=payload.sort_order,
        is_system_seed=False,
    )
    db.add(act)
    db.commit()
    db.refresh(act)
    return _activity_to_out(act, service)


@router.patch(
    "/plans/{pmoc_id}/activities/{activity_id}",
    response_model=PmocScheduledActivityOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def update_pmoc_activity(
    pmoc_id: int,
    activity_id: int,
    payload: PmocScheduledActivityUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocScheduledActivityOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    act = db.execute(
        select(PmocScheduledActivity).where(
            PmocScheduledActivity.id == activity_id,
            PmocScheduledActivity.pmoc_id == plan.id,
        )
    ).scalar_one_or_none()
    if act is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atividade não encontrada.")
    if "equipment_id" in payload.model_fields_set:
        eid = payload.equipment_id
        if eid is None:
            act.equipment_id = None
        else:
            eq = db.execute(
                select(Equipment).where(Equipment.id == eid, Equipment.client_id == plan.client_id)
            ).scalar_one_or_none()
            if eq is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Equipamento inválido.")
            assert_equipment_active_for_operations(eq)
            act.equipment_id = eid
    if "frequency" in payload.model_fields_set and payload.frequency is not None:
        act.frequency = PmocActivityFrequency(payload.frequency)
    if "task_code" in payload.model_fields_set:
        act.task_code = (payload.task_code.strip()[:40] if payload.task_code else None)
    if "title" in payload.model_fields_set and payload.title is not None:
        act.title = payload.title.strip()
    if "description" in payload.model_fields_set:
        act.description = payload.description.strip() if payload.description else None
    if "sort_order" in payload.model_fields_set and payload.sort_order is not None:
        act.sort_order = payload.sort_order
    service: Service | None = None
    if "service_id" in payload.model_fields_set:
        if payload.service_id is None:
            act.service_id = None
        else:
            service = _get_service_for_tenant(db, current_user.tenant_id, payload.service_id)
            act.service_id = payload.service_id
    db.commit()
    db.refresh(act)
    if service is None and act.service_id is not None:
        service = _get_service_for_tenant(db, current_user.tenant_id, act.service_id)
    return _activity_to_out(act, service)


@router.delete(
    "/plans/{pmoc_id}/activities/{activity_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def delete_pmoc_activity(
    pmoc_id: int,
    activity_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    act = db.execute(
        select(PmocScheduledActivity).where(
            PmocScheduledActivity.id == activity_id,
            PmocScheduledActivity.pmoc_id == plan.id,
        )
    ).scalar_one_or_none()
    if act is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atividade não encontrada.")
    db.delete(act)
    db.commit()


@router.post(
    "/execucao/{pmoc_id}",
    response_model=PmocFieldInspectionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def submit_pmoc_field_inspection(
    pmoc_id: int,
    payload: PmocFieldInspectionCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocFieldInspectionOut:
    if payload.pmocId != pmoc_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="pmocId inconsistente com a rota.")
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    if payload.equipmentId is not None:
        eq = db.execute(
            select(Equipment).where(Equipment.id == payload.equipmentId, Equipment.client_id == plan.client_id)
        ).scalar_one_or_none()
        if eq is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Equipamento inválido para este PMOC.")
    has_not_ok = any(item.status == "not_ok" for item in payload.checklist)
    completion = PmocExecutionCompletion.PARTIAL if has_not_ok else PmocExecutionCompletion.DONE
    notes_payload: dict[str, Any] = {
        "type": "field_inspection",
        "generalNotes": payload.generalNotes.strip(),
        "checklist": [item.model_dump() for item in payload.checklist],
        "signatureBase64": payload.signatureBase64,
    }
    row = PmocExecution(
        pmoc_id=plan.id,
        equipment_id=payload.equipmentId,
        executed_at=datetime.now(timezone.utc),
        completion_status=completion,
        notes=json.dumps(notes_payload, ensure_ascii=False),
        performed_by_user_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return PmocFieldInspectionOut(
        id=row.id,
        pmoc_id=row.pmoc_id,
        equipment_id=row.equipment_id,
        completion_status=row.completion_status.value,
        created_at=row.created_at,
    )


@router.get("/plans/{pmoc_id}/executions", response_model=list[PmocExecutionOut])
def list_pmoc_executions(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=300)] = 100,
) -> list[PmocExecutionOut]:
    _get_plan(db, current_user.tenant_id, pmoc_id)
    rows = db.execute(
        select(PmocExecution).where(PmocExecution.pmoc_id == pmoc_id).order_by(PmocExecution.executed_at.desc()).limit(limit)
    ).scalars().all()
    return [
        PmocExecutionOut(
            id=r.id,
            pmoc_id=r.pmoc_id,
            scheduled_activity_id=r.scheduled_activity_id,
            equipment_id=r.equipment_id,
            executed_at=r.executed_at,
            completion_status=r.completion_status.value,
            notes=r.notes,
            performed_by_user_id=r.performed_by_user_id,
            service_order_id=r.service_order_id,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post(
    "/plans/{pmoc_id}/executions",
    response_model=PmocExecutionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def create_pmoc_execution(
    pmoc_id: int,
    payload: PmocExecutionCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocExecutionOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    when = payload.executed_at or datetime.now(timezone.utc)
    if payload.equipment_id is not None:
        eq = db.execute(
            select(Equipment).where(Equipment.id == payload.equipment_id, Equipment.client_id == plan.client_id)
        ).scalar_one_or_none()
        if eq is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Equipamento inválido.")
    if payload.scheduled_activity_id is not None:
        sa = db.execute(
            select(PmocScheduledActivity).where(
                PmocScheduledActivity.id == payload.scheduled_activity_id,
                PmocScheduledActivity.pmoc_id == plan.id,
            )
        ).scalar_one_or_none()
        if sa is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Atividade planejada não encontrada.")
    row = PmocExecution(
        pmoc_id=plan.id,
        scheduled_activity_id=payload.scheduled_activity_id,
        equipment_id=payload.equipment_id,
        executed_at=when,
        completion_status=PmocExecutionCompletion(payload.completion_status),
        notes=payload.notes,
        performed_by_user_id=current_user.id,
        service_order_id=payload.service_order_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return PmocExecutionOut(
        id=row.id,
        pmoc_id=row.pmoc_id,
        scheduled_activity_id=row.scheduled_activity_id,
        equipment_id=row.equipment_id,
        executed_at=row.executed_at,
        completion_status=row.completion_status.value,
        notes=row.notes,
        performed_by_user_id=row.performed_by_user_id,
        service_order_id=row.service_order_id,
        created_at=row.created_at,
    )


@router.get("/plans/{pmoc_id}/air-analyses", response_model=list[PmocAirQualityAnalysisOut])
def list_air_analyses(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[PmocAirQualityAnalysisOut]:
    _get_plan(db, current_user.tenant_id, pmoc_id)
    rows = db.execute(
        select(PmocAirQualityAnalysis)
        .where(PmocAirQualityAnalysis.pmoc_id == pmoc_id)
        .order_by(PmocAirQualityAnalysis.analysis_date.desc())
    ).scalars().all()
    return [PmocAirQualityAnalysisOut.model_validate(r) for r in rows]


@router.post(
    "/plans/{pmoc_id}/air-analyses",
    response_model=PmocAirQualityAnalysisOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def create_air_analysis(
    pmoc_id: int,
    payload: PmocAirQualityAnalysisCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocAirQualityAnalysisOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    row = PmocAirQualityAnalysis(
        pmoc_id=plan.id,
        analysis_date=payload.analysis_date,
        lab_name=payload.lab_name,
        summary=payload.summary,
        next_due_date=payload.next_due_date,
        created_by_user_id=current_user.id,
    )
    db.add(row)
    if payload.next_due_date:
        plan.next_air_analysis_due = payload.next_due_date
    db.commit()
    db.refresh(row)
    return PmocAirQualityAnalysisOut.model_validate(row)


@router.post(
    "/plans/{pmoc_id}/air-analyses/{analysis_id}/file",
    response_model=PmocAirQualityAnalysisOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
async def upload_air_analysis_file(
    pmoc_id: int,
    analysis_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> PmocAirQualityAnalysisOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    row = db.execute(
        select(PmocAirQualityAnalysis).where(
            PmocAirQualityAnalysis.id == analysis_id,
            PmocAirQualityAnalysis.pmoc_id == plan.id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro não encontrado.")
    raw = await file.read()
    try:
        validate_pmoc_pdf_upload(file.filename, file.content_type, raw)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    try:
        up = upload_pmoc_file(
            tenant_id=current_user.tenant_id,
            pmoc_id=plan.id,
            subfolder=f"analises/{analysis_id}",
            file_bytes=raw,
            source_filename=file.filename,
            source_content_type=file.content_type,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    delete_pmoc_file_if_exists(row.file_s3_key, db)
    row.file_s3_key = up.s3_key
    row.file_url = up.public_url
    db.commit()
    db.refresh(row)
    return PmocAirQualityAnalysisOut.model_validate(row)


async def _persist_pmoc_art_upload(
    plan: PmocPlan,
    *,
    tenant_id: int,
    file: UploadFile,
    db: Session,
) -> None:
    raw = await file.read()
    try:
        validate_pmoc_pdf_upload(file.filename, file.content_type, raw)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    try:
        up = upload_pmoc_file(
            tenant_id=tenant_id,
            pmoc_id=plan.id,
            subfolder="art",
            file_bytes=raw,
            source_filename=file.filename,
            source_content_type=file.content_type or "application/pdf",
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    delete_pmoc_file_if_exists(plan.art_file_s3_key, db)
    plan.art_file_s3_key = up.s3_key
    plan.art_file_url = up.public_url


@router.post(
    "/{pmoc_id}/upload-art",
    response_model=PmocPlanOut,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
async def upload_pmoc_art_by_id(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> PmocPlanOut:
    """Upload do PDF da ART — S3 em pmoc/{id}/art/."""
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    await _persist_pmoc_art_upload(plan, tenant_id=current_user.tenant_id, file=file, db=db)
    db.commit()
    db.refresh(plan)
    return _plan_to_out(plan, db)


@router.post(
    "/plans/{pmoc_id}/art",
    response_model=PmocPlanOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
async def upload_pmoc_art(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> PmocPlanOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    await _persist_pmoc_art_upload(plan, tenant_id=current_user.tenant_id, file=file, db=db)
    db.commit()
    db.refresh(plan)
    return _plan_to_out(plan, db)


@router.delete(
    "/plans/{pmoc_id}/art",
    response_model=PmocPlanOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def delete_pmoc_art(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PmocPlanOut:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    delete_pmoc_file_if_exists(plan.art_file_s3_key, db)
    plan.art_file_s3_key = None
    plan.art_file_url = None
    db.commit()
    db.refresh(plan)
    return _plan_to_out(plan, db)


@router.get(
    "/plans/{pmoc_id}/report",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def pmoc_report_pdf(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Response:
    plan = _get_plan(db, current_user.tenant_id, pmoc_id)
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    client = db.get(Client, plan.client_id)
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")

    refresh_pmoc_computed_fields(db, plan)
    db.flush()

    eq_links = db.execute(
        select(PmocPlanEquipment)
        .where(PmocPlanEquipment.pmoc_id == plan.id)
        .order_by(PmocPlanEquipment.sort_order.asc())
    ).scalars().all()
    equipments: list[tuple[PmocPlanEquipment, Equipment | None]] = []
    for link in eq_links:
        eq = db.get(Equipment, link.equipment_id)
        equipments.append((link, eq))

    activities = db.execute(
        select(PmocScheduledActivity)
        .where(PmocScheduledActivity.pmoc_id == plan.id)
        .order_by(PmocScheduledActivity.sort_order.asc())
    ).scalars().all()

    executions = db.execute(
        select(PmocExecution)
        .where(PmocExecution.pmoc_id == plan.id)
        .order_by(PmocExecution.executed_at.desc())
    ).scalars().all()

    logo_url: str | None = getattr(tenant, "logo_url", None)
    logo_s3_key = getattr(tenant, "logo_s3_key", None)
    if logo_s3_key:
        try:
            logo_url = generate_tenant_logo_presigned_url(logo_s3_key, db=db, expires_seconds=600)
        except Exception:
            logo_url = logo_url

    pdf_bytes = build_pmoc_report_pdf(
        plan,
        tenant,
        client,
        equipments,
        activities,
        executions,
        logo_url=logo_url,
    )
    safe_title = re.sub(r"[^a-zA-Z0-9_-]+", "_", plan.title)[:60]
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="PMOC-{plan.id}-{safe_title}.pdf"'},
    )
