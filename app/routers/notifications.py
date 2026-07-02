from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.notifications import mark_notification_read, mark_notification_unread
from app.pagination import clamp_limit
from app.schemas import (
    NotificationBulkDeleteOut,
    NotificationBulkIdsIn,
    NotificationListOut,
    NotificationOut,
    NotificationUnreadCountOut,
)
from models import NotificationKind, User, UserNotification, UserRole

router = APIRouter(prefix="/notifications", tags=["notifications"])

_APP_ROLES = [Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))]

_VALID_KINDS = {kind.value for kind in NotificationKind}


def _notification_options():
    return (selectinload(UserNotification.actor_user),)


def _user_notification_base(current_user: User):
    return select(UserNotification).where(
        UserNotification.tenant_id == current_user.tenant_id,
        UserNotification.user_id == current_user.id,
    )


def _get_user_notification(
    db: Session,
    *,
    current_user: User,
    notification_id: int,
) -> UserNotification | None:
    return db.execute(
        select(UserNotification)
        .where(
            UserNotification.id == notification_id,
            UserNotification.tenant_id == current_user.tenant_id,
            UserNotification.user_id == current_user.id,
        )
        .options(*_notification_options())
    ).scalar_one_or_none()


def _unread_count(db: Session, current_user: User) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(UserNotification)
            .where(
                UserNotification.tenant_id == current_user.tenant_id,
                UserNotification.user_id == current_user.id,
                UserNotification.read_at.is_(None),
            )
        )
        or 0
    )


def _apply_list_filters(
    query,
    *,
    unread_only: bool,
    kind: str | None,
    from_date: date | None,
    to_date: date | None,
):
    if unread_only:
        query = query.where(UserNotification.read_at.is_(None))
    if kind:
        query = query.where(UserNotification.kind == kind)
    if from_date is not None:
        start = datetime.combine(from_date, time.min, tzinfo=timezone.utc)
        query = query.where(UserNotification.created_at >= start)
    if to_date is not None:
        end = datetime.combine(to_date, time.max, tzinfo=timezone.utc)
        query = query.where(UserNotification.created_at <= end)
    return query


@router.get("", response_model=NotificationListOut, dependencies=_APP_ROLES)
def list_notifications(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
    unread_only: Annotated[bool, Query()] = False,
    kind: Annotated[str | None, Query()] = None,
    from_date: Annotated[date | None, Query()] = None,
    to_date: Annotated[date | None, Query()] = None,
) -> NotificationListOut:
    limit = clamp_limit(limit, cap=100)
    if kind is not None:
        kind = kind.strip().lower()
        if kind not in _VALID_KINDS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de notificação inválido.")

    base = _apply_list_filters(
        _user_notification_base(current_user),
        unread_only=unread_only,
        kind=kind,
        from_date=from_date,
        to_date=to_date,
    )

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    unread_count = _unread_count(db, current_user)

    rows = db.execute(
        base.options(*_notification_options())
        .order_by(UserNotification.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).scalars().all()

    return NotificationListOut(
        items=[NotificationOut.model_validate(row) for row in rows],
        total=total,
        unread_count=unread_count,
    )


@router.get("/kinds", response_model=dict[str, str], dependencies=_APP_ROLES)
def list_notification_kinds() -> dict[str, str]:
    return {
        NotificationKind.SERVICE_ORDER_CREATED.value: "Nova OS",
        NotificationKind.SERVICE_ORDER_SCHEDULED.value: "Agendamento",
        NotificationKind.SERVICE_ORDER_STARTED.value: "Em andamento",
        NotificationKind.SERVICE_ORDER_DONE.value: "Concluída",
        NotificationKind.SERVICE_ORDER_CANCELLED.value: "Cancelada",
        NotificationKind.BUDGET_APPROVED.value: "Orçamento",
        NotificationKind.FINANCE_PAYMENT_RECEIVED.value: "Financeiro",
        NotificationKind.WHATSAPP_SEND_FAILED.value: "WhatsApp",
        NotificationKind.PLATFORM_ANNOUNCEMENT.value: "Climaris",
        NotificationKind.SYSTEM.value: "Sistema",
    }


@router.get("/unread-count", response_model=NotificationUnreadCountOut, dependencies=_APP_ROLES)
def get_unread_count(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NotificationUnreadCountOut:
    return NotificationUnreadCountOut(unread_count=_unread_count(db, current_user))


@router.patch("/{notification_id}/read", response_model=NotificationOut, dependencies=_APP_ROLES)
def patch_notification_read(
    notification_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserNotification:
    notification = _get_user_notification(db, current_user=current_user, notification_id=notification_id)
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificação não encontrada.")
    mark_notification_read(db, notification=notification)
    db.commit()
    db.refresh(notification)
    return notification


@router.patch("/{notification_id}/unread", response_model=NotificationOut, dependencies=_APP_ROLES)
def patch_notification_unread(
    notification_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserNotification:
    notification = _get_user_notification(db, current_user=current_user, notification_id=notification_id)
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificação não encontrada.")
    mark_notification_unread(db, notification=notification)
    db.commit()
    db.refresh(notification)
    return notification


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=_APP_ROLES)
def delete_notification(
    notification_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    notification = _get_user_notification(db, current_user=current_user, notification_id=notification_id)
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificação não encontrada.")
    db.delete(notification)
    db.commit()


@router.post("/read-bulk", response_model=NotificationUnreadCountOut, dependencies=_APP_ROLES)
def post_notifications_read_bulk(
    payload: NotificationBulkIdsIn,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NotificationUnreadCountOut:
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(UserNotification).where(
            UserNotification.tenant_id == current_user.tenant_id,
            UserNotification.user_id == current_user.id,
            UserNotification.id.in_(payload.ids),
            UserNotification.read_at.is_(None),
        )
    ).scalars().all()
    for row in rows:
        row.read_at = now
    db.commit()
    return NotificationUnreadCountOut(unread_count=_unread_count(db, current_user))


@router.post("/delete-bulk", response_model=NotificationBulkDeleteOut, dependencies=_APP_ROLES)
def post_notifications_delete_bulk(
    payload: NotificationBulkIdsIn,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NotificationBulkDeleteOut:
    result = db.execute(
        delete(UserNotification).where(
            UserNotification.tenant_id == current_user.tenant_id,
            UserNotification.user_id == current_user.id,
            UserNotification.id.in_(payload.ids),
        )
    )
    db.commit()
    return NotificationBulkDeleteOut(deleted=result.rowcount or 0)


@router.post("/read-all", response_model=NotificationUnreadCountOut, dependencies=_APP_ROLES)
def post_notifications_read_all(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NotificationUnreadCountOut:
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(UserNotification).where(
            UserNotification.tenant_id == current_user.tenant_id,
            UserNotification.user_id == current_user.id,
            UserNotification.read_at.is_(None),
        )
    ).scalars().all()
    for row in rows:
        row.read_at = now
    db.commit()
    return NotificationUnreadCountOut(unread_count=0)
