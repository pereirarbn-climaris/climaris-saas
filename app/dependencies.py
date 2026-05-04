from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.security import JWT_ALGORITHM, JWT_SECRET_KEY
from models import User, UserRole


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
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
