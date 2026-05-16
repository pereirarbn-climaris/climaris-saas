"""Cliente da OS vinculada ao lançamento → dados para Pagar.me (pré-preenchimento e merge no servidor)."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Client, FinanceEntry, ServiceOrder


def _digits_only(s: str) -> str:
    return "".join(c for c in (s or "") if c.isdigit())


def batch_linked_payers_by_service_order_ids(
    db: Session,
    *,
    tenant_id: int,
    service_order_ids: set[int],
) -> dict[int, dict[str, str | None]]:
    """Por `service_order_id`: e-mail, nome e CPF/CNPJ (somente dígitos) do cliente da OS."""
    if not service_order_ids:
        return {}
    rows = db.execute(
        select(ServiceOrder.id, Client.email, Client.name, Client.document)
        .select_from(ServiceOrder)
        .join(Client, Client.id == ServiceOrder.client_id)
        .where(
            ServiceOrder.tenant_id == tenant_id,
            ServiceOrder.id.in_(service_order_ids),
            Client.tenant_id == tenant_id,
        )
    ).all()
    out: dict[int, dict[str, str | None]] = {}
    for so_id, email, name, doc in rows:
        digits = _digits_only(doc or "")
        doc_ok = digits if len(digits) in (11, 14) else None
        out[int(so_id)] = {
            "email": (email or "").strip() or None,
            "name": (name or "").strip() or None,
            "document": doc_ok,
        }
    return out


def linked_payer_for_entry(db: Session, tenant_id: int, entry: FinanceEntry) -> dict[str, str | None] | None:
    if entry.service_order_id is None:
        return None
    m = batch_linked_payers_by_service_order_ids(db, tenant_id=tenant_id, service_order_ids={int(entry.service_order_id)})
    return m.get(int(entry.service_order_id))


def merge_stone_payer_contact(
    *,
    linked: dict[str, str | None] | None,
    customer_email: str | None,
    customer_name: str | None,
    payer_document: str | None,
) -> tuple[str, str, str]:
    """
    Mescla payload da cobrança com dados do cliente da OS.
    Retorna (email, nome, documento_só_dígitos ou string vazia).
    """
    L = linked or {}
    email = (str(customer_email).strip() if customer_email else "") or (L.get("email") or "").strip()
    if not email or "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe o e-mail do pagador ou cadastre e-mail no cliente da ordem de serviço vinculada ao lançamento.",
        )
    name = (str(customer_name).strip() if customer_name else "") or (L.get("name") or "").strip() or email.split("@", 1)[0]
    raw_doc = str(payer_document).strip() if payer_document else ""
    d_pay = _digits_only(raw_doc)
    if len(d_pay) in (11, 14):
        doc = d_pay
    elif L.get("document"):
        doc = str(L["document"])
    else:
        doc = ""
    return email, name, doc
