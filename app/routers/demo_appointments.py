"""Agendamento de demonstrações comerciais — site público e operação Climaris."""

from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.demo_blocks_database import get_demo_blocks_db
from app.demo_appointment_notifications import (
    notify_demo_status_change_whatsapp,
    schedule_demo_appointment_notifications,
)
from app.demo_scheduling import (
    DEMO_DURATION_MINUTES,
    DEMO_TZ,
    is_demo_slot_available,
    list_demo_calendar_days,
    list_demo_slots,
)
from app.dependencies import require_platform_operator
from app.limiter import limiter
from app.schemas_demo_appointments import (
    DemoAppointmentCreateIn,
    DemoAppointmentCreateOut,
    DemoAppointmentOut,
    DemoAppointmentPatchIn,
    DemoCalendarDayOut,
    DemoScheduleBlockCreateIn,
    DemoScheduleBlockOut,
    DemoSlotOut,
)
from models import DemoAppointment, DemoAppointmentStatus, DemoScheduleBlock, User, WebsiteLead

router = APIRouter(tags=["demo-appointments"])
public_router = APIRouter(prefix="/public", tags=["public"])
platform_router = APIRouter(prefix="/platform/demo-appointments", tags=["platform"])


def _normalize_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = "".join(ch for ch in phone if ch.isdigit())
    return digits or None


def _build_lead_message(payload: DemoAppointmentCreateIn, scheduled_at_label: str) -> str:
    parts = [f"Demonstração agendada para {scheduled_at_label}."]
    if payload.company:
        parts.append(f"Empresa: {payload.company}.")
    if payload.job_title:
        parts.append(f"Cargo: {payload.job_title}.")
    if payload.technicians_count:
        parts.append(f"Técnicos na equipe: {payload.technicians_count}.")
    if payload.selected_plan:
        parts.append(f"Plano de interesse: {payload.selected_plan}.")
    return " ".join(parts)


@public_router.get("/demo-calendar", response_model=list[DemoCalendarDayOut])
def get_public_demo_calendar(
    db: Annotated[Session, Depends(get_db)],
    year: Annotated[int, Query(ge=2024, le=2100)],
    month: Annotated[int, Query(ge=1, le=12)],
) -> list[DemoCalendarDayOut]:
    """Resumo mensal de disponibilidade para calendário do site."""
    raw = list_demo_calendar_days(db, year=year, month=month)
    return [DemoCalendarDayOut(**day) for day in raw]


@public_router.get("/demo-slots", response_model=list[DemoSlotOut])
def get_public_demo_slots(
    db: Annotated[Session, Depends(get_db)],
    from_day: Annotated[date | None, Query(alias="from")] = None,
    days: Annotated[int, Query(ge=1, le=30)] = 14,
) -> list[DemoSlotOut]:
    """Horários disponíveis para agendar demonstração (site institucional)."""
    raw = list_demo_slots(db, from_day=from_day, days=days)
    return [DemoSlotOut(**slot) for slot in raw]


@router.post("/demo-appointments", response_model=DemoAppointmentCreateOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
def create_demo_appointment(
    request: Request,
    payload: DemoAppointmentCreateIn,
    db: Annotated[Session, Depends(get_db)],
) -> DemoAppointmentCreateOut:
    """Agenda demonstração pelo site — cria lead + compromisso na agenda da operação."""
    email_norm = payload.email.strip().lower()
    try:
        validate_email(email_norm, check_deliverability=False)
    except EmailNotValidError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"E-mail inválido: {exc}",
        ) from exc

    scheduled_at = payload.scheduled_at
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=DEMO_TZ)
    else:
        scheduled_at = scheduled_at.astimezone(DEMO_TZ)

    if not is_demo_slot_available(db, scheduled_at):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este horário não está mais disponível. Escolha outro horário.",
        )

    local_label = scheduled_at.strftime("%d/%m/%Y às %H:%M")
    message = _build_lead_message(payload, local_label)

    lead = WebsiteLead(
        name=payload.name.strip(),
        email=email_norm,
        phone=_normalize_phone(payload.phone),
        company=payload.company.strip() if payload.company else None,
        job_title=payload.job_title.strip() if payload.job_title else None,
        technicians_count=payload.technicians_count.strip() if payload.technicians_count else None,
        selected_plan=payload.selected_plan.strip() if payload.selected_plan else None,
        message=message,
        source="website",
        status="scheduled",
        ip_address=request.client.host if request.client else None,
        user_agent=(request.headers.get("user-agent") or "")[:500] or None,
        lgpd_consent_at=datetime.now(timezone.utc),
    )
    db.add(lead)
    db.flush()

    appointment = DemoAppointment(
        website_lead_id=lead.id,
        name=lead.name,
        email=lead.email,
        phone=lead.phone,
        company=lead.company,
        job_title=lead.job_title,
        technicians_count=lead.technicians_count,
        selected_plan=lead.selected_plan,
        scheduled_at=scheduled_at,
        duration_minutes=DEMO_DURATION_MINUTES,
        status=DemoAppointmentStatus.SCHEDULED.value,
        ip_address=lead.ip_address,
        user_agent=lead.user_agent,
    )
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    schedule_demo_appointment_notifications(appointment.id)

    return DemoAppointmentCreateOut(
        id=appointment.id,
        scheduled_at=appointment.scheduled_at,
        message=(
            f"Demonstração confirmada para {local_label} (horário de Brasília). "
            "Enviamos a confirmação por e-mail e WhatsApp."
        ),
    )


@platform_router.get("/calendar", response_model=list[DemoCalendarDayOut])
def get_platform_demo_calendar(
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_db)],
    year: Annotated[int, Query(ge=2024, le=2100)],
    month: Annotated[int, Query(ge=1, le=12)],
) -> list[DemoCalendarDayOut]:
    raw = list_demo_calendar_days(db, year=year, month=month)
    return [DemoCalendarDayOut(**day) for day in raw]


@platform_router.get("/blocks", response_model=list[DemoScheduleBlockOut])
def list_demo_schedule_blocks(
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_demo_blocks_db)],
    from_day: Annotated[date | None, Query(alias="from")] = None,
    to_day: Annotated[date | None, Query(alias="to")] = None,
) -> list[DemoScheduleBlock]:
    stmt = select(DemoScheduleBlock).order_by(DemoScheduleBlock.starts_at.asc())
    if from_day:
        stmt = stmt.where(DemoScheduleBlock.ends_at >= date_to_start_of_day(from_day))
    if to_day:
        stmt = stmt.where(DemoScheduleBlock.starts_at < date_to_start_of_day(to_day) + timedelta(days=1))
    return list(db.scalars(stmt).all())


@platform_router.post("/blocks", response_model=DemoScheduleBlockOut, status_code=status.HTTP_201_CREATED)
def create_demo_schedule_block(
    payload: DemoScheduleBlockCreateIn,
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_demo_blocks_db)],
) -> DemoScheduleBlock:
    starts = payload.starts_at.astimezone(DEMO_TZ) if payload.starts_at.tzinfo else payload.starts_at.replace(tzinfo=DEMO_TZ)
    ends = payload.ends_at.astimezone(DEMO_TZ) if payload.ends_at.tzinfo else payload.ends_at.replace(tzinfo=DEMO_TZ)
    if ends <= starts:
        raise HTTPException(status_code=422, detail="O fim do bloqueio deve ser após o início.")
    block = DemoScheduleBlock(starts_at=starts, ends_at=ends, reason=payload.reason)
    db.add(block)
    db.commit()
    db.refresh(block)
    return block


@platform_router.delete("/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_demo_schedule_block(
    block_id: int,
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_demo_blocks_db)],
) -> None:
    block = db.get(DemoScheduleBlock, block_id)
    if not block:
        raise HTTPException(status_code=404, detail="Bloqueio não encontrado.")
    db.delete(block)
    db.commit()


@platform_router.get("", response_model=list[DemoAppointmentOut])
def list_demo_appointments(
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_demo_blocks_db)],
    from_day: Annotated[date | None, Query(alias="from")] = None,
    to_day: Annotated[date | None, Query(alias="to")] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[DemoAppointment]:
    """Lista demonstrações agendadas — operação Climaris."""
    stmt = select(DemoAppointment).order_by(DemoAppointment.scheduled_at.asc()).limit(limit)
    if from_day:
        stmt = stmt.where(DemoAppointment.scheduled_at >= date_to_start_of_day(from_day))
    if to_day:
        stmt = stmt.where(
            DemoAppointment.scheduled_at < date_to_start_of_day(to_day) + timedelta(days=1)
        )
    if status_filter:
        stmt = stmt.where(DemoAppointment.status == status_filter.strip().lower())
    return list(db.scalars(stmt).all())


def date_to_start_of_day(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=DEMO_TZ)


@platform_router.patch("/{appointment_id}", response_model=DemoAppointmentOut)
def patch_demo_appointment(
    appointment_id: int,
    payload: DemoAppointmentPatchIn,
    current_user: Annotated[User, Depends(require_platform_operator)],
    db: Annotated[Session, Depends(get_demo_blocks_db)],
) -> DemoAppointment:
    """Atualiza status, notas ou reagenda demonstração."""
    appointment = db.get(DemoAppointment, appointment_id)
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demonstração não encontrada.")

    if payload.scheduled_at is not None:
        new_at = payload.scheduled_at
        if new_at.tzinfo is None:
            new_at = new_at.replace(tzinfo=DEMO_TZ)
        else:
            new_at = new_at.astimezone(DEMO_TZ)
        if new_at != appointment.scheduled_at and not is_demo_slot_available(
            db, new_at, exclude_id=appointment.id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Horário indisponível para reagendamento.",
            )
        appointment.scheduled_at = new_at

    previous_status = appointment.status
    if payload.status is not None:
        status_val = payload.status.strip().lower()
        allowed = {s.value for s in DemoAppointmentStatus}
        if status_val not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Status inválido. Use: {', '.join(sorted(allowed))}.",
            )
        appointment.status = status_val

    if payload.notes is not None:
        appointment.notes = payload.notes

    db.commit()
    db.refresh(appointment)

    status_changed = payload.status is not None and appointment.status != previous_status
    should_notify = payload.notify_whatsapp if payload.notify_whatsapp is not None else True
    if status_changed and should_notify:
        notify_demo_status_change_whatsapp(db, appointment, appointment.status)

    return appointment
