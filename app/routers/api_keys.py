"""Chaves de API por workspace (admin). O segredo só é retornado na criação."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.limiter import limiter
from app.schemas import TenantApiKeyCreateRequest, TenantApiKeyCreatedResponse, TenantApiKeyOut
from models import TenantApiKey, User, UserRole

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

_MAX_KEYS_PER_TENANT = 25
_KEY_PREFIX_LEN = 12


def _generate_secret() -> str:
    return "clm_" + secrets.token_urlsafe(32)


def _hash_secret(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def _display_prefix(plaintext: str) -> str:
    if len(plaintext) <= _KEY_PREFIX_LEN:
        return plaintext
    return plaintext[:_KEY_PREFIX_LEN]


@router.get("", response_model=list[TenantApiKeyOut])
def list_tenant_api_keys(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[TenantApiKey]:
    rows = (
        db.execute(
            select(TenantApiKey)
            .where(TenantApiKey.tenant_id == current_user.tenant_id)
            .order_by(TenantApiKey.id.desc())
            .offset(skip)
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return list(rows)


@router.post("", response_model=TenantApiKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_tenant_api_key(
    request: Request,
    payload: TenantApiKeyCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> TenantApiKeyCreatedResponse:
    count = db.execute(
        select(func.count()).select_from(TenantApiKey).where(
            TenantApiKey.tenant_id == current_user.tenant_id,
            TenantApiKey.revoked_at.is_(None),
        )
    ).scalar_one()
    if int(count or 0) >= _MAX_KEYS_PER_TENANT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limite de {_MAX_KEYS_PER_TENANT} chaves ativas por empresa. Revogue uma chave antes de criar outra.",
        )

    plaintext = _generate_secret()
    row = TenantApiKey(
        tenant_id=current_user.tenant_id,
        name=payload.name,
        key_prefix=_display_prefix(plaintext),
        key_hash=_hash_secret(plaintext),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return TenantApiKeyCreatedResponse(
        id=row.id,
        name=row.name,
        key_prefix=row.key_prefix,
        created_at=row.created_at,
        revoked_at=row.revoked_at,
        last_used_at=row.last_used_at,
        api_key=plaintext,
    )


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
def revoke_tenant_api_key(
    request: Request,
    key_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> None:
    row = db.execute(
        select(TenantApiKey).where(
            TenantApiKey.id == key_id,
            TenantApiKey.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chave não encontrada.")
    if row.revoked_at is not None:
        return None
    row.revoked_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    return None
