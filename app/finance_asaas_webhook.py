"""Processamento de eventos JSON enviados pelo Asaas (pagamentos)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.finance_asaas_constants import ASAAS_FINANCE_EXTERNAL_REF_PREFIX
from models import FinanceEntry, FinanceEntryStatus, FinanceEntryType

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
