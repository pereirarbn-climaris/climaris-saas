from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from models import Budget, Client, Schedule, ServiceOrder


def strip_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def client_has_contact_condition() -> Any:
    return or_(
        and_(Client.email.is_not(None), Client.email != ""),
        and_(Client.phone.is_not(None), Client.phone != ""),
        and_(Client.whatsapp.is_not(None), Client.whatsapp != ""),
    )


def client_filter_conditions(
    tenant_id: int,
    q: str | None = None,
    tax_id_kind: str | None = None,
    contact: str | None = None,
    status_filter: str | None = None,
) -> list[Any]:
    conditions: list[Any] = [Client.tenant_id == tenant_id]
    q = (q or "").strip()
    if q:
        term = f"%{q}%"
        conditions.append(
            or_(
                Client.name.ilike(term),
                Client.document.ilike(term),
                Client.email.ilike(term),
                Client.phone.ilike(term),
                Client.whatsapp.ilike(term),
            )
        )
    if tax_id_kind:
        conditions.append(Client.tax_id_kind == tax_id_kind)
    if contact == "with":
        conditions.append(client_has_contact_condition())
    elif contact == "without":
        conditions.append(~client_has_contact_condition())
    if status_filter == "active":
        conditions.append(Client.is_active.is_(True))
    elif status_filter == "inactive":
        conditions.append(Client.is_active.is_(False))
    return conditions


def ensure_unique_client_contact(
    db: Session,
    *,
    tenant_id: int,
    field: str,
    value: str | None,
    client_id: int | None = None,
) -> None:
    if not value:
        return
    column = Client.phone if field == "phone" else Client.whatsapp
    label = "telefone" if field == "phone" else "WhatsApp"
    conditions = [Client.tenant_id == tenant_id, column == value]
    if client_id is not None:
        conditions.append(Client.id != client_id)
    existing = db.execute(select(Client).where(*conditions)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Já existe um cliente com este {label} nesta empresa.",
        )


def client_dependency_counts(db: Session, *, tenant_id: int, client_id: int) -> dict[str, int]:
    return {
        "ordens de serviço": db.execute(
            select(func.count())
            .select_from(ServiceOrder)
            .where(ServiceOrder.tenant_id == tenant_id, ServiceOrder.client_id == client_id)
        ).scalar_one(),
        "orçamentos": db.execute(
            select(func.count())
            .select_from(Budget)
            .where(Budget.tenant_id == tenant_id, Budget.client_id == client_id)
        ).scalar_one(),
        "agendamentos": db.execute(
            select(func.count())
            .select_from(Schedule)
            .where(Schedule.tenant_id == tenant_id, Schedule.client_id == client_id)
        ).scalar_one(),
    }
