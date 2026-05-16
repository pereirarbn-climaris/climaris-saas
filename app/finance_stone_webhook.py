"""Processamento de webhooks Pagar.me (Stone) → lançamento financeiro pago."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.finance_stone_constants import STONE_FINANCE_EXTERNAL_REF_PREFIX
from app.security import decrypt_platform_secret
from app.stone_pagarme_client import fetch_pagarme_order
from models import FinanceEntry, FinanceEntryStatus, FinanceEntryType, FinanceGatewayProvider, TenantFinanceGateway

logger = logging.getLogger("erp.finance.stone_webhook")


def resolve_stone_gateway_by_path_token(db: Session, path_token: str) -> TenantFinanceGateway | None:
    t = (path_token or "").strip()
    if len(t) < 8:
        return None
    return db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.provider == FinanceGatewayProvider.STONE,
            TenantFinanceGateway.stone_webhook_path_token == t,
        )
    ).scalar_one_or_none()


def _webhook_order_id(body: dict[str, Any]) -> str | None:
    """Extrai id do pedido Pagar.me a partir do payload do webhook (formatos comuns)."""
    data = body.get("data")
    if not isinstance(data, dict):
        return None
    if isinstance(data.get("charges"), list) and data.get("id"):
        return str(data["id"]).strip() or None
    oid = data.get("id")
    if oid:
        s = str(oid).strip()
        if s.startswith("or_"):
            return s
    order_inner = data.get("order")
    if isinstance(order_inner, dict) and order_inner.get("id"):
        return str(order_inner["id"]).strip() or None
    if data.get("order_id"):
        return str(data["order_id"]).strip() or None
    return None


def _find_entry_for_order(db: Session, tenant_id: int, order: dict[str, Any]) -> FinanceEntry | None:
    base = select(FinanceEntry).where(
        FinanceEntry.tenant_id == tenant_id,
        FinanceEntry.entry_type == FinanceEntryType.INCOME,
    )
    oid = str(order.get("id") or "").strip()[:64]
    if oid:
        hit = db.execute(base.where(FinanceEntry.gateway_payment_id == oid)).scalar_one_or_none()
        if hit is not None:
            return hit
    code = str(order.get("code") or "").strip()
    if code.startswith(STONE_FINANCE_EXTERNAL_REF_PREFIX):
        rest = code[len(STONE_FINANCE_EXTERNAL_REF_PREFIX) :].strip()
        try:
            eid = int(rest)
            return db.execute(base.where(FinanceEntry.id == eid)).scalar_one_or_none()
        except ValueError:
            pass
    meta = order.get("metadata")
    if isinstance(meta, dict):
        raw = meta.get("climaris_finance_entry_id")
        if raw is not None:
            try:
                eid = int(str(raw).strip())
                return db.execute(base.where(FinanceEntry.id == eid)).scalar_one_or_none()
            except ValueError:
                pass
    return None


def _order_is_paid(order: dict[str, Any]) -> bool:
    st = str(order.get("status") or "").strip().lower()
    if st == "paid":
        return True
    for ch in order.get("charges") or []:
        if not isinstance(ch, dict):
            continue
        cst = str(ch.get("status") or "").strip().lower()
        if cst == "paid":
            return True
        lt = ch.get("last_transaction")
        if isinstance(lt, dict):
            tst = str(lt.get("status") or "").strip().lower()
            if tst in ("paid", "captured", "authorized"):
                return True
    return False


def process_stone_webhook_payload(db: Session, row: TenantFinanceGateway, body: dict[str, Any]) -> dict[str, Any]:
    event_type = str(body.get("type") or "").strip().lower()
    if not event_type:
        return {"received": True, "ignored": True, "reason": "no_type"}

    if not row.stone_secret_key_encrypted:
        return {"received": True, "ignored": True, "reason": "no_secret"}

    if not event_type.endswith(".paid") and event_type not in ("order.paid", "charge.paid", "invoice.paid"):
        return {"received": True, "ignored": True, "reason": "event_not_handled", "type": event_type}

    order_id = _webhook_order_id(body)
    if not order_id:
        return {"received": True, "ignored": True, "reason": "no_order_id", "type": event_type}

    try:
        sk = decrypt_platform_secret(row.stone_secret_key_encrypted)
    except Exception:
        logger.exception("Stone webhook: falha ao decifrar secret tenant=%s", row.tenant_id)
        return {"received": False, "error": "decrypt"}

    ok, err, order = fetch_pagarme_order(secret_key=sk, order_id=order_id)
    if not ok or not isinstance(order, dict):
        logger.warning("Stone webhook: fetch order falhou tenant=%s err=%s", row.tenant_id, err)
        return {"received": True, "ignored": True, "reason": "fetch_order_failed", "error": err}

    if not _order_is_paid(order):
        return {"received": True, "ignored": True, "reason": "not_paid_yet", "order_id": order_id}

    entry = _find_entry_for_order(db, row.tenant_id, order)
    if entry is None:
        return {"received": True, "ignored": True, "reason": "entry_not_found", "order_id": order_id}

    oid = str(order.get("id") or "").strip()[:64]
    if oid:
        entry.gateway_payment_id = oid
    entry.payment_provider = "stone"
    pm = (entry.payment_method or "").strip().lower() or "pix"
    entry.payment_method = pm if pm else "pix"

    if entry.status != FinanceEntryStatus.PAID:
        entry.status = FinanceEntryStatus.PAID
        entry.paid_at = datetime.now(timezone.utc)
        acc_id = row.stone_finance_bank_account_id
        if acc_id is not None:
            entry.finance_account_id = acc_id
        db.add(entry)

    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"received": True, "matched": True, "entry_id": entry.id, "order_id": order_id}
