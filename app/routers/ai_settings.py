from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.ai_assistant import available_ai_tools, execute_ai_tool_sandbox, normalize_tenant_model_slug
from app.schemas_ai import (
    AIChatHistoryOut,
    AISandboxToolOut,
    AISandboxToolRequest,
    TenantAISettingsOut,
    TenantAISettingsPatch,
    TenantAISettingsUpsert,
)
from app.config import CLAUDE_MODEL
from models import AIChatHistory, TenantAISettings, User, UserRole

router = APIRouter(prefix="/ai", tags=["ai"])


def _normalize_model_slug(value: str | None) -> str:
    return normalize_tenant_model_slug(value)


def _get_or_create_settings(db: Session, tenant_id: int) -> TenantAISettings:
    try:
        row = db.execute(
            select(TenantAISettings).where(TenantAISettings.tenant_id == tenant_id)
        ).scalar_one_or_none()
    except ProgrammingError as exc:
        if "tenant_ai_settings" in str(exc.orig) or "does not exist" in str(exc):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Tabelas de IA ainda não existem no banco. No servidor da API execute: "
                    "docker compose exec api alembic upgrade head"
                ),
            ) from exc
        raise
    if row is not None:
        return row
    row = TenantAISettings(
        tenant_id=tenant_id,
        agent_name="Assistente",
        tone_of_voice="amigavel",
        instructions=None,
        model_slug=CLAUDE_MODEL,
        is_enabled=True,
        ai_context_products=True,
        ai_context_service_prices=True,
        ai_context_services_catalog=True,
        ai_tool_billing=False,
        ai_tool_cancel=True,
        ai_tool_reschedule=True,
        ai_tool_agenda_read=True,
        ai_allow_direct_schedule=False,
        ai_allow_auto_client_create=False,
        ai_clarification_instructions=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get(
    "/settings",
    response_model=TenantAISettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def get_ai_settings(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TenantAISettings:
    row = _get_or_create_settings(db, current_user.tenant_id)
    normalized = normalize_tenant_model_slug(row.model_slug)
    if normalized != row.model_slug:
        row.model_slug = normalized
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.post(
    "/settings",
    response_model=TenantAISettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def create_or_replace_ai_settings(
    payload: TenantAISettingsUpsert,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TenantAISettings:
    row = _get_or_create_settings(db, current_user.tenant_id)
    row.agent_name = payload.agent_name
    row.tone_of_voice = payload.tone_of_voice
    row.instructions = payload.instructions
    row.model_slug = _normalize_model_slug(payload.model_slug)
    row.is_enabled = bool(payload.is_enabled)
    row.ai_context_products = bool(payload.ai_context_products)
    row.ai_context_service_prices = bool(payload.ai_context_service_prices)
    row.ai_context_services_catalog = bool(payload.ai_context_services_catalog)
    row.ai_tool_billing = bool(payload.ai_tool_billing)
    row.ai_tool_cancel = bool(payload.ai_tool_cancel)
    row.ai_tool_reschedule = bool(payload.ai_tool_reschedule)
    row.ai_tool_agenda_read = bool(payload.ai_tool_agenda_read)
    row.ai_allow_direct_schedule = bool(payload.ai_allow_direct_schedule)
    row.ai_allow_auto_client_create = bool(payload.ai_allow_auto_client_create)
    row.ai_clarification_instructions = payload.ai_clarification_instructions
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch(
    "/settings",
    response_model=TenantAISettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def patch_ai_settings(
    payload: TenantAISettingsPatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TenantAISettings:
    row = _get_or_create_settings(db, current_user.tenant_id)
    # Só campos enviados no JSON (permite instructions/model_slug null explícitos).
    data = payload.model_dump(exclude_unset=True)
    if "agent_name" in data and data["agent_name"] is not None:
        row.agent_name = data["agent_name"]
    if "tone_of_voice" in data and data["tone_of_voice"] is not None:
        row.tone_of_voice = data["tone_of_voice"]
    if "instructions" in data:
        row.instructions = data["instructions"]
    if "model_slug" in data:
        row.model_slug = _normalize_model_slug(data["model_slug"])
    if "is_enabled" in data and data["is_enabled"] is not None:
        row.is_enabled = bool(data["is_enabled"])
    if "ai_context_products" in data and data["ai_context_products"] is not None:
        row.ai_context_products = bool(data["ai_context_products"])
    if "ai_context_service_prices" in data and data["ai_context_service_prices"] is not None:
        row.ai_context_service_prices = bool(data["ai_context_service_prices"])
    if "ai_context_services_catalog" in data and data["ai_context_services_catalog"] is not None:
        row.ai_context_services_catalog = bool(data["ai_context_services_catalog"])
    if "ai_tool_billing" in data and data["ai_tool_billing"] is not None:
        row.ai_tool_billing = bool(data["ai_tool_billing"])
    if "ai_tool_cancel" in data and data["ai_tool_cancel"] is not None:
        row.ai_tool_cancel = bool(data["ai_tool_cancel"])
    if "ai_tool_reschedule" in data and data["ai_tool_reschedule"] is not None:
        row.ai_tool_reschedule = bool(data["ai_tool_reschedule"])
    if "ai_tool_agenda_read" in data and data["ai_tool_agenda_read"] is not None:
        row.ai_tool_agenda_read = bool(data["ai_tool_agenda_read"])
    if "ai_allow_direct_schedule" in data and data["ai_allow_direct_schedule"] is not None:
        row.ai_allow_direct_schedule = bool(data["ai_allow_direct_schedule"])
    if "ai_allow_auto_client_create" in data and data["ai_allow_auto_client_create"] is not None:
        row.ai_allow_auto_client_create = bool(data["ai_allow_auto_client_create"])
    if "ai_clarification_instructions" in data:
        row.ai_clarification_instructions = data["ai_clarification_instructions"]
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/settings",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def reset_ai_settings(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    row = db.execute(
        select(TenantAISettings).where(TenantAISettings.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if row is None:
        return None
    db.delete(row)
    db.commit()
    return None


@router.get(
    "/history",
    response_model=list[AIChatHistoryOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def list_ai_history(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    skip: Annotated[int, Query(ge=0)] = 0,
) -> list[AIChatHistory]:
    try:
        rows = db.execute(
            select(AIChatHistory)
            .where(AIChatHistory.tenant_id == current_user.tenant_id)
            .order_by(AIChatHistory.created_at.desc(), AIChatHistory.id.desc())
            .offset(skip)
            .limit(limit)
        ).scalars().all()
    except ProgrammingError as exc:
        if "ai_chat_history" in str(exc) or "does not exist" in str(exc):
            return []
        raise
    return rows


@router.get(
    "/tools",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def list_ai_tools(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[dict]:
    return available_ai_tools(db, tenant_id=current_user.tenant_id)


@router.post(
    "/tools/sandbox",
    response_model=AISandboxToolOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def sandbox_ai_tool(
    payload: AISandboxToolRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> AISandboxToolOut:
    result = execute_ai_tool_sandbox(
        db,
        tenant_id=current_user.tenant_id,
        tool_name=payload.tool_name,
        arguments=payload.arguments,
    )
    return AISandboxToolOut(
        tool_name=payload.tool_name,
        arguments=payload.arguments,
        result=result,
    )
