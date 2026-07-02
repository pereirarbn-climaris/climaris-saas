"""Central de projetos de implantação — operação Climaris."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import require_platform_operator
from app.schemas_platform_projects import (
    PlatformProjectCreateIn,
    PlatformProjectOut,
    PlatformProjectPatchIn,
    PlatformProjectTaskCreateIn,
    PlatformProjectTaskOut,
    PlatformProjectTaskPatchIn,
)
from models import (
    DemoAppointment,
    PlatformProject,
    PlatformProjectPriority,
    PlatformProjectStatus,
    PlatformProjectTask,
    PlatformProjectTaskStatus,
    User,
)

router = APIRouter(prefix="/platform/projects", tags=["platform-projects"])

DEFAULT_ONBOARDING_TASKS = (
    "Kick-off comercial e levantamento de processos",
    "Configuração inicial do workspace",
    "Importação de clientes e equipamentos",
    "Treinamento da equipe administrativa",
    "Treinamento dos técnicos em campo",
    "Go-live e acompanhamento pós-implantação",
)


def _recalc_progress(project: PlatformProject) -> None:
    tasks = project.tasks or []
    if not tasks:
        return
    done = sum(1 for t in tasks if t.status == PlatformProjectTaskStatus.DONE.value)
    project.progress_percent = round((done / len(tasks)) * 100)


def _load_project(db: Session, project_id: int) -> PlatformProject | None:
    return db.scalar(
        select(PlatformProject)
        .where(PlatformProject.id == project_id)
        .options(selectinload(PlatformProject.tasks))
    )


@router.get("", response_model=list[PlatformProjectOut])
def list_platform_projects(
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_db)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[PlatformProject]:
    stmt = (
        select(PlatformProject)
        .options(selectinload(PlatformProject.tasks))
        .order_by(PlatformProject.updated_at.desc())
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(PlatformProject.status == status_filter.strip().lower())
    return list(db.scalars(stmt).all())


@router.post("", response_model=PlatformProjectOut, status_code=status.HTTP_201_CREATED)
def create_platform_project(
    payload: PlatformProjectCreateIn,
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_db)],
) -> PlatformProject:
    status_val = payload.status.strip().lower()
    priority_val = payload.priority.strip().lower()
    if status_val not in {s.value for s in PlatformProjectStatus}:
        raise HTTPException(status_code=422, detail="Status de projeto inválido.")
    if priority_val not in {p.value for p in PlatformProjectPriority}:
        raise HTTPException(status_code=422, detail="Prioridade inválida.")

    if payload.demo_appointment_id:
        demo = db.get(DemoAppointment, payload.demo_appointment_id)
        if not demo:
            raise HTTPException(status_code=404, detail="Demonstração não encontrada.")

    project = PlatformProject(
        title=payload.title.strip(),
        company_name=payload.company_name.strip(),
        contact_name=payload.contact_name,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        tenant_id=payload.tenant_id,
        demo_appointment_id=payload.demo_appointment_id,
        status=status_val,
        priority=priority_val,
        delivery_deadline=payload.delivery_deadline,
        description=payload.description,
        notes=payload.notes,
    )
    db.add(project)
    db.flush()

    task_titles: list[str] = []
    if payload.initial_tasks:
        task_titles = [t.strip() for t in payload.initial_tasks if t and t.strip()]
    elif payload.use_default_checklist:
        task_titles = list(DEFAULT_ONBOARDING_TASKS)

    for idx, title in enumerate(task_titles):
        db.add(
            PlatformProjectTask(
                project_id=project.id,
                title=title,
                sort_order=(idx + 1) * 10,
                status=PlatformProjectTaskStatus.PENDING.value,
            )
        )
    db.commit()
    loaded = _load_project(db, project.id)
    assert loaded is not None
    _recalc_progress(loaded)
    db.commit()
    db.refresh(loaded)
    return loaded


@router.get("/{project_id}", response_model=PlatformProjectOut)
def get_platform_project(
    project_id: int,
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_db)],
) -> PlatformProject:
    project = _load_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return project


@router.patch("/{project_id}", response_model=PlatformProjectOut)
def patch_platform_project(
    project_id: int,
    payload: PlatformProjectPatchIn,
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_db)],
) -> PlatformProject:
    project = _load_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"]:
        val = data["status"].strip().lower()
        if val not in {s.value for s in PlatformProjectStatus}:
            raise HTTPException(status_code=422, detail="Status inválido.")
        data["status"] = val
    if "priority" in data and data["priority"]:
        val = data["priority"].strip().lower()
        if val not in {p.value for p in PlatformProjectPriority}:
            raise HTTPException(status_code=422, detail="Prioridade inválida.")
        data["priority"] = val

    for key, value in data.items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return project


@router.post("/{project_id}/tasks", response_model=PlatformProjectTaskOut, status_code=201)
def create_project_task(
    project_id: int,
    payload: PlatformProjectTaskCreateIn,
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_db)],
) -> PlatformProjectTask:
    project = _load_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    status_val = payload.status.strip().lower()
    if status_val not in {s.value for s in PlatformProjectTaskStatus}:
        raise HTTPException(status_code=422, detail="Status de tarefa inválido.")
    task = PlatformProjectTask(
        project_id=project_id,
        title=payload.title.strip(),
        description=payload.description,
        status=status_val,
        due_date=payload.due_date,
        sort_order=payload.sort_order,
        completed_at=datetime.now(timezone.utc) if status_val == PlatformProjectTaskStatus.DONE.value else None,
    )
    db.add(task)
    db.commit()
    project = _load_project(db, project_id)
    assert project is not None
    _recalc_progress(project)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{project_id}/tasks/{task_id}", response_model=PlatformProjectTaskOut)
def patch_project_task(
    project_id: int,
    task_id: int,
    payload: PlatformProjectTaskPatchIn,
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_db)],
) -> PlatformProjectTask:
    task = db.get(PlatformProjectTask, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"]:
        val = data["status"].strip().lower()
        if val not in {s.value for s in PlatformProjectTaskStatus}:
            raise HTTPException(status_code=422, detail="Status inválido.")
        data["status"] = val
        if val == PlatformProjectTaskStatus.DONE.value:
            task.completed_at = datetime.now(timezone.utc)
        elif task.status == PlatformProjectTaskStatus.DONE.value:
            task.completed_at = None
    for key, value in data.items():
        if key != "status":
            setattr(task, key, value)
        else:
            task.status = value
    db.commit()
    project = _load_project(db, project_id)
    assert project is not None
    _recalc_progress(project)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{project_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_task(
    project_id: int,
    task_id: int,
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    task = db.get(PlatformProjectTask, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    db.delete(task)
    db.commit()
    project = _load_project(db, project_id)
    if project:
        _recalc_progress(project)
        db.commit()
