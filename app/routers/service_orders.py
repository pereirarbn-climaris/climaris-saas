import os
import json
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.limiter import limiter
from app.dependencies import get_current_user, require_roles
from app.schemas import (
    EquipmentUsageReportRowOut,
    RescheduleOptionOut,
    ScheduleOut,
    ScheduleCancel,
    ScheduleReschedule,
    ServiceCreate,
    ServiceOrderApprove,
    ServiceOrderApproveOut,
    ServiceOrderCreate,
    ServiceOrderDiscountUpdate,
    ServiceOrderOut,
    ServiceOrderStatusUpdate,
    ServiceOrderItemEquipmentUpdate,
    ServiceOut,
    ServiceUpdate,
    SuggestedSlotOut,
    TechnicianBreakWindowCreate,
    TechnicianBreakWindowOut,
    TechnicianBreakWindowUpdate,
    TenantHolidayCreate,
    TenantHolidayOut,
    TechnicianAvailabilityOut,
    TechnicianDayAvailabilityOut,
    TechnicianUnavailabilityCreate,
    TechnicianUnavailabilityOut,
    TechnicianUnavailabilityUpdate,
    TechnicianWorkWindowCreate,
    TechnicianWorkWindowOut,
    TechnicianWorkWindowUpdate,
)
from app.stock_ops import apply_stock_consumption

from models import (
    Client,
    Equipment,
    OrderStatus,
    Product,
    Schedule,
    ScheduleStatus,
    ScheduleTechnician,
    Service,
    ServiceOrder,
    ServiceOrderProductItem,
    ServiceOrderServiceItem,
    ServiceOrderServiceItemEquipmentAudit,
    ServiceOrderTechnician,
    ServiceProductInput,
    Tenant,
    TenantHoliday,
    TechnicianBreakWindow,
    TechnicianUnavailability,
    TechnicianWorkWindow,
    User,
    UserRole,
)

router = APIRouter(tags=["service-orders"])

WORKDAY_START = os.getenv("WORKDAY_START", "08:00")
WORKDAY_END = os.getenv("WORKDAY_END", "18:00")
SCHEDULE_BUFFER_MINUTES = int(os.getenv("SCHEDULE_BUFFER_MINUTES", "15"))
ENFORCE_EQUIPMENT_ON_SERVICE_ORDER = os.getenv("ENFORCE_EQUIPMENT_ON_SERVICE_ORDER", "false").lower() in (
    "1",
    "true",
    "yes",
    "on",
)


def _apply_schedule_notes_to_open_schedules(order: ServiceOrder, notes: str | None) -> None:
    if notes is None:
        return
    stripped = notes.strip()
    if not stripped:
        return
    for schedule in order.schedules:
        if schedule.status != ScheduleStatus.CANCELLED:
            schedule.notes = stripped


def _parse_hhmm(value: str) -> time:
    hour, minute = value.split(":")
    return time(hour=int(hour), minute=int(minute))


WORKDAY_START_TIME = _parse_hhmm(WORKDAY_START)
WORKDAY_END_TIME = _parse_hhmm(WORKDAY_END)
SHIFT_MORNING_START = time(8, 0)
SHIFT_MORNING_END = time(12, 59)
SHIFT_AFTERNOON_START = time(13, 0)
AUTO_CONTINUATION_TAG = "[AUTO_CONTINUATION]"
_FIXED_NATIONAL_HOLIDAYS_MM_DD = {
    "01-01",
    "04-21",
    "05-01",
    "09-07",
    "10-12",
    "11-02",
    "11-15",
    "11-20",
    "12-25",
}


def _tenant_workday_bounds(tenant: Tenant) -> tuple[time, time]:
    start_raw = tenant.workday_start or WORKDAY_START
    end_raw = tenant.workday_end or WORKDAY_END
    try:
        start = _parse_hhmm(start_raw)
        end = _parse_hhmm(end_raw)
        if end <= start:
            raise ValueError
        return start, end
    except Exception:
        return WORKDAY_START_TIME, WORKDAY_END_TIME


def _tenant_weekday_workday_bounds(tenant: Tenant, weekday: int) -> tuple[time, time]:
    base_start, base_end = _tenant_workday_bounds(tenant)
    raw = tenant.weekday_work_hours
    if not raw:
        return base_start, base_end
    try:
        mapping = json.loads(raw)
    except Exception:
        return base_start, base_end
    if not isinstance(mapping, dict):
        return base_start, base_end
    day_rule = mapping.get(str(weekday))
    if not isinstance(day_rule, dict):
        return base_start, base_end
    start_raw = day_rule.get("start")
    end_raw = day_rule.get("end")
    if not isinstance(start_raw, str) or not isinstance(end_raw, str):
        return base_start, base_end
    try:
        start = _parse_hhmm(start_raw)
        end = _parse_hhmm(end_raw)
        if end <= start:
            return base_start, base_end
        return start, end
    except Exception:
        return base_start, base_end


def _with_buffer(end_at: datetime) -> datetime:
    return end_at + timedelta(minutes=max(SCHEDULE_BUFFER_MINUTES, 0))


def _is_holiday_blocked(target_date: date, tenant_holidays: set[date]) -> bool:
    if target_date in tenant_holidays:
        return True
    mm_dd = f"{target_date.month:02d}-{target_date.day:02d}"
    return mm_dd in _FIXED_NATIONAL_HOLIDAYS_MM_DD


def _tenant_tz(tenant: Tenant) -> ZoneInfo:
    try:
        return ZoneInfo(tenant.timezone or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _tenant_business_days(tenant: Tenant) -> set[int]:
    if tenant.weekday_work_hours:
        try:
            mapping = json.loads(tenant.weekday_work_hours)
            if isinstance(mapping, dict):
                days = {
                    int(k)
                    for k, v in mapping.items()
                    if str(k).isdigit() and isinstance(v, dict) and "start" in v and "end" in v
                }
                if days:
                    return {d for d in days if 0 <= d <= 6}
        except Exception:
            pass
    try:
        return {int(x) for x in (tenant.business_days or "0,1,2,3,4").split(",") if x != ""}
    except Exception:
        return {0, 1, 2, 3, 4}


def _enforce_technician_scope(current_user: User, requested_technician_id: int | None) -> int | None:
    if current_user.role != UserRole.TECHNICIAN:
        return requested_technician_id
    if requested_technician_id is not None and requested_technician_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Você só pode acessar a sua própria agenda.")
    return current_user.id


def _ensure_inside_workday(starts_at: datetime, ends_at: datetime, tenant: Tenant, holidays: set[date]) -> None:
    tz = _tenant_tz(tenant)
    local_start = starts_at.astimezone(tz)
    local_end = ends_at.astimezone(tz)
    if _is_holiday_blocked(local_start.date(), holidays):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A data informada é feriado.")
    if local_start.date() != local_end.date():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O agendamento deve começar e terminar no mesmo dia.",
        )


def _ensure_start_inside_workday(starts_at: datetime, tenant: Tenant, holidays: set[date]) -> None:
    tz = _tenant_tz(tenant)
    local_start = starts_at.astimezone(tz)
    if _is_holiday_blocked(local_start.date(), holidays):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A data informada é feriado.")


def _check_technician_conflict(
    db: Session,
    tenant_id: int,
    technician_id: int,
    starts_at: datetime,
    ends_at: datetime,
    ignore_schedule_id: int | None = None,
) -> None:
    query = (
        select(ScheduleTechnician)
        .join(Schedule, Schedule.id == ScheduleTechnician.schedule_id)
        .where(
            ScheduleTechnician.technician_id == technician_id,
            Schedule.tenant_id == tenant_id,
            Schedule.status != ScheduleStatus.CANCELLED,
            Schedule.starts_at < _with_buffer(ends_at),
            Schedule.ends_at > starts_at,
        )
    )
    if ignore_schedule_id is not None:
        query = query.where(Schedule.id != ignore_schedule_id)
    conflict = db.execute(query).scalar_one_or_none()
    if conflict is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Technician {technician_id} already has another schedule in this period.",
        )
    unavailability = db.execute(
        select(TechnicianUnavailability).where(
            TechnicianUnavailability.tenant_id == tenant_id,
            TechnicianUnavailability.technician_id == technician_id,
            TechnicianUnavailability.starts_at < _with_buffer(ends_at),
            TechnicianUnavailability.ends_at > starts_at,
        )
    ).scalar_one_or_none()
    if unavailability is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Technician {technician_id} is unavailable in this period.",
        )


def _check_technician_work_rules(
    db: Session,
    tenant_id: int,
    technician_id: int,
    starts_at: datetime,
    ends_at: datetime,
    tenant_tz: ZoneInfo,
) -> None:
    local_start = starts_at.astimezone(tenant_tz)
    local_end = ends_at.astimezone(tenant_tz)
    windows = db.execute(
        select(TechnicianWorkWindow).where(
            TechnicianWorkWindow.tenant_id == tenant_id,
            TechnicianWorkWindow.technician_id == technician_id,
            TechnicianWorkWindow.weekday == local_start.weekday(),
        )
    ).scalars().all()
    if not windows:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"O técnico {technician_id} não possui jornada configurada para este dia.",
        )
    inside_any_window = False
    for window in windows:
        ws = datetime.combine(local_start.date(), _parse_hhmm(window.start_time), tzinfo=tenant_tz)
        we = datetime.combine(local_start.date(), _parse_hhmm(window.end_time), tzinfo=tenant_tz)
        if local_start >= ws and local_end <= we:
            inside_any_window = True
            break
    if not inside_any_window:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"O horário está fora da jornada configurada do técnico {technician_id}.",
        )

    breaks = db.execute(
        select(TechnicianBreakWindow).where(
            TechnicianBreakWindow.tenant_id == tenant_id,
            TechnicianBreakWindow.technician_id == technician_id,
            TechnicianBreakWindow.weekday == local_start.weekday(),
        )
    ).scalars().all()
    for break_window in breaks:
        bs = datetime.combine(local_start.date(), _parse_hhmm(break_window.start_time), tzinfo=tenant_tz)
        be = datetime.combine(local_start.date(), _parse_hhmm(break_window.end_time), tzinfo=tenant_tz)
        if bs < _with_buffer(local_end) and be > local_start:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Technician {technician_id} schedule overlaps break window.",
            )


def _check_technician_start_rules(
    db: Session,
    tenant_id: int,
    technician_id: int,
    starts_at: datetime,
    tenant_tz: ZoneInfo,
) -> None:
    local_start = starts_at.astimezone(tenant_tz)
    windows = db.execute(
        select(TechnicianWorkWindow).where(
            TechnicianWorkWindow.tenant_id == tenant_id,
            TechnicianWorkWindow.technician_id == technician_id,
            TechnicianWorkWindow.weekday == local_start.weekday(),
        )
    ).scalars().all()
    if not windows:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"O técnico {technician_id} não possui jornada configurada para este dia.",
        )
    starts_inside_window = False
    for window in windows:
        ws = datetime.combine(local_start.date(), _parse_hhmm(window.start_time), tzinfo=tenant_tz)
        we = datetime.combine(local_start.date(), _parse_hhmm(window.end_time), tzinfo=tenant_tz)
        if local_start >= ws and local_start < we:
            starts_inside_window = True
            break
    if not starts_inside_window:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"O início deve estar dentro da jornada configurada do técnico {technician_id}.",
        )

    breaks = db.execute(
        select(TechnicianBreakWindow).where(
            TechnicianBreakWindow.tenant_id == tenant_id,
            TechnicianBreakWindow.technician_id == technician_id,
            TechnicianBreakWindow.weekday == local_start.weekday(),
        )
    ).scalars().all()
    for break_window in breaks:
        bs = datetime.combine(local_start.date(), _parse_hhmm(break_window.start_time), tzinfo=tenant_tz)
        be = datetime.combine(local_start.date(), _parse_hhmm(break_window.end_time), tzinfo=tenant_tz)
        if bs <= local_start < be:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Technician {technician_id} start overlaps break window.",
            )


def _next_business_day_start(
    starts_from: datetime,
    tenant: Tenant,
    holidays: set[date],
) -> datetime:
    tz = _tenant_tz(tenant)
    business_days = _tenant_business_days(tenant)
    current_local = starts_from.astimezone(tz)
    next_day = current_local.date() + timedelta(days=1)
    while next_day in holidays or next_day.weekday() not in business_days:
        next_day = next_day + timedelta(days=1)
    workday_start, _ = _tenant_weekday_workday_bounds(tenant, next_day.weekday())
    return datetime.combine(next_day, workday_start, tzinfo=tz).astimezone(timezone.utc)


def _reschedule_shift_bounds(
    *,
    day: date,
    shift: str,
    tenant_tz: ZoneInfo,
    tenant: Tenant,
) -> tuple[datetime, datetime] | None:
    day_start, day_end = _tenant_weekday_workday_bounds(tenant, day.weekday())
    if shift == "morning":
        start = max(day_start, SHIFT_MORNING_START)
        end = min(day_end, SHIFT_MORNING_END)
    else:
        start = max(day_start, SHIFT_AFTERNOON_START)
        end = day_end
    if end <= start:
        return None
    return (
        datetime.combine(day, start, tzinfo=tenant_tz).astimezone(timezone.utc),
        datetime.combine(day, end, tzinfo=tenant_tz).astimezone(timezone.utc),
    )


def _service_order_total_minutes(schedule: Schedule) -> int:
    order = schedule.service_order
    if order is None or not order.service_items:
        return max(1, int((schedule.ends_at - schedule.starts_at).total_seconds() // 60))
    return sum(max(item.quantity, 1) * max(item.duration_minutes, 1) for item in order.service_items)


def _workday_end_utc_for_datetime(*, starts_at: datetime, tenant: Tenant, tenant_tz: ZoneInfo) -> datetime:
    local_start = starts_at.astimezone(tenant_tz)
    _, day_end = _tenant_weekday_workday_bounds(tenant, local_start.weekday())
    return datetime.combine(local_start.date(), day_end, tzinfo=tenant_tz).astimezone(timezone.utc)


def _find_next_valid_slot(
    *,
    db: Session,
    tenant_id: int,
    technician_ids: list[int],
    tenant: Tenant,
    tenant_tz: ZoneInfo,
    holidays: set[date],
    start_day: date,
    minutes: int,
    ignore_schedule_id: int | None = None,
    now_local: datetime | None = None,
    limit_days: int = 45,
) -> tuple[datetime, datetime] | None:
    day_cursor = start_day
    searched_days = 0
    while searched_days < limit_days:
        searched_days += 1
        if _is_holiday_blocked(day_cursor, holidays) or day_cursor.weekday() not in _tenant_business_days(tenant):
            day_cursor += timedelta(days=1)
            continue
        for shift_name in ("morning", "afternoon"):
            shift_bounds = _reschedule_shift_bounds(day=day_cursor, shift=shift_name, tenant_tz=tenant_tz, tenant=tenant)
            if shift_bounds is None:
                continue
            shift_start, shift_end = shift_bounds
            probe = shift_start
            while probe <= shift_end:
                local_probe = probe.astimezone(tenant_tz)
                if now_local is not None and local_probe < now_local:
                    probe += timedelta(minutes=15)
                    continue
                candidate_end = probe + timedelta(minutes=minutes)
                if candidate_end > shift_end:
                    break
                try:
                    for technician_id in technician_ids:
                        _check_technician_conflict(
                            db=db,
                            tenant_id=tenant_id,
                            technician_id=technician_id,
                            starts_at=probe,
                            ends_at=candidate_end,
                            ignore_schedule_id=ignore_schedule_id,
                        )
                        _check_technician_work_rules(
                            db=db,
                            tenant_id=tenant_id,
                            technician_id=technician_id,
                            starts_at=probe,
                            ends_at=candidate_end,
                            tenant_tz=tenant_tz,
                        )
                    return probe, candidate_end
                except HTTPException:
                    probe += timedelta(minutes=15)
        day_cursor += timedelta(days=1)
    return None


def _validate_window_overlap(
    db: Session,
    tenant_id: int,
    technician_id: int,
    weekday: int,
    start_time: str,
    end_time: str,
    *,
    is_break: bool,
    ignore_id: int | None = None,
) -> None:
    start_obj = _parse_hhmm(start_time)
    end_obj = _parse_hhmm(end_time)
    if end_obj <= start_obj:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_time must be greater than start_time.")
    if weekday < 0 or weekday > 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="weekday must be between 0 and 6.")

    table = TechnicianBreakWindow if is_break else TechnicianWorkWindow
    query = select(table).where(
        table.tenant_id == tenant_id,
        table.technician_id == technician_id,
        table.weekday == weekday,
    )
    if ignore_id is not None:
        query = query.where(table.id != ignore_id)
    rows = db.execute(query).scalars().all()
    for row in rows:
        existing_start = _parse_hhmm(row.start_time)
        existing_end = _parse_hhmm(row.end_time)
        if start_obj < existing_end and end_obj > existing_start:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Time window overlaps existing window.")


def _validate_unavailability(
    db: Session,
    tenant_id: int,
    technician_id: int,
    starts_at: datetime,
    ends_at: datetime,
    ignore_id: int | None = None,
) -> None:
    if ends_at <= starts_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ends_at must be greater than starts_at.")
    query = select(TechnicianUnavailability).where(
        TechnicianUnavailability.tenant_id == tenant_id,
        TechnicianUnavailability.technician_id == technician_id,
        TechnicianUnavailability.starts_at < ends_at,
        TechnicianUnavailability.ends_at > starts_at,
    )
    if ignore_id is not None:
        query = query.where(TechnicianUnavailability.id != ignore_id)
    overlap = db.execute(query).scalar_one_or_none()
    if overlap is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Unavailability overlaps existing block.")


def _create_equipment_link_audit(
    *,
    db: Session,
    tenant_id: int,
    service_order_id: int,
    service_item_id: int,
    previous_equipment_id: int | None,
    new_equipment_id: int | None,
    changed_by_user_id: int | None,
    source: str = "app",
) -> None:
    db.add(
        ServiceOrderServiceItemEquipmentAudit(
            tenant_id=tenant_id,
            service_order_id=service_order_id,
            service_item_id=service_item_id,
            previous_equipment_id=previous_equipment_id,
            new_equipment_id=new_equipment_id,
            changed_by_user_id=changed_by_user_id,
            source=source,
        )
    )


def _apply_split_fat_service_item(
    db: Session,
    *,
    tenant_id: int,
    user_id: int | None,
    order: ServiceOrder,
    service_item: ServiceOrderServiceItem,
    audit_source: str,
) -> None:
    """Divide um item com quantidade > 1 em uma linha com qtd 1 + novas linhas idênticas com qtd 1."""
    qty = int(service_item.quantity or 1)
    if qty <= 1:
        return
    service_item.quantity = 1
    for _ in range(qty - 1):
        new_item = ServiceOrderServiceItem(
            service_order_id=order.id,
            service_id=service_item.service_id,
            equipment_id=service_item.equipment_id,
            quantity=1,
            unit_price=service_item.unit_price,
            duration_minutes=service_item.duration_minutes,
        )
        db.add(new_item)
        db.flush()
        _create_equipment_link_audit(
            db=db,
            tenant_id=tenant_id,
            service_order_id=order.id,
            service_item_id=new_item.id,
            previous_equipment_id=None,
            new_equipment_id=new_item.equipment_id,
            changed_by_user_id=user_id,
            source=audit_source,
        )


def _ensure_unique_service_product_inputs(product_inputs: list[ServiceProductInput]) -> None:
    seen: set[int] = set()
    for item in product_inputs:
        if item.product_id in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Há produtos repetidos em 'Materiais do serviço'. Remova duplicidades.",
            )
        seen.add(item.product_id)


@router.post(
    "/services",
    response_model=ServiceOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def create_service(
    request: Request,
    payload: ServiceCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Service:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service name cannot be empty.")
    if payload.duration_minutes < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="duration_minutes must be at least 1.")
    if payload.price < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="price must be greater than or equal to 0.")
    if payload.btu_min is not None and payload.btu_max is not None and payload.btu_min > payload.btu_max:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="btu_min cannot be greater than btu_max.")

    existing = db.execute(
        select(Service).where(Service.tenant_id == current_user.tenant_id, Service.name == name)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Service name already exists for this tenant.")

    _ensure_unique_service_product_inputs(payload.product_inputs)

    service = Service(
        tenant_id=current_user.tenant_id,
        name=name,
        description=payload.description,
        price=payload.price,
        duration_minutes=payload.duration_minutes,
        equipment_type_tags=(payload.equipment_type_tags.strip() if payload.equipment_type_tags else None),
        btu_min=payload.btu_min,
        btu_max=payload.btu_max,
        service_category=(payload.service_category.strip().lower() if payload.service_category else None),
        applies_residential=bool(payload.applies_residential),
        applies_commercial=bool(payload.applies_commercial),
        is_active=payload.is_active,
        nfse_codigo_tributacao_nacional=(payload.nfse_codigo_tributacao_nacional or "").strip() or None,
        nfse_codigo_nbs=(payload.nfse_codigo_nbs or "").strip() or None,
        periodicidade_meses=payload.periodicidade_meses,
    )
    db.add(service)
    db.flush()
    for input_item in payload.product_inputs:
        if input_item.quantity <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantidade de insumo deve ser maior que zero.")
        product = db.execute(
            select(Product).where(Product.id == input_item.product_id, Product.tenant_id == current_user.tenant_id)
        ).scalar_one_or_none()
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Produto {input_item.product_id} não encontrado.")
        db.add(
            ServiceProductInput(
                service_id=service.id,
                product_id=product.id,
                quantity=input_item.quantity,
                unit_cost=product.purchase_price,
            )
        )
    db.commit()
    db.refresh(service)
    return service


@router.get(
    "/services",
    response_model=list[ServiceOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def list_services(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    q: Annotated[str | None, Query(description="Filter by service name or description")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[Service]:
    query = select(Service).where(Service.tenant_id == current_user.tenant_id).options(selectinload(Service.product_inputs))
    if q:
        term = f"%{q}%"
        query = query.where(or_(Service.name.ilike(term), Service.description.ilike(term)))
    return db.execute(query.order_by(Service.id.desc()).offset(skip).limit(limit)).scalars().all()


@router.get(
    "/services/{service_id}",
    response_model=ServiceOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def get_service(
    service_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Service:
    service = db.execute(
        select(Service)
        .where(Service.id == service_id, Service.tenant_id == current_user.tenant_id)
        .options(selectinload(Service.product_inputs))
    ).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")
    return service


@router.put(
    "/services/{service_id}",
    response_model=ServiceOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def update_service(
    request: Request,
    service_id: int,
    payload: ServiceUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Service:
    service = db.execute(
        select(Service)
        .where(Service.id == service_id, Service.tenant_id == current_user.tenant_id)
        .options(selectinload(Service.product_inputs))
    ).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    if payload.name is not None and not payload.name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service name cannot be empty.")
    if payload.duration_minutes is not None and payload.duration_minutes < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="duration_minutes must be at least 1.")
    if payload.price is not None and payload.price < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="price must be greater than or equal to 0.")
    if payload.btu_min is not None and payload.btu_max is not None and payload.btu_min > payload.btu_max:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="btu_min cannot be greater than btu_max.")

    next_name = payload.name.strip() if payload.name is not None else None
    if next_name and next_name != service.name:
        existing = db.execute(
            select(Service).where(Service.tenant_id == current_user.tenant_id, Service.name == next_name)
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Service name already exists for this tenant.")

    if next_name is not None:
        service.name = next_name
    if payload.description is not None:
        service.description = payload.description
    if payload.price is not None:
        service.price = payload.price
    if payload.duration_minutes is not None:
        service.duration_minutes = payload.duration_minutes
    if "equipment_type_tags" in payload.model_fields_set:
        service.equipment_type_tags = (payload.equipment_type_tags or "").strip() or None
    if "btu_min" in payload.model_fields_set:
        service.btu_min = payload.btu_min
    if "btu_max" in payload.model_fields_set:
        service.btu_max = payload.btu_max
    if "service_category" in payload.model_fields_set:
        service.service_category = (payload.service_category or "").strip().lower() or None
    if payload.applies_residential is not None:
        service.applies_residential = bool(payload.applies_residential)
    if payload.applies_commercial is not None:
        service.applies_commercial = bool(payload.applies_commercial)
    if payload.is_active is not None:
        service.is_active = payload.is_active
    if "nfse_codigo_tributacao_nacional" in payload.model_fields_set:
        service.nfse_codigo_tributacao_nacional = (payload.nfse_codigo_tributacao_nacional or "").strip() or None
    if "nfse_codigo_nbs" in payload.model_fields_set:
        service.nfse_codigo_nbs = (payload.nfse_codigo_nbs or "").strip() or None
    if "periodicidade_meses" in payload.model_fields_set:
        service.periodicidade_meses = payload.periodicidade_meses
    if payload.product_inputs is not None:
        _ensure_unique_service_product_inputs(payload.product_inputs)
        for row in list(service.product_inputs):
            db.delete(row)
        db.flush()
        for input_item in payload.product_inputs:
            if input_item.quantity <= 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantidade de insumo deve ser maior que zero.")
            product = db.execute(
                select(Product).where(Product.id == input_item.product_id, Product.tenant_id == current_user.tenant_id)
            ).scalar_one_or_none()
            if product is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Produto {input_item.product_id} não encontrado.")
            db.add(
                ServiceProductInput(
                    service_id=service.id,
                    product_id=product.id,
                    quantity=input_item.quantity,
                    unit_cost=product.purchase_price,
                )
            )

    db.commit()
    db.refresh(service)
    return service


@router.delete(
    "/services/{service_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("120/minute")
def delete_service(
    request: Request,
    service_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    service = db.execute(
        select(Service).where(Service.id == service_id, Service.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    db.delete(service)
    db.commit()
    return None


def _service_order_detail_options(*, for_stock: bool = False):
    schedule_techs = selectinload(ServiceOrder.schedules).selectinload(Schedule.technicians).selectinload(
        ScheduleTechnician.technician
    )
    order_techs = selectinload(ServiceOrder.technicians).selectinload(ServiceOrderTechnician.technician)
    if for_stock:
        return (
            selectinload(ServiceOrder.service_items)
            .selectinload(ServiceOrderServiceItem.service)
            .selectinload(Service.product_inputs),
            selectinload(ServiceOrder.service_items).selectinload(ServiceOrderServiceItem.equipment),
            selectinload(ServiceOrder.product_items),
            schedule_techs,
            order_techs,
        )
    return (
        selectinload(ServiceOrder.service_items).selectinload(ServiceOrderServiceItem.service),
        selectinload(ServiceOrder.service_items).selectinload(ServiceOrderServiceItem.equipment),
        selectinload(ServiceOrder.product_items),
        schedule_techs,
        order_techs,
    )


@router.get(
    "/service-orders/{order_id}",
    response_model=ServiceOrderOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def get_service_order(
    order_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ServiceOrder:
    order = db.execute(
        select(ServiceOrder)
        .where(ServiceOrder.id == order_id, ServiceOrder.tenant_id == current_user.tenant_id)
        .options(*_service_order_detail_options(for_stock=False))
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service order not found.")
    return order


@router.patch(
    "/service-orders/{order_id}/discount",
    response_model=ServiceOrderOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def patch_service_order_discount(
    request: Request,
    order_id: int,
    payload: ServiceOrderDiscountUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ServiceOrder:
    order = db.execute(
        select(ServiceOrder)
        .where(ServiceOrder.id == order_id, ServiceOrder.tenant_id == current_user.tenant_id)
        .options(*_service_order_detail_options(for_stock=False))
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service order not found.")
    if order.status in (OrderStatus.DONE, OrderStatus.CANCELLED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não é possível alterar desconto desta OS.")
    order.discount_amount = max(0.0, min(float(payload.discount_amount), 9_999_999.0))
    db.commit()
    refreshed = db.execute(
        select(ServiceOrder)
        .where(ServiceOrder.id == order_id, ServiceOrder.tenant_id == current_user.tenant_id)
        .options(*_service_order_detail_options(for_stock=False))
    ).scalar_one()
    return refreshed


@router.patch(
    "/service-orders/{order_id}",
    response_model=ServiceOrderOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
@limiter.limit("60/minute")
def patch_service_order_status(
    request: Request,
    order_id: int,
    payload: ServiceOrderStatusUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ServiceOrder:
    order = db.execute(
        select(ServiceOrder)
        .where(ServiceOrder.id == order_id, ServiceOrder.tenant_id == current_user.tenant_id)
        .options(*_service_order_detail_options(for_stock=True))
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service order not found.")

    target = payload.status
    current = order.status

    if target == "cancelled":
        if current in (OrderStatus.DONE, OrderStatus.CANCELLED):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não é possível cancelar esta OS.")
        _apply_schedule_notes_to_open_schedules(order, payload.schedule_notes)
        order.status = OrderStatus.CANCELLED
        for schedule in order.schedules:
            if schedule.status != ScheduleStatus.CANCELLED:
                schedule.status = ScheduleStatus.CANCELLED
        db.commit()
    elif target == "in_progress":
        if current not in (OrderStatus.APPROVED, OrderStatus.SCHEDULED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Só é possível colocar em andamento uma OS aprovada ou agendada.",
            )
        _apply_schedule_notes_to_open_schedules(order, payload.schedule_notes)
        order.status = OrderStatus.IN_PROGRESS
        db.commit()
    elif target == "done":
        if current not in (OrderStatus.APPROVED, OrderStatus.SCHEDULED, OrderStatus.IN_PROGRESS):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Só é possível concluir uma OS aprovada, agendada ou em andamento.",
            )
        if ENFORCE_EQUIPMENT_ON_SERVICE_ORDER:
            client_has_active_equipments = db.execute(
                select(Equipment.id)
                .where(Equipment.client_id == order.client_id, Equipment.ativo.is_(True))
                .limit(1)
            ).scalar_one_or_none() is not None
            missing_equipment = any(item.equipment_id is None for item in order.service_items)
            if client_has_active_equipments and missing_equipment:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Não é possível concluir a OS com serviços sem equipamento vinculado.",
                )
        _apply_schedule_notes_to_open_schedules(order, payload.schedule_notes)
        try:
            apply_stock_consumption(db, tenant_id=current_user.tenant_id, order=order)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        order.status = OrderStatus.DONE
        if order.closed_at is None:
            order.closed_at = datetime.now(timezone.utc)
        db.commit()
        try:
            from app.whatsapp_bot import dispatch_service_order_done_flow

            dispatch_service_order_done_flow(db, tenant_id=current_user.tenant_id, order=order)
        except Exception:
            # O fechamento da OS não deve ser revertido se a automação WhatsApp estiver incompleta/indisponível.
            db.rollback()
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Status inválido.")

    refreshed = db.execute(
        select(ServiceOrder)
        .where(ServiceOrder.id == order_id, ServiceOrder.tenant_id == current_user.tenant_id)
        .options(*_service_order_detail_options(for_stock=False))
    ).scalar_one()
    return refreshed


@router.get(
    "/service-orders",
    response_model=list[ServiceOrderOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def list_service_orders(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status_filter: Annotated[OrderStatus | None, Query(alias="status")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[ServiceOrder]:
    query = (
        select(ServiceOrder)
        .where(ServiceOrder.tenant_id == current_user.tenant_id)
        .options(
            selectinload(ServiceOrder.service_items).selectinload(ServiceOrderServiceItem.service),
            selectinload(ServiceOrder.product_items),
            selectinload(ServiceOrder.schedules),
        )
    )
    if status_filter is not None:
        query = query.where(ServiceOrder.status == status_filter)
    return db.execute(query.order_by(ServiceOrder.id.desc()).offset(skip).limit(limit)).scalars().all()


@router.post(
    "/service-orders",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def create_service_order(
    request: Request,
    payload: ServiceOrderCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, int | str]:
    client = db.execute(
        select(Client).where(Client.id == payload.client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")
    if not payload.services:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service order requires at least one service.")
    client_has_active_equipments = db.execute(
        select(Equipment.id)
        .where(Equipment.client_id == client.id, Equipment.ativo.is_(True))
        .limit(1)
    ).scalar_one_or_none() is not None

    disc = max(0.0, min(float(payload.discount_amount or 0), 9_999_999.0))
    order = ServiceOrder(
        tenant_id=current_user.tenant_id,
        client_id=payload.client_id,
        title=payload.title,
        description=payload.description,
        discount_amount=disc,
        status=OrderStatus.OPEN,
    )
    db.add(order)
    db.flush()

    for service_item in payload.services:
        service = db.execute(
            select(Service).where(Service.id == service_item.service_id, Service.tenant_id == current_user.tenant_id)
        ).scalar_one_or_none()
        if service is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Service {service_item.service_id} not found.")
        equipment_id: int | None = service_item.equipment_id
        if equipment_id is not None:
            equipment = db.execute(
                select(Equipment).where(
                    Equipment.id == equipment_id,
                    Equipment.client_id == client.id,
                    Equipment.ativo.is_(True),
                )
            ).scalar_one_or_none()
            if equipment is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Equipamento inválido para este cliente ou inativo.",
                )
        if ENFORCE_EQUIPMENT_ON_SERVICE_ORDER and client_has_active_equipments and equipment_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vincule um equipamento em cada serviço desta OS.",
            )
        order_service_item = ServiceOrderServiceItem(
            service_order_id=order.id,
            service_id=service.id,
            equipment_id=equipment_id,
            quantity=max(service_item.quantity, 1),
            unit_price=service.price,
            duration_minutes=service.duration_minutes,
        )
        db.add(order_service_item)
        db.flush()
        _create_equipment_link_audit(
            db=db,
            tenant_id=current_user.tenant_id,
            service_order_id=order.id,
            service_item_id=order_service_item.id,
            previous_equipment_id=None,
            new_equipment_id=equipment_id,
            changed_by_user_id=current_user.id,
            source="app",
        )

    for product_item in payload.products:
        product = db.execute(
            select(Product).where(Product.id == product_item.product_id, Product.tenant_id == current_user.tenant_id)
        ).scalar_one_or_none()
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product {product_item.product_id} not found.")
        db.add(
            ServiceOrderProductItem(
                service_order_id=order.id,
                product_id=product.id,
                quantity=max(product_item.quantity, 1),
                unit_price=product.sale_price,
            )
        )

    for technician_id in payload.technician_ids:
        technician = db.execute(
            select(User).where(
                User.id == technician_id,
                User.tenant_id == current_user.tenant_id,
                User.role == UserRole.TECHNICIAN,
            )
        ).scalar_one_or_none()
        if technician is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Technician {technician_id} not found.")
        db.add(ServiceOrderTechnician(service_order_id=order.id, technician_id=technician.id))

    db.commit()
    return {"id": order.id, "status": order.status.value}


@router.put(
    "/service-orders/{order_id}/service-items/{service_item_id}/equipment",
    response_model=ServiceOrderOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
@limiter.limit("120/minute")
def update_service_item_equipment(
    request: Request,
    order_id: int,
    service_item_id: int,
    payload: ServiceOrderItemEquipmentUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ServiceOrder:
    order = db.execute(
        select(ServiceOrder)
        .where(ServiceOrder.id == order_id, ServiceOrder.tenant_id == current_user.tenant_id)
        .options(*_service_order_detail_options(for_stock=False))
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service order not found.")
    service_item = db.execute(
        select(ServiceOrderServiceItem).where(
            ServiceOrderServiceItem.id == service_item_id,
            ServiceOrderServiceItem.service_order_id == order.id,
        )
    ).scalar_one_or_none()
    if service_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service item not found.")
    next_equipment_id = payload.equipment_id
    if next_equipment_id is not None:
        equipment = db.execute(
            select(Equipment).where(
                Equipment.id == next_equipment_id,
                Equipment.client_id == order.client_id,
                Equipment.ativo.is_(True),
            )
        ).scalar_one_or_none()
        if equipment is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Equipamento inválido para este cliente ou inativo.",
            )
    previous_equipment_id = service_item.equipment_id
    service_item.equipment_id = next_equipment_id
    _create_equipment_link_audit(
        db=db,
        tenant_id=current_user.tenant_id,
        service_order_id=order.id,
        service_item_id=service_item.id,
        previous_equipment_id=previous_equipment_id,
        new_equipment_id=next_equipment_id,
        changed_by_user_id=current_user.id,
        source="app",
    )
    db.commit()
    refreshed = db.execute(
        select(ServiceOrder)
        .where(ServiceOrder.id == order.id, ServiceOrder.tenant_id == current_user.tenant_id)
        .options(*_service_order_detail_options(for_stock=False))
    ).scalar_one()
    return refreshed


@router.post(
    "/service-orders/{order_id}/service-items/{service_item_id}/split",
    response_model=ServiceOrderOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
@limiter.limit("60/minute")
def split_service_order_service_item(
    request: Request,
    order_id: int,
    service_item_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ServiceOrder:
    """Divide um item com quantidade > 1 em várias linhas com quantidade 1 (um equipamento por linha)."""
    order = db.execute(
        select(ServiceOrder)
        .where(ServiceOrder.id == order_id, ServiceOrder.tenant_id == current_user.tenant_id)
        .options(*_service_order_detail_options(for_stock=False))
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service order not found.")
    if order.status in (OrderStatus.DONE, OrderStatus.CANCELLED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível fracionar serviços de uma OS concluída ou cancelada.",
        )
    service_item = db.execute(
        select(ServiceOrderServiceItem).where(
            ServiceOrderServiceItem.id == service_item_id,
            ServiceOrderServiceItem.service_order_id == order.id,
        )
    ).scalar_one_or_none()
    if service_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service item not found.")
    qty = int(service_item.quantity or 1)
    if qty <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este item já tem quantidade 1; não há o que fracionar.",
        )
    _apply_split_fat_service_item(
        db,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        order=order,
        service_item=service_item,
        audit_source="app",
    )
    db.commit()
    refreshed = db.execute(
        select(ServiceOrder)
        .where(ServiceOrder.id == order.id, ServiceOrder.tenant_id == current_user.tenant_id)
        .options(*_service_order_detail_options(for_stock=False))
    ).scalar_one()
    return refreshed


@router.get(
    "/service-orders/reports/equipment-usage",
    response_model=list[EquipmentUsageReportRowOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def equipment_usage_report(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    client_id: int | None = None,
) -> list[EquipmentUsageReportRowOut]:
    order_scope = select(ServiceOrder.id).where(ServiceOrder.tenant_id == current_user.tenant_id)
    if client_id is not None:
        order_scope = order_scope.where(ServiceOrder.client_id == client_id)
    rows = db.execute(
        select(
            Equipment.id,
            Equipment.identificacao,
            Equipment.tipo,
            func.count(ServiceOrderServiceItem.id),
        )
        .join(ServiceOrderServiceItem, ServiceOrderServiceItem.equipment_id == Equipment.id)
        .where(ServiceOrderServiceItem.service_order_id.in_(order_scope))
        .group_by(Equipment.id, Equipment.identificacao, Equipment.tipo)
        .order_by(func.count(ServiceOrderServiceItem.id).desc(), Equipment.identificacao.asc())
    ).all()
    return [
        EquipmentUsageReportRowOut(
            equipment_id=row[0],
            identificacao=row[1],
            tipo=row[2].value if hasattr(row[2], "value") else str(row[2]),
            total_servicos=int(row[3]),
        )
        for row in rows
    ]


@router.post(
    "/service-orders/{order_id}/approve",
    response_model=ServiceOrderApproveOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def approve_service_order(
    request: Request,
    order_id: int,
    payload: ServiceOrderApprove,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ServiceOrderApproveOut:
    tenant = db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id)).scalar_one()
    tenant_tz = _tenant_tz(tenant)
    holidays = set(
        db.execute(select(TenantHoliday.holiday_date).where(TenantHoliday.tenant_id == current_user.tenant_id)).scalars().all()
    )
    order = db.execute(
        select(ServiceOrder)
        .where(ServiceOrder.id == order_id, ServiceOrder.tenant_id == current_user.tenant_id)
        .options(
            selectinload(ServiceOrder.service_items),
            selectinload(ServiceOrder.technicians),
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service order not found.")
    if order.schedule is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Service order already has a schedule.")
    if not order.service_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service order has no services.")

    total_minutes = sum(max(item.quantity, 1) * max(item.duration_minutes, 1) for item in order.service_items)
    split_days = max(1, payload.split_days or 1)
    base_minutes = total_minutes // split_days
    remainder = total_minutes % split_days
    segment_minutes = [base_minutes + (1 if i < remainder else 0) for i in range(split_days)]

    technician_ids = payload.technician_ids if payload.technician_ids is not None else [t.technician_id for t in order.technicians]
    validated_technician_ids: list[int] = []
    for technician_id in technician_ids:
        technician = db.execute(
            select(User).where(
                User.id == technician_id,
                User.tenant_id == current_user.tenant_id,
                User.role == UserRole.TECHNICIAN,
            )
        ).scalar_one_or_none()
        if technician is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Technician {technician_id} not found.")
        validated_technician_ids.append(technician_id)

    schedule_ids: list[int] = []
    segment_start = payload.starts_at
    for idx, minutes in enumerate(segment_minutes):
        segment_end = segment_start + timedelta(minutes=minutes)
        if not payload.allow_overtime:
            _ensure_inside_workday(segment_start, segment_end, tenant=tenant, holidays=holidays)
        else:
            _ensure_start_inside_workday(segment_start, tenant=tenant, holidays=holidays)

        for technician_id in validated_technician_ids:
            _check_technician_conflict(
                db=db,
                tenant_id=current_user.tenant_id,
                technician_id=technician_id,
                starts_at=segment_start,
                ends_at=segment_end,
            )
            if not payload.allow_overtime:
                _check_technician_work_rules(
                    db=db,
                    tenant_id=current_user.tenant_id,
                    technician_id=technician_id,
                    starts_at=segment_start,
                    ends_at=segment_end,
                    tenant_tz=tenant_tz,
                )
            else:
                _check_technician_start_rules(
                    db=db,
                    tenant_id=current_user.tenant_id,
                    technician_id=technician_id,
                    starts_at=segment_start,
                    tenant_tz=tenant_tz,
                )

        segment_label = f" [Parte {idx + 1}/{split_days}]" if split_days > 1 else ""
        schedule = Schedule(
            tenant_id=current_user.tenant_id,
            client_id=order.client_id,
            service_order_id=order.id,
            starts_at=segment_start,
            ends_at=segment_end,
            status=ScheduleStatus.PENDING,
            notes=f"{payload.notes or ''}{segment_label}".strip() or None,
        )
        db.add(schedule)
        db.flush()
        for technician_id in validated_technician_ids:
            db.add(ScheduleTechnician(schedule_id=schedule.id, technician_id=technician_id))
        schedule_ids.append(schedule.id)
        if idx < len(segment_minutes) - 1:
            segment_start = _next_business_day_start(segment_start, tenant=tenant, holidays=holidays)

    order.status = OrderStatus.SCHEDULED
    db.commit()
    return {
        "service_order_id": order.id,
        "schedule_id": schedule_ids[0],
        "schedule_ids": schedule_ids,
        "duration_minutes": total_minutes,
        "split_days": split_days,
    }


@router.get(
    "/schedules",
    response_model=list[ScheduleOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
@limiter.limit("120/minute")
def list_schedules(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status_filter: Annotated[ScheduleStatus | None, Query(alias="status")] = None,
    technician_id: Annotated[int | None, Query()] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 20,
    from_day: Annotated[date | None, Query(description="Inclusive start (tenant local calendar day).")] = None,
    to_day: Annotated[date | None, Query(description="Inclusive end (tenant local calendar day).")] = None,
) -> list[Schedule]:
    technician_id = _enforce_technician_scope(current_user, technician_id)
    tenant = db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id)).scalar_one()
    tenant_tz = _tenant_tz(tenant)
    query = (
        select(Schedule)
        .where(Schedule.tenant_id == current_user.tenant_id)
        .options(selectinload(Schedule.client))
        .outerjoin(ServiceOrder, ServiceOrder.id == Schedule.service_order_id)
    )
    if status_filter is not None:
        query = query.where(Schedule.status == status_filter)
    else:
        query = query.where(
            Schedule.status != ScheduleStatus.CANCELLED,
            or_(Schedule.service_order_id.is_(None), ServiceOrder.status != OrderStatus.CANCELLED),
        )
    if technician_id is not None:
        query = query.join(ScheduleTechnician).where(ScheduleTechnician.technician_id == technician_id)
    if from_day is not None:
        range_start_utc = datetime.combine(from_day, time.min, tzinfo=tenant_tz).astimezone(timezone.utc)
        query = query.where(Schedule.starts_at >= range_start_utc)
    if to_day is not None:
        range_end_excl = datetime.combine(to_day + timedelta(days=1), time.min, tzinfo=tenant_tz).astimezone(timezone.utc)
        query = query.where(Schedule.starts_at < range_end_excl)
    range_filter = from_day is not None or to_day is not None
    order = Schedule.starts_at.asc() if range_filter else Schedule.starts_at.desc()
    rows = db.execute(query.order_by(order).offset(skip).limit(limit)).scalars().all()
    out: list[ScheduleOut] = []
    for row in rows:
        client = row.client
        client_name = client.name if client is not None else None
        client_phone = client.phone if client is not None else None
        client_whatsapp = client.whatsapp if client is not None else None
        if client is not None:
            parts = [client.address_street, client.address_number, client.address_district, client.address_city]
            client_address = ", ".join([str(p).strip() for p in parts if p and str(p).strip()])
        else:
            client_address = None
        out.append(
            ScheduleOut.model_validate(
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
        )
    return out


@router.get(
    "/schedules/{schedule_id}/reschedule-options",
    response_model=list[RescheduleOptionOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def reschedule_options(
    request: Request,
    schedule_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    from_day: Annotated[date | None, Query()] = None,
) -> list[RescheduleOptionOut]:
    tenant = db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id)).scalar_one()
    tenant_tz = _tenant_tz(tenant)
    now_local = datetime.now(tenant_tz)
    holidays = set(
        db.execute(select(TenantHoliday.holiday_date).where(TenantHoliday.tenant_id == current_user.tenant_id)).scalars().all()
    )
    schedule = db.execute(
        select(Schedule)
        .where(Schedule.id == schedule_id, Schedule.tenant_id == current_user.tenant_id)
        .options(selectinload(Schedule.service_order).selectinload(ServiceOrder.service_items), selectinload(Schedule.technicians))
    ).scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found.")
    if schedule.status == ScheduleStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cancelled schedule cannot be rescheduled.")

    total_minutes = max(1, _service_order_total_minutes(schedule))
    technician_ids = [item.technician_id for item in schedule.technicians]
    base_day = from_day or datetime.now(tenant_tz).date()
    suggestions: list[RescheduleOptionOut] = []
    day_cursor = base_day
    attempts = 0
    while len(suggestions) < 4 and attempts < 45:
        attempts += 1
        if _is_holiday_blocked(day_cursor, holidays):
            day_cursor += timedelta(days=1)
            continue
        if day_cursor.weekday() not in _tenant_business_days(tenant):
            day_cursor += timedelta(days=1)
            continue
        for shift_name in ("morning", "afternoon"):
            if len(suggestions) >= 4:
                break
            shift_bounds = _reschedule_shift_bounds(day=day_cursor, shift=shift_name, tenant_tz=tenant_tz, tenant=tenant)
            if shift_bounds is None:
                continue
            shift_start, shift_end = shift_bounds
            probe = shift_start
            found_for_shift = False
            while probe <= shift_end:
                local_probe = probe.astimezone(tenant_tz)
                if local_probe < now_local:
                    probe += timedelta(minutes=15)
                    continue
                integral_end = probe + timedelta(minutes=total_minutes)
                is_integral = integral_end <= shift_end
                try:
                    if is_integral:
                        for technician_id in technician_ids:
                            _check_technician_conflict(
                                db=db,
                                tenant_id=current_user.tenant_id,
                                technician_id=technician_id,
                                starts_at=probe,
                                ends_at=integral_end,
                                ignore_schedule_id=schedule.id,
                            )
                            _check_technician_work_rules(
                                db=db,
                                tenant_id=current_user.tenant_id,
                                technician_id=technician_id,
                                starts_at=probe,
                                ends_at=integral_end,
                                tenant_tz=tenant_tz,
                            )
                        suggestions.append(
                            RescheduleOptionOut(
                                technician_id=technician_ids[0] if technician_ids else None,
                                starts_at=probe,
                                ends_at=integral_end,
                                status="integral",
                                note="Conclui no mesmo periodo.",
                            )
                        )
                    elif total_minutes > 240:
                        first_part_minutes = (total_minutes + 1) // 2
                        second_part_minutes = max(1, total_minutes - first_part_minutes)
                        first_segment_end = probe + timedelta(minutes=first_part_minutes)
                        if first_segment_end > shift_end:
                            probe += timedelta(minutes=15)
                            continue
                        for technician_id in technician_ids:
                            _check_technician_conflict(
                                db=db,
                                tenant_id=current_user.tenant_id,
                                technician_id=technician_id,
                                starts_at=probe,
                                ends_at=first_segment_end,
                                ignore_schedule_id=schedule.id,
                            )
                            _check_technician_work_rules(
                                db=db,
                                tenant_id=current_user.tenant_id,
                                technician_id=technician_id,
                                starts_at=probe,
                                ends_at=first_segment_end,
                                tenant_tz=tenant_tz,
                            )
                        next_slot = _find_next_valid_slot(
                            db=db,
                            tenant_id=current_user.tenant_id,
                            technician_ids=technician_ids,
                            tenant=tenant,
                            tenant_tz=tenant_tz,
                            holidays=holidays,
                            start_day=day_cursor + timedelta(days=1),
                            minutes=second_part_minutes,
                            ignore_schedule_id=schedule.id,
                            now_local=now_local,
                        )
                        if next_slot is None:
                            probe += timedelta(minutes=15)
                            continue
                        next_start, next_end = next_slot
                        suggestions.append(
                            RescheduleOptionOut(
                                technician_id=technician_ids[0] if technician_ids else None,
                                starts_at=probe,
                                ends_at=first_segment_end,
                                status="fracionado",
                                note=(
                                    f"Inicia as {probe.astimezone(tenant_tz).strftime('%H:%M')}, "
                                    f"continua em {next_start.astimezone(tenant_tz).strftime('%d/%m %H:%M')}."
                                ),
                                continuation_starts_at=next_start,
                                continuation_ends_at=next_end,
                            )
                        )
                    else:
                        probe += timedelta(minutes=15)
                        continue
                    found_for_shift = True
                    break
                except HTTPException:
                    probe += timedelta(minutes=15)
            if not found_for_shift:
                continue
        day_cursor += timedelta(days=1)
    return suggestions


@router.put(
    "/schedules/{schedule_id}/reschedule",
    response_model=ScheduleOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def reschedule(
    request: Request,
    schedule_id: int,
    payload: ScheduleReschedule,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Schedule:
    tenant = db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id)).scalar_one()
    tenant_tz = _tenant_tz(tenant)
    holidays = set(
        db.execute(select(TenantHoliday.holiday_date).where(TenantHoliday.tenant_id == current_user.tenant_id)).scalars().all()
    )
    schedule = db.execute(
        select(Schedule)
        .where(Schedule.id == schedule_id, Schedule.tenant_id == current_user.tenant_id)
        .options(selectinload(Schedule.service_order), selectinload(Schedule.technicians))
    ).scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found.")
    if schedule.status == ScheduleStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cancelled schedule cannot be rescheduled.")
    if schedule.service_order is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Schedule has no linked service order.")

    total_minutes = max(1, _service_order_total_minutes(schedule))
    target_technicians = (
        payload.technician_ids if payload.technician_ids is not None else [t.technician_id for t in schedule.technicians]
    )
    day_end_utc = _workday_end_utc_for_datetime(starts_at=payload.starts_at, tenant=tenant, tenant_tz=tenant_tz)
    integral_ends_at = payload.starts_at + timedelta(minutes=total_minutes)
    is_integral = integral_ends_at <= day_end_utc
    first_segment_end = integral_ends_at if is_integral else day_end_utc
    if _is_holiday_blocked(payload.starts_at.astimezone(tenant_tz).date(), holidays):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A data informada é feriado.")
    if first_segment_end <= payload.starts_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não há tempo hábil no dia para iniciar o atendimento.")

    for technician_id in target_technicians:
        tech = db.execute(
            select(User).where(
                User.id == technician_id,
                User.tenant_id == current_user.tenant_id,
                User.role == UserRole.TECHNICIAN,
            )
        ).scalar_one_or_none()
        if tech is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Technician {technician_id} not found.")
        _check_technician_conflict(
            db=db,
            tenant_id=current_user.tenant_id,
            technician_id=technician_id,
            starts_at=payload.starts_at,
            ends_at=first_segment_end,
            ignore_schedule_id=schedule.id,
        )
        _check_technician_work_rules(
            db=db,
            tenant_id=current_user.tenant_id,
            technician_id=technician_id,
            starts_at=payload.starts_at,
            ends_at=first_segment_end,
            tenant_tz=tenant_tz,
        )

    auto_continuations = db.execute(
        select(Schedule)
        .where(
            Schedule.tenant_id == current_user.tenant_id,
            Schedule.service_order_id == schedule.service_order_id,
            Schedule.id != schedule.id,
            Schedule.status != ScheduleStatus.CANCELLED,
            Schedule.notes.is_not(None),
            Schedule.notes.ilike(f"%{AUTO_CONTINUATION_TAG}%"),
        )
        .order_by(Schedule.starts_at.asc())
    ).scalars().all()

    schedule.starts_at = payload.starts_at
    schedule.ends_at = first_segment_end
    if payload.notes is not None:
        schedule.notes = payload.notes

    if payload.technician_ids is not None:
        for item in list(schedule.technicians):
            db.delete(item)
        db.flush()
        for technician_id in payload.technician_ids:
            db.add(ScheduleTechnician(schedule_id=schedule.id, technician_id=technician_id))

    if is_integral:
        for extra in auto_continuations:
            extra.status = ScheduleStatus.CANCELLED
            extra.notes = f"{extra.notes or ''}\nCancelado por remarcação integral.".strip()
    else:
        consumed_first_minutes = int((first_segment_end - payload.starts_at).total_seconds() // 60)
        remaining_minutes = max(1, total_minutes - consumed_first_minutes)
        continuation_starts_at = _next_business_day_start(first_segment_end, tenant=tenant, holidays=holidays)
        continuation_ends_at = continuation_starts_at + timedelta(minutes=remaining_minutes)
        for technician_id in target_technicians:
            _check_technician_conflict(
                db=db,
                tenant_id=current_user.tenant_id,
                technician_id=technician_id,
                starts_at=continuation_starts_at,
                ends_at=continuation_ends_at,
                ignore_schedule_id=schedule.id,
            )
            _check_technician_work_rules(
                db=db,
                tenant_id=current_user.tenant_id,
                technician_id=technician_id,
                starts_at=continuation_starts_at,
                ends_at=continuation_ends_at,
                tenant_tz=tenant_tz,
            )

        continuation = auto_continuations[0] if auto_continuations else None
        if continuation is None:
            continuation = Schedule(
                tenant_id=current_user.tenant_id,
                client_id=schedule.client_id,
                service_order_id=schedule.service_order_id,
                starts_at=continuation_starts_at,
                ends_at=continuation_ends_at,
                status=ScheduleStatus.PENDING,
                notes=(
                    f"{AUTO_CONTINUATION_TAG} Continuação automática da remarcação "
                    f"(início {payload.starts_at.astimezone(tenant_tz).strftime('%d/%m %H:%M')})."
                ),
            )
            db.add(continuation)
            db.flush()
        else:
            continuation.starts_at = continuation_starts_at
            continuation.ends_at = continuation_ends_at
            continuation.status = ScheduleStatus.PENDING
            continuation.notes = (
                f"{AUTO_CONTINUATION_TAG} Continuação automática da remarcação "
                f"(início {payload.starts_at.astimezone(tenant_tz).strftime('%d/%m %H:%M')})."
            )

        db.query(ScheduleTechnician).filter(ScheduleTechnician.schedule_id == continuation.id).delete(synchronize_session=False)
        for technician_id in target_technicians:
            db.add(ScheduleTechnician(schedule_id=continuation.id, technician_id=technician_id))
        for extra in auto_continuations[1:]:
            extra.status = ScheduleStatus.CANCELLED
            extra.notes = f"{extra.notes or ''}\nCancelado por atualização de continuação automática.".strip()

    db.commit()
    db.refresh(schedule)
    return schedule


@router.post(
    "/schedules/{schedule_id}/cancel",
    response_model=ScheduleOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def cancel_schedule(
    request: Request,
    schedule_id: int,
    payload: ScheduleCancel,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Schedule:
    schedule = db.execute(
        select(Schedule).where(Schedule.id == schedule_id, Schedule.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found.")
    schedule.status = ScheduleStatus.CANCELLED
    if payload.reason:
        schedule.notes = f"{schedule.notes or ''}\nCancellation reason: {payload.reason}".strip()
    db.commit()
    db.refresh(schedule)
    return schedule


@router.get(
    "/technicians/availability",
    response_model=TechnicianDayAvailabilityOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
@limiter.limit("120/minute")
def technicians_day_availability(
    request: Request,
    day: date,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TechnicianDayAvailabilityOut:
    if current_user.role == UserRole.TECHNICIAN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Você só pode visualizar a sua própria agenda.")
    tenant = db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id)).scalar_one()
    tz = _tenant_tz(tenant)
    day_start = datetime.combine(day, time.min).replace(tzinfo=tz).astimezone(timezone.utc)
    day_end = day_start + timedelta(days=1)

    technicians = db.execute(
        select(User).where(
            User.tenant_id == current_user.tenant_id,
            User.role == UserRole.TECHNICIAN,
            User.is_active.is_(True),
        )
    ).scalars().all()

    availability: list[TechnicianAvailabilityOut] = []
    for technician in technicians:
        busy_slots = db.execute(
            select(ScheduleTechnician)
            .join(Schedule, Schedule.id == ScheduleTechnician.schedule_id)
            .where(
                ScheduleTechnician.technician_id == technician.id,
                Schedule.tenant_id == current_user.tenant_id,
                Schedule.status != ScheduleStatus.CANCELLED,
                Schedule.starts_at < day_end,
                Schedule.ends_at > day_start,
            )
        ).scalars().all()
        availability.append(
            TechnicianAvailabilityOut(
                technician_id=technician.id,
                full_name=technician.full_name,
                busy_slots=len(busy_slots),
                is_available=len(busy_slots) == 0,
            )
        )

    return TechnicianDayAvailabilityOut(day=day, technicians=availability)


def suggest_booking_slots(
    db: Session,
    *,
    tenant: Tenant,
    tenant_id: int,
    duration_minutes: int,
    from_at: datetime,
    technician_id: int | None = None,
    limit: int = 4,
    allow_overtime: bool = False,
) -> list[SuggestedSlotOut]:
    """Encaixa horários como o botão da OS: até 4 opções alternando manhã/tarde e respeitando jornada e conflitos dos técnicos."""
    tz = _tenant_tz(tenant)
    now_utc = datetime.now(timezone.utc)
    holidays = set(
        db.execute(select(TenantHoliday.holiday_date).where(TenantHoliday.tenant_id == tenant_id)).scalars().all()
    )
    duration_minutes = max(1, int(duration_minutes))

    tech_query = select(User).where(
        User.tenant_id == tenant_id,
        User.role == UserRole.TECHNICIAN,
        User.is_active.is_(True),
    )
    if technician_id is not None:
        tech_query = tech_query.where(User.id == technician_id)
    technicians = db.execute(tech_query).scalars().all()

    if from_at.tzinfo is None:
        from_at = from_at.replace(tzinfo=timezone.utc)
    from_at_utc = from_at if from_at >= now_utc else now_utc
    from_local = from_at_utc.astimezone(tz)
    business_days = _tenant_business_days(tenant)

    suggestions: list[SuggestedSlotOut] = []
    day_cursor = from_local.date()
    attempts = 0
    max_suggestions = min(max(1, int(limit)), 4)
    while len(suggestions) < max_suggestions and attempts < 60:
        attempts += 1
        if _is_holiday_blocked(day_cursor, holidays) or day_cursor.weekday() not in business_days:
            day_cursor += timedelta(days=1)
            continue
        for shift_name in ("morning", "afternoon"):
            if len(suggestions) >= max_suggestions:
                break
            shift_bounds = _reschedule_shift_bounds(day=day_cursor, shift=shift_name, tenant_tz=tz, tenant=tenant)
            if shift_bounds is None:
                continue
            shift_start, shift_end = shift_bounds
            probe = shift_start
            if day_cursor == from_local.date() and from_at_utc > probe:
                probe = from_at_utc
            found_for_shift = False
            while probe <= shift_end:
                local_probe = probe.astimezone(tz)
                if local_probe < datetime.now(tz):
                    probe += timedelta(minutes=15)
                    continue
                candidate_end = probe + timedelta(minutes=duration_minutes)
                if not allow_overtime and candidate_end > shift_end:
                    break
                for tech in technicians:
                    try:
                        if allow_overtime:
                            _check_technician_start_rules(
                                db=db,
                                tenant_id=tenant_id,
                                technician_id=tech.id,
                                starts_at=probe,
                                tenant_tz=tz,
                            )
                        else:
                            _check_technician_work_rules(
                                db=db,
                                tenant_id=tenant_id,
                                technician_id=tech.id,
                                starts_at=probe,
                                ends_at=candidate_end,
                                tenant_tz=tz,
                            )
                        _check_technician_conflict(
                            db=db,
                            tenant_id=tenant_id,
                            technician_id=tech.id,
                            starts_at=probe,
                            ends_at=candidate_end,
                        )
                        suggestions.append(
                            SuggestedSlotOut(
                                technician_id=tech.id,
                                starts_at=probe,
                                ends_at=candidate_end,
                                shift=shift_name,
                            )
                        )
                        found_for_shift = True
                        break
                    except HTTPException:
                        continue
                if found_for_shift:
                    break
                probe += timedelta(minutes=15)
        day_cursor += timedelta(days=1)

    return suggestions


@router.get(
    "/technicians/next-slots",
    response_model=list[SuggestedSlotOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
@limiter.limit("30/minute")
def technicians_next_slots(
    request: Request,
    service_order_id: int,
    from_at: datetime,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    technician_id: int | None = None,
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
    allow_overtime: bool = False,
    split_days: Annotated[int | None, Query(ge=2, le=10)] = None,
) -> list[SuggestedSlotOut]:
    technician_id = _enforce_technician_scope(current_user, technician_id)
    tenant = db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id)).scalar_one()
    order = db.execute(
        select(ServiceOrder)
        .where(ServiceOrder.id == service_order_id, ServiceOrder.tenant_id == current_user.tenant_id)
        .options(selectinload(ServiceOrder.service_items))
    ).scalar_one_or_none()
    if order is None or not order.service_items:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service order not found or has no services.")

    total_duration_minutes = sum(max(i.quantity, 1) * max(i.duration_minutes, 1) for i in order.service_items)
    if split_days is not None and split_days > 1:
        duration_minutes = max(1, total_duration_minutes // split_days)
        if total_duration_minutes % split_days != 0:
            duration_minutes += 1
    else:
        duration_minutes = total_duration_minutes

    if from_at.tzinfo is None:
        from_at = from_at.replace(tzinfo=timezone.utc)

    return suggest_booking_slots(
        db,
        tenant=tenant,
        tenant_id=current_user.tenant_id,
        duration_minutes=duration_minutes,
        from_at=from_at,
        technician_id=technician_id,
        limit=limit,
        allow_overtime=allow_overtime,
    )


@router.post(
    "/tenant-holidays",
    response_model=TenantHolidayOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def create_tenant_holiday(
    request: Request,
    payload: TenantHolidayCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TenantHoliday:
    holiday = TenantHoliday(
        tenant_id=current_user.tenant_id,
        holiday_date=payload.holiday_date,
        description=payload.description,
    )
    db.add(holiday)
    db.commit()
    db.refresh(holiday)
    return holiday


@router.get(
    "/tenant-holidays",
    response_model=list[TenantHolidayOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def list_tenant_holidays(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[TenantHoliday]:
    return db.execute(
        select(TenantHoliday)
        .where(TenantHoliday.tenant_id == current_user.tenant_id)
        .order_by(TenantHoliday.holiday_date.asc())
        .offset(skip)
        .limit(limit)
    ).scalars().all()


@router.delete(
    "/tenant-holidays/{holiday_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def delete_tenant_holiday(
    request: Request,
    holiday_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    row = db.execute(
        select(TenantHoliday).where(TenantHoliday.id == holiday_id, TenantHoliday.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holiday not found.")
    db.delete(row)
    db.commit()
    return None


@router.post(
    "/technicians/work-windows",
    response_model=TechnicianWorkWindowOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def create_work_window(
    request: Request,
    payload: TechnicianWorkWindowCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TechnicianWorkWindow:
    technician = db.execute(
        select(User).where(
            User.id == payload.technician_id, User.tenant_id == current_user.tenant_id, User.role == UserRole.TECHNICIAN
        )
    ).scalar_one_or_none()
    if technician is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found.")
    _validate_window_overlap(
        db=db,
        tenant_id=current_user.tenant_id,
        technician_id=payload.technician_id,
        weekday=payload.weekday,
        start_time=payload.start_time,
        end_time=payload.end_time,
        is_break=False,
    )
    row = TechnicianWorkWindow(
        tenant_id=current_user.tenant_id,
        technician_id=payload.technician_id,
        weekday=payload.weekday,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get(
    "/technicians/work-windows",
    response_model=list[TechnicianWorkWindowOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def list_work_windows(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    technician_id: int | None = None,
    weekday: int | None = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[TechnicianWorkWindow]:
    technician_id = _enforce_technician_scope(current_user, technician_id)
    query = select(TechnicianWorkWindow).where(TechnicianWorkWindow.tenant_id == current_user.tenant_id)
    if technician_id is not None:
        query = query.where(TechnicianWorkWindow.technician_id == technician_id)
    if weekday is not None:
        query = query.where(TechnicianWorkWindow.weekday == weekday)
    return db.execute(
        query.order_by(TechnicianWorkWindow.weekday.asc(), TechnicianWorkWindow.start_time.asc()).offset(skip).limit(limit)
    ).scalars().all()


@router.put(
    "/technicians/work-windows/{window_id}",
    response_model=TechnicianWorkWindowOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def update_work_window(
    request: Request,
    window_id: int,
    payload: TechnicianWorkWindowUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TechnicianWorkWindow:
    row = db.execute(
        select(TechnicianWorkWindow).where(
            TechnicianWorkWindow.id == window_id, TechnicianWorkWindow.tenant_id == current_user.tenant_id
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work window not found.")
    _validate_window_overlap(
        db=db,
        tenant_id=current_user.tenant_id,
        technician_id=row.technician_id,
        weekday=payload.weekday,
        start_time=payload.start_time,
        end_time=payload.end_time,
        is_break=False,
        ignore_id=row.id,
    )
    row.weekday = payload.weekday
    row.start_time = payload.start_time
    row.end_time = payload.end_time
    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/technicians/work-windows/{window_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def delete_work_window(
    request: Request,
    window_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    row = db.execute(
        select(TechnicianWorkWindow).where(
            TechnicianWorkWindow.id == window_id, TechnicianWorkWindow.tenant_id == current_user.tenant_id
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work window not found.")
    db.delete(row)
    db.commit()
    return None


@router.post(
    "/technicians/break-windows",
    response_model=TechnicianBreakWindowOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def create_break_window(
    request: Request,
    payload: TechnicianBreakWindowCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TechnicianBreakWindow:
    technician = db.execute(
        select(User).where(
            User.id == payload.technician_id, User.tenant_id == current_user.tenant_id, User.role == UserRole.TECHNICIAN
        )
    ).scalar_one_or_none()
    if technician is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found.")
    _validate_window_overlap(
        db=db,
        tenant_id=current_user.tenant_id,
        technician_id=payload.technician_id,
        weekday=payload.weekday,
        start_time=payload.start_time,
        end_time=payload.end_time,
        is_break=True,
    )
    row = TechnicianBreakWindow(
        tenant_id=current_user.tenant_id,
        technician_id=payload.technician_id,
        weekday=payload.weekday,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get(
    "/technicians/break-windows",
    response_model=list[TechnicianBreakWindowOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def list_break_windows(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    technician_id: int | None = None,
    weekday: int | None = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[TechnicianBreakWindow]:
    technician_id = _enforce_technician_scope(current_user, technician_id)
    query = select(TechnicianBreakWindow).where(TechnicianBreakWindow.tenant_id == current_user.tenant_id)
    if technician_id is not None:
        query = query.where(TechnicianBreakWindow.technician_id == technician_id)
    if weekday is not None:
        query = query.where(TechnicianBreakWindow.weekday == weekday)
    return db.execute(
        query.order_by(TechnicianBreakWindow.weekday.asc(), TechnicianBreakWindow.start_time.asc()).offset(skip).limit(limit)
    ).scalars().all()


@router.put(
    "/technicians/break-windows/{window_id}",
    response_model=TechnicianBreakWindowOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def update_break_window(
    request: Request,
    window_id: int,
    payload: TechnicianBreakWindowUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TechnicianBreakWindow:
    row = db.execute(
        select(TechnicianBreakWindow).where(
            TechnicianBreakWindow.id == window_id, TechnicianBreakWindow.tenant_id == current_user.tenant_id
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Break window not found.")
    _validate_window_overlap(
        db=db,
        tenant_id=current_user.tenant_id,
        technician_id=row.technician_id,
        weekday=payload.weekday,
        start_time=payload.start_time,
        end_time=payload.end_time,
        is_break=True,
        ignore_id=row.id,
    )
    row.weekday = payload.weekday
    row.start_time = payload.start_time
    row.end_time = payload.end_time
    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/technicians/break-windows/{window_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def delete_break_window(
    request: Request,
    window_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    row = db.execute(
        select(TechnicianBreakWindow).where(
            TechnicianBreakWindow.id == window_id, TechnicianBreakWindow.tenant_id == current_user.tenant_id
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Break window not found.")
    db.delete(row)
    db.commit()
    return None


@router.post(
    "/technicians/unavailability",
    response_model=TechnicianUnavailabilityOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def create_unavailability(
    request: Request,
    payload: TechnicianUnavailabilityCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TechnicianUnavailability:
    technician = db.execute(
        select(User).where(
            User.id == payload.technician_id, User.tenant_id == current_user.tenant_id, User.role == UserRole.TECHNICIAN
        )
    ).scalar_one_or_none()
    if technician is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found.")
    _validate_unavailability(
        db=db,
        tenant_id=current_user.tenant_id,
        technician_id=payload.technician_id,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )
    row = TechnicianUnavailability(
        tenant_id=current_user.tenant_id,
        technician_id=payload.technician_id,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        reason=payload.reason,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get(
    "/technicians/unavailability",
    response_model=list[TechnicianUnavailabilityOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def list_unavailability(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    technician_id: int | None = None,
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[TechnicianUnavailability]:
    technician_id = _enforce_technician_scope(current_user, technician_id)
    query = select(TechnicianUnavailability).where(TechnicianUnavailability.tenant_id == current_user.tenant_id)
    if technician_id is not None:
        query = query.where(TechnicianUnavailability.technician_id == technician_id)
    if from_at is not None:
        query = query.where(TechnicianUnavailability.ends_at >= from_at)
    if to_at is not None:
        query = query.where(TechnicianUnavailability.starts_at <= to_at)
    return db.execute(query.order_by(TechnicianUnavailability.starts_at.asc()).offset(skip).limit(limit)).scalars().all()


@router.put(
    "/technicians/unavailability/{block_id}",
    response_model=TechnicianUnavailabilityOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def update_unavailability(
    request: Request,
    block_id: int,
    payload: TechnicianUnavailabilityUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TechnicianUnavailability:
    row = db.execute(
        select(TechnicianUnavailability).where(
            TechnicianUnavailability.id == block_id, TechnicianUnavailability.tenant_id == current_user.tenant_id
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unavailability block not found.")
    _validate_unavailability(
        db=db,
        tenant_id=current_user.tenant_id,
        technician_id=row.technician_id,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        ignore_id=row.id,
    )
    row.starts_at = payload.starts_at
    row.ends_at = payload.ends_at
    row.reason = payload.reason
    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/technicians/unavailability/{block_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def delete_unavailability(
    request: Request,
    block_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    row = db.execute(
        select(TechnicianUnavailability).where(
            TechnicianUnavailability.id == block_id, TechnicianUnavailability.tenant_id == current_user.tenant_id
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unavailability block not found.")
    db.delete(row)
    db.commit()
    return None
