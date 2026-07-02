"""Avisos da plataforma para todos os workspaces (operador SaaS)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import require_platform_operator
from app.notifications import broadcast_platform_announcement
from app.pagination import clamp_limit
from app.platform_broadcast_audiences import AUDIENCE_LABELS, preview_broadcast_audience, validate_audience
from app.schemas import (
    PlatformNotificationAudiencePreviewOut,
    PlatformNotificationBroadcastCreate,
    PlatformNotificationBroadcastOut,
)
from models import PlatformNotificationBroadcast, User

router = APIRouter(prefix="/platform/notifications", tags=["platform-notifications"])


def _broadcast_options():
    return (selectinload(PlatformNotificationBroadcast.created_by_user),)


@router.get("/audiences", response_model=dict[str, str])
def list_platform_broadcast_audiences(
    _: Annotated[User, Depends(require_platform_operator)],
) -> dict[str, str]:
    return dict(AUDIENCE_LABELS)


@router.get("/audience-preview", response_model=PlatformNotificationAudiencePreviewOut)
def get_platform_broadcast_audience_preview(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_platform_operator)],
    audience: Annotated[str, Query()] = "all",
) -> PlatformNotificationAudiencePreviewOut:
    try:
        payload = preview_broadcast_audience(db, audience)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return PlatformNotificationAudiencePreviewOut(**payload)


@router.get("/broadcasts", response_model=list[PlatformNotificationBroadcastOut])
def list_platform_broadcasts(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_platform_operator)],
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[PlatformNotificationBroadcast]:
    limit = clamp_limit(limit, cap=100)
    return list(
        db.execute(
            select(PlatformNotificationBroadcast)
            .options(*_broadcast_options())
            .order_by(PlatformNotificationBroadcast.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        .scalars()
        .all()
    )


@router.post(
    "/broadcast",
    response_model=PlatformNotificationBroadcastOut,
    status_code=status.HTTP_201_CREATED,
)
def post_platform_broadcast(
    payload: PlatformNotificationBroadcastCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformNotificationBroadcast:
    try:
        try:
            audience = validate_audience(payload.audience)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        broadcast = broadcast_platform_announcement(
            db,
            title=payload.title,
            body=payload.body,
            link_path=payload.link_path,
            actor_user_id=current_user.id,
            audience=audience,
        )
        db.commit()
        db.refresh(broadcast)
        row = db.execute(
            select(PlatformNotificationBroadcast)
            .where(PlatformNotificationBroadcast.id == broadcast.id)
            .options(*_broadcast_options())
        ).scalar_one()
        return row
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise
