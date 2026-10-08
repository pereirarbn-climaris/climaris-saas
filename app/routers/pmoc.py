"""API do PMOC (Lei Federal nº 13.589/2018) — plano por estabelecimento, fichas por equipamento."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.pmoc_service import (
    DEFAULT_LAW_NOTE,
    client_snapshot_dict,
    deactivate_other_active_plans,
    extras_default,
    parse_extras,
    refresh_pmoc_computed_fields,
    seed_default_activities,
    serialize_extras,
)
from app.pmoc_storage import delete_pmoc_file_if_exists, upload_pmoc_file
from app.schemas import (
    PmocAirQualityAnalysisCreate,
    PmocAirQualityAnalysisOut,
    PmocClientSummaryOut,
    PmocExecutionCreate,
    PmocExecutionOut,
    PmocPlanCreate,
    PmocPlanEquipmentOut,
    PmocPlanEquipmentsReplace,
    PmocPlanOut,
    PmocPlanUpdate,
    PmocScheduledActivityCreate,
    PmocScheduledActivityOut,
    PmocScheduledActivityUpdate,
)
from models import (
    Client,
    Equipment,
    PmocActivityFrequency,
    PmocAirQualityAnalysis,
    PmocExecution,
    PmocExecutionCompletion,
    PmocPlan,
    PmocPlanEquipment,
    PmocPlanStatus,
    PmocScheduledActivity,
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


def _plan_to_out(plan: PmocPlan, db: Session, *, include_client: bool = True) -> PmocPlanOut:
    extras = parse_extras(plan.extras_json)
    client_out = None
    if include_client:
        c = db.get(Client, plan.client_id)
        if c is not None:
            client_out = PmocClientSummaryOut.model_validate(c)
    return PmocPlanOut(
        id=plan.id,
        tenant_id=plan.tenant_id,
        client_id=plan.client_id,
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
    )


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
    snap = client_snapshot_dict(client)
    plan = PmocPlan(
        tenant_id=current_user.tenant_id,
        client_id=client.id,
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
    deactivate_other_active_plans(db, current_user.tenant_id, plan.client_id, plan.id)
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
        .where(PmocPlanEquipment.pmoc_id == plan.id)
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
    db.execute(delete(PmocPlanEquipment).where(PmocPlanEquipment.pmoc_id == plan.id))
    for idx, eid in enumerate(ids):
        db.add(PmocPlanEquipment(pmoc_id=plan.id, equipment_id=eid, sort_order=idx))
    refresh_pmoc_computed_fields(db, plan)
    db.commit()
    return list_pmoc_equipments(pmoc_id, db, current_user)


@router.get("/plans/{pmoc_id}/activities", response_model=list[PmocScheduledActivityOut])
def list_pmoc_activities(
    pmoc_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[PmocScheduledActivityOut]:
    _get_plan(db, current_user.tenant_id, pmoc_id)
    acts = db.execute(
        select(PmocScheduledActivity)
        .where(PmocScheduledActivity.pmoc_id == pmoc_id)
        .order_by(PmocScheduledActivity.sort_order, PmocScheduledActivity.id)
    ).scalars().all()
    return [
        PmocScheduledActivityOut(
            id=a.id,
            pmoc_id=a.pmoc_id,
            equipment_id=a.equipment_id,
            frequency=a.frequency.value,
            task_code=a.task_code,
            title=a.title,
            description=a.description,
            sort_order=a.sort_order,
            is_system_seed=a.is_system_seed,
        )
        for a in acts
    ]


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
    act = PmocScheduledActivity(
        pmoc_id=plan.id,
        equipment_id=payload.equipment_id,
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
    return PmocScheduledActivityOut(
        id=act.id,
        pmoc_id=act.pmoc_id,
        equipment_id=act.equipment_id,
        frequency=act.frequency.value,
        task_code=act.task_code,
        title=act.title,
        description=act.description,
        sort_order=act.sort_order,
        is_system_seed=act.is_system_seed,
    )


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
    db.commit()
    db.refresh(act)
    return PmocScheduledActivityOut(
        id=act.id,
        pmoc_id=act.pmoc_id,
        equipment_id=act.equipment_id,
        frequency=act.frequency.value,
        task_code=act.task_code,
        title=act.title,
        description=act.description,
        sort_order=act.sort_order,
        is_system_seed=act.is_system_seed,
    )


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
        up = upload_pmoc_file(
            tenant_id=current_user.tenant_id,
            pmoc_id=plan.id,
            subfolder=f"air-analysis/{analysis_id}",
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
    raw = await file.read()
    try:
        up = upload_pmoc_file(
            tenant_id=current_user.tenant_id,
            pmoc_id=plan.id,
            subfolder="art",
            file_bytes=raw,
            source_filename=file.filename,
            source_content_type=file.content_type,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    delete_pmoc_file_if_exists(plan.art_file_s3_key, db)
    plan.art_file_s3_key = up.s3_key
    plan.art_file_url = up.public_url
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
