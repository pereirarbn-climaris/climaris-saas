"""Filial/obra do cliente — helpers compartilhados."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Client, ClientSite


def get_client_for_tenant(db: Session, client_id: int, tenant_id: int) -> Client:
    client = db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")
    return client


def get_client_site_for_client(
    db: Session, *, site_id: int, client_id: int, tenant_id: int
) -> ClientSite:
    site = db.execute(
        select(ClientSite).where(
            ClientSite.id == site_id,
            ClientSite.client_id == client_id,
            ClientSite.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Filial/obra não encontrada.")
    return site


def validate_equipment_client_site(
    db: Session,
    *,
    client_site_id: int | None,
    client_id: int,
    tenant_id: int,
) -> None:
    if client_site_id is None:
        return
    get_client_site_for_client(db, site_id=client_site_id, client_id=client_id, tenant_id=tenant_id)


def format_client_site_address_line(site: ClientSite) -> str | None:
    parts = [
        site.street,
        site.number,
        site.complement,
        site.neighborhood,
        site.city,
        site.state,
    ]
    cleaned = [str(p).strip() for p in parts if p is not None and str(p).strip()]
    return ", ".join(cleaned) if cleaned else None


def format_client_address_line(client: Client) -> str | None:
    parts = [
        client.address_street,
        client.address_number,
        client.address_complement,
        client.address_district,
        client.address_city,
        client.address_state,
    ]
    cleaned = [str(p).strip() for p in parts if p is not None and str(p).strip()]
    return ", ".join(cleaned) if cleaned else None


def resolve_service_order_service_address(order: "ServiceOrder") -> str | None:
    from models import ServiceOrder

    if not isinstance(order, ServiceOrder):
        return None
    if order.client_site is not None:
        return format_client_site_address_line(order.client_site)
    if order.client is not None:
        return format_client_address_line(order.client)
    return None


def resolve_schedule_client_address(
    client: Client | None,
    *,
    service_order: "ServiceOrder | None" = None,
) -> str | None:
    """Endereço exibido na agenda: filial da OS, se houver; senão cadastro do cliente."""
    if service_order is not None:
        addr = resolve_service_order_service_address(service_order)
        if addr:
            return addr
    if client is not None:
        return format_client_address_line(client)
    return None
