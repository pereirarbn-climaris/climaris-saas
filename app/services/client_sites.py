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
