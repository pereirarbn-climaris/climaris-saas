from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.security import JWT_ALGORITHM, JWT_SECRET_KEY
from app.tenant_subscription import is_app_access_blocked
from models import Tenant, TenantStatus, User, UserRole


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

_API_V1_PREFIX = "/api/v1"
_SUBSCRIPTION_GATE_EXEMPT_PREFIXES = (
    "/auth/",
    "/billing/",
    "/webhooks/",
    "/platform/",
    "/public/",
)


def _subscription_gate_exempt(path: str) -> bool:
    if not path.startswith(_API_V1_PREFIX):
        return True
    rel = path[len(_API_V1_PREFIX) :]
    return rel.startswith(_SUBSCRIPTION_GATE_EXEMPT_PREFIXES)


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_error
    except jwt.InvalidTokenError as exc:
        raise credentials_error from exc

    user = db.execute(select(User).where(User.id == int(user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_error

    if not _subscription_gate_exempt(request.url.path):
        tenant = db.get(Tenant, user.tenant_id)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace não encontrado.")
        if tenant.status == TenantStatus.CANCELLED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace cancelado.")
        if tenant.status == TenantStatus.SUSPENDED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace suspenso.")
        if is_app_access_blocked(tenant):
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Acesso suspenso. Assine ou renove seu plano em Plano e assinatura para continuar.",
            )
    return user


def require_roles(*allowed_roles: UserRole):
    def role_checker(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions.")
        return current_user

    return role_checker


def require_platform_operator(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Apenas usuários com `is_platform_operator` (equipe Climaris / painel de operação)."""
    if not current_user.is_platform_operator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito à operação da plataforma.",
        )
    return current_user


def require_mercado_livre_marketplace(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Exige add-on `mercado_livre` ativo (Loja de integrações)."""
    from app.marketplace_util import tenant_has_marketplace_app

    if not tenant_has_marketplace_app(db, current_user.tenant_id, "mercado_livre"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Contrate a integração Mercado Livre na Loja de integrações para habilitar este módulo.",
        )
    return current_user
