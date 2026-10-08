"""Processamento de eventos JSON enviados pelo Asaas (pagamentos)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.finance_asaas_constants import ASAAS_FINANCE_EXTERNAL_REF_PREFIX
from app.nfse_service import (
    NfseFactory,
    NfseIssueContext,
    get_or_create_nfse_settings,
    nfse_tax_codes_for_order,
    upsert_nfse_invoice,
)
from models import Client, FinanceEntry, FinanceEntryStatus, FinanceEntryType, ServiceOrder, ServiceOrderServiceItem, Tenant

logger = logging.getLogger("erp.finance.webhook")


def process_asaas_webhook_payload(db: Session, tenant_id: int, body: dict[str, Any]) -> dict[str, Any]:
    event = str(body.get("event") or "")
    payment = body.get("payment")
    if not isinstance(payment, dict):
        return {"received": True, "ignored": True, "reason": "no_payment"}

    if event in ("PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"):
        return _confirm_payment(db, tenant_id, payment)
    if event == "PAYMENT_OVERDUE":
        return _mark_overdue(db, tenant_id, payment)

    return {"received": True, "ignored": True, "event": event}


def _find_entry(
    db: Session,
    tenant_id: int,
    payment: dict[str, Any],
) -> FinanceEntry | None:
    pid = str(payment.get("id") or "").strip()[:48]
    ext = str(payment.get("externalReference") or "").strip()

    base = select(FinanceEntry).where(
        FinanceEntry.tenant_id == tenant_id,
        FinanceEntry.entry_type == FinanceEntryType.INCOME,
    )

    if pid:
        hit = db.execute(base.where(FinanceEntry.gateway_payment_id == pid)).scalar_one_or_none()
        if hit is not None:
            return hit

    if ext.startswith(ASAAS_FINANCE_EXTERNAL_REF_PREFIX):
        rest = ext[len(ASAAS_FINANCE_EXTERNAL_REF_PREFIX) :].strip()
        try:
            eid = int(rest)
            return db.execute(base.where(FinanceEntry.id == eid)).scalar_one_or_none()
        except ValueError:
            return None
    return None


def _confirm_payment(db: Session, tenant_id: int, payment: dict[str, Any]) -> dict[str, Any]:
    entry = _find_entry(db, tenant_id, payment)
    pid = str(payment.get("id") or "").strip()[:48]

    if entry is None:
        logger.info("Asaas webhook sem lançamento correspondente tenant=%s payment=%s", tenant_id, pid)
        return {"received": True, "matched": False}

    if entry.status == FinanceEntryStatus.PAID:
        return {"received": True, "matched": True, "entry_id": entry.id, "already_paid": True}

    entry.status = FinanceEntryStatus.PAID
    entry.paid_at = datetime.now(timezone.utc)
    if pid and not entry.gateway_payment_id:
        entry.gateway_payment_id = pid
    db.add(entry)
    db.commit()
    _try_auto_issue_nfse(db, tenant_id, entry)
    logger.info("Baixa automática Asaas entry_id=%s tenant=%s payment=%s", entry.id, tenant_id, pid)
    return {"received": True, "matched": True, "entry_id": entry.id}


def _mark_overdue(db: Session, tenant_id: int, payment: dict[str, Any]) -> dict[str, Any]:
    entry = _find_entry(db, tenant_id, payment)
    if entry is None:
        return {"received": True, "matched": False}
    if entry.status == FinanceEntryStatus.PAID:
        return {"received": True, "matched": True, "entry_id": entry.id, "skipped": "already_paid"}
    if entry.status != FinanceEntryStatus.PENDING:
        return {"received": True, "matched": True, "entry_id": entry.id, "skipped": entry.status.value}

    entry.status = FinanceEntryStatus.OVERDUE
    db.add(entry)
    db.commit()
    return {"received": True, "matched": True, "entry_id": entry.id, "status": "overdue"}


def _try_auto_issue_nfse(db: Session, tenant_id: int, entry: FinanceEntry) -> None:
    if entry.service_order_id is None:
        return
    try:
        settings = get_or_create_nfse_settings(db, tenant_id)
        if not settings.auto_issue_on_payment:
            return
        service_order = db.execute(
            select(ServiceOrder)
            .where(ServiceOrder.id == entry.service_order_id, ServiceOrder.tenant_id == tenant_id)
            .options(selectinload(ServiceOrder.service_items).selectinload(ServiceOrderServiceItem.service))
        ).scalar_one_or_none()
        if service_order is None:
            return
        client = db.execute(
            select(Client).where(Client.id == service_order.client_id, Client.tenant_id == tenant_id)
        ).scalar_one_or_none()
        tenant = db.get(Tenant, tenant_id)
        if client is None or tenant is None:
            return
        settings = get_or_create_nfse_settings(db, tenant_id)
        trib, nbs = nfse_tax_codes_for_order(
            service_order,
            default_tributacao=settings.default_codigo_tributacao_nacional,
            default_nbs=settings.default_codigo_nbs,
        )
        emitter = NfseFactory.build(settings, tenant)
        result = emitter.issue(
            NfseIssueContext(
                tenant=tenant,
                client=client,
                service_order=service_order,
                finance_entry=entry,
                amount=float(entry.amount),
                codigo_tributacao_nacional=trib,
                codigo_nbs=nbs,
            )
        )
        upsert_nfse_invoice(
            db,
            tenant_id=tenant_id,
            client_id=client.id,
            service_order_id=service_order.id,
            finance_entry_id=entry.id,
            amount=float(entry.amount),
            result=result,
        )
    except Exception:
        logger.exception("Falha ao emitir NFS-e automática tenant=%s entry=%s", tenant_id, entry.id)
