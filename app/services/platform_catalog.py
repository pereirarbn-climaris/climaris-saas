from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import PLATFORM_OPERATOR_EMAIL
from models import User


def get_platform_catalog_tenant_id(db: Session) -> int:
    """
    Tenant dono do catálogo global de equipamentos (cadastro em /operacao/catalogo).
    Todos os workspaces leem modelos deste tenant.
    """
    user = db.execute(
        select(User).where(
            User.email == PLATFORM_OPERATOR_EMAIL,
            User.is_platform_operator.is_(True),
        )
    ).scalar_one_or_none()
    if user is not None:
        return user.tenant_id

    fallback = db.execute(
        select(User)
        .where(User.is_platform_operator.is_(True))
        .order_by(User.id.asc())
        .limit(1)
    ).scalar_one_or_none()
    if fallback is not None:
        return fallback.tenant_id

    raise RuntimeError(
        "Catálogo global: nenhum usuário is_platform_operator encontrado. "
        "Configure PLATFORM_OPERATOR_EMAIL ou um operador da plataforma."
    )


def resolve_catalog_list_tenant_id(db: Session, current_user: User) -> int:
    """Listagem: todos os tenants veem o catálogo global da plataforma."""
    return get_platform_catalog_tenant_id(db)


def resolve_catalog_write_tenant_id(db: Session, current_user: User) -> int:
    """Cadastro pelo painel /operacao usa o tenant global da plataforma."""
    if current_user.is_platform_operator:
        return current_user.tenant_id
    return get_platform_catalog_tenant_id(db)


def catalog_tenant_ids_for_lookup(db: Session, workspace_tenant_id: int) -> tuple[int, ...]:
    """IDs de tenant aceitos ao vincular um modelo do catálogo a um cliente."""
    platform_tid = get_platform_catalog_tenant_id(db)
    if workspace_tenant_id == platform_tid:
        return (platform_tid,)
    return (workspace_tenant_id, platform_tid)
