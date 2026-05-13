"""Processamento de notificações Mercado Pago (pagamentos → financeiro)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.finance_mercadopago_constants import MERCADOPAGO_FINANCE_EXTERNAL_REF_PREFIX
from app.finance_mercadopago_service import sync_mercadopago_balance_snapshot
from app.mercadopago_client import (
    fetch_mercadopago_merchant_order,
    fetch_mercadopago_payment,
    fetch_mercadopago_preapproval,
    search_mercadopago_payments_by_external_reference,
)
from app.security import decrypt_platform_secret
from models import FinanceEntry, FinanceEntryStatus, FinanceEntryType, FinanceGatewayProvider, TenantFinanceGateway

logger = logging.getLogger("erp.finance.mp_webhook")


def _payment_preference_id_candidates(payment: dict[str, Any]) -> list[str]:
    """Possíveis ids de preferência de checkout no JSON de GET /v1/payments/{id} (varia por produto/versão)."""
    found: list[str] = []

    def push(v: object) -> None:
        if v is None:
            return
        s = str(v).strip()
        if not s:
            return
        if len(s) > 48:
            s = s[:48]
        if s not in found:
            found.append(s)

    push(payment.get("preference_id"))
    meta = payment.get("metadata")
    if isinstance(meta, dict):
        push(meta.get("preference_id"))
        push(meta.get("preferenceId"))
        push(meta.get("checkout_preference_id"))
    return found


def _payment_preapproval_id_candidates(payment: dict[str, Any]) -> list[str]:
    """Ids de preapproval/assinatura em GET /v1/payments/{id} (cobranças recorrentes)."""
    found: list[str] = []

    def push(v: object) -> None:
        if v is None:
            return
        s = str(v).strip()
        if not s:
            return
        if len(s) > 48:
            s = s[:48]
        if s not in found:
            found.append(s)

    push(payment.get("preapproval_id"))
    meta = payment.get("metadata")
    if isinstance(meta, dict):
        push(meta.get("preapproval_id"))
        push(meta.get("preapprovalId"))
    return found


def _notification_entity_type(body: dict[str, Any]) -> str:
    raw = body.get("type") or body.get("topic") or ""
    return str(raw).strip().lower()


def _find_entry(db: Session, tenant_id: int, payment: dict[str, Any]) -> FinanceEntry | None:
    pid = str(payment.get("id") or "").strip()[:48]
    ext = str(payment.get("external_reference") or "").strip()

    base = select(FinanceEntry).where(
        FinanceEntry.tenant_id == tenant_id,
        FinanceEntry.entry_type == FinanceEntryType.INCOME,
    )

    if pid:
        hit = db.execute(base.where(FinanceEntry.gateway_payment_id == pid)).scalar_one_or_none()
        if hit is not None:
            return hit

    if ext.startswith(MERCADOPAGO_FINANCE_EXTERNAL_REF_PREFIX):
        rest = ext[len(MERCADOPAGO_FINANCE_EXTERNAL_REF_PREFIX) :].strip()
        try:
            eid = int(rest)
            hit = db.execute(base.where(FinanceEntry.id == eid)).scalar_one_or_none()
            if hit is not None:
                return hit
        except ValueError:
            pass

    meta = payment.get("metadata")
    if isinstance(meta, dict):
        raw_eid = meta.get("climaris_finance_entry_id")
        if raw_eid is not None:
            try:
                eid = int(str(raw_eid).strip())
                return db.execute(base.where(FinanceEntry.id == eid)).scalar_one_or_none()
            except ValueError:
                pass

    for pref in _payment_preference_id_candidates(payment):
        if not pref:
            continue
        hit = db.execute(base.where(FinanceEntry.gateway_preference_id == pref)).scalar_one_or_none()
        if hit is not None:
            return hit
    for pa in _payment_preapproval_id_candidates(payment):
        if not pa:
            continue
        hit = db.execute(base.where(FinanceEntry.mercadopago_preapproval_id == pa)).scalar_one_or_none()
        if hit is not None:
            return hit
    return None


def _find_entry_from_subscription_doc(db: Session, tenant_id: int, doc: dict[str, Any]) -> FinanceEntry | None:
    """Localiza lançamento a partir do JSON de GET /preapproval/{id} (external_reference / metadata)."""
    ext = str(doc.get("external_reference") or "").strip()
    base = select(FinanceEntry).where(
        FinanceEntry.tenant_id == tenant_id,
        FinanceEntry.entry_type == FinanceEntryType.INCOME,
    )
    if ext.startswith(MERCADOPAGO_FINANCE_EXTERNAL_REF_PREFIX):
        rest = ext[len(MERCADOPAGO_FINANCE_EXTERNAL_REF_PREFIX) :].strip()
        try:
            eid = int(rest)
            hit = db.execute(base.where(FinanceEntry.id == eid)).scalar_one_or_none()
            if hit is not None:
                return hit
        except ValueError:
            pass
    meta = doc.get("metadata")
    if isinstance(meta, dict):
        raw_eid = meta.get("climaris_finance_entry_id")
        if raw_eid is not None:
            try:
                eid = int(str(raw_eid).strip())
                hit = db.execute(base.where(FinanceEntry.id == eid)).scalar_one_or_none()
                if hit is not None:
                    return hit
            except ValueError:
                pass
    pa_id = str(doc.get("id") or "").strip()[:48]
    if pa_id:
        hit = db.execute(base.where(FinanceEntry.mercadopago_preapproval_id == pa_id)).scalar_one_or_none()
        if hit is not None:
            return hit
    return None


def _apply_preapproval_status_to_entry(
    db: Session, row: TenantFinanceGateway, entry: FinanceEntry, doc: dict[str, Any], *, commit: bool
) -> dict[str, Any]:
    """Atualiza lançamento quando a assinatura (preapproval) é cancelada antes de pagamento."""
    status = str(doc.get("status") or "").strip().lower()
    out: dict[str, Any] = {"received": True, "matched": True, "entry_id": entry.id, "preapproval_status": status}
    pa_id = str(doc.get("id") or "").strip()[:48]
    if pa_id:
        entry.mercadopago_preapproval_id = pa_id
        db.add(entry)
        out["preapproval_id_persisted"] = True
    if status in ("cancelled", "canceled") and entry.status == FinanceEntryStatus.PENDING:
        if not (entry.gateway_payment_id or "").strip():
            entry.status = FinanceEntryStatus.CANCELLED
            db.add(entry)
            out["entry_updated"] = "cancelled"
    if commit:
        try:
            sync_mercadopago_balance_snapshot(db, row)
            db.commit()
        except Exception:
            db.rollback()
            raise
    return out


def _resolve_subscription_notification(
    db: Session,
    row: TenantFinanceGateway,
    access_token: str,
    resource_id: str,
    entity_type: str,
) -> dict[str, Any]:
    """
    Notificações de assinatura: tenta preapproval; se não for, trata resource_id como pagamento.
    """
    rid = (resource_id or "").strip()
    if not rid:
        return {"received": True, "ignored": True, "reason": "no_resource_id", "type": entity_type}

    ok_pre, err_pre, doc = fetch_mercadopago_preapproval(access_token=access_token, preapproval_id=rid)
    if ok_pre and isinstance(doc, dict):
        entry = _find_entry_from_subscription_doc(db, row.tenant_id, doc)
        if entry is None:
            try:
                sync_mercadopago_balance_snapshot(db, row)
                db.commit()
            except Exception:
                db.rollback()
            return {
                "received": True,
                "matched": False,
                "notification": entity_type,
                "reason": "no_entry_match",
                "preapproval_id": rid,
            }
        out = _apply_preapproval_status_to_entry(db, row, entry, doc, commit=True)
        return {**out, "notification": entity_type, "preapproval_id": rid}

    ok_pay, err_pay, payment = fetch_mercadopago_payment(access_token=access_token, payment_id=rid)
    if ok_pay and payment is not None:
        out = _apply_payment_settlement(db, row, payment)
        return {**out, "notification": entity_type, "via": "payment_fallback", "payment_error": err_pre or err_pay}

    try:
        sync_mercadopago_balance_snapshot(db, row)
        db.commit()
    except Exception:
        db.rollback()
    return {
        "received": True,
        "matched": False,
        "notification": entity_type,
        "error": err_pre or err_pay,
        "resource_id": rid,
    }


def _payment_belongs_to_tenant(payment: dict[str, Any], expected_mp_user_id: str | None) -> bool:
    if not expected_mp_user_id:
        return True
    collector = payment.get("collector_id")
    if collector is None:
        return True
    return str(collector).strip() == str(expected_mp_user_id).strip()


def _mp_payment_sort_key(stub: dict[str, Any]) -> tuple[int, int]:
    st = str(stub.get("status") or "").strip().lower()
    if st in ("approved", "accredited"):
        rank = 0
    elif st in ("pending", "in_process", "in_mediation", "authorized"):
        rank = 1
    else:
        rank = 2
    try:
        pid = int(float(stub.get("id")))
    except (TypeError, ValueError):
        pid = 0
    return (rank, -pid)


def _apply_payment_settlement(
    db: Session, row: TenantFinanceGateway, payment: dict[str, Any], *, commit: bool = True
) -> dict[str, Any]:
    """Atualiza lançamento a partir do JSON de GET /v1/payments/{id}. Com commit=True, persiste + sync de saldo."""
    pid = str(payment.get("id") or "").strip()
    expected_uid = (row.mercadopago_mp_user_id or "").strip() or None
    if not _payment_belongs_to_tenant(payment, expected_uid):
        logger.warning("MP webhook: collector divergente payment=%s tenant=%s", pid, row.tenant_id)
        return {"received": True, "matched": False, "reason": "collector_mismatch", "payment_id": pid}

    status = str(payment.get("status") or "").strip().lower()
    entry = _find_entry(db, row.tenant_id, payment)
    now = datetime.now(timezone.utc)

    if entry is None:
        logger.info("MP webhook sem lançamento tenant=%s payment=%s status=%s", row.tenant_id, pid, status)
        if commit:
            try:
                sync_mercadopago_balance_snapshot(db, row)
                db.commit()
            except Exception:
                db.rollback()
        return {"received": True, "matched": False, "payment_status": status, "payment_id": pid}

    if status in ("approved", "accredited"):
        for pa in _payment_preapproval_id_candidates(payment):
            if pa:
                entry.mercadopago_preapproval_id = pa[:48]
                break
        entry.mp_reversal_at = None
        entry.mp_reversal_status = None
        if entry.status == FinanceEntryStatus.PAID:
            db.add(entry)
            out = {"received": True, "matched": True, "entry_id": entry.id, "already_paid": True}
        else:
            entry.status = FinanceEntryStatus.PAID
            entry.paid_at = now
            if pid and not entry.gateway_payment_id:
                entry.gateway_payment_id = pid[:48]
            pref = (entry.gateway_preference_id or "").strip()
            if pref:
                entry.mercadopago_archived_preference_id = pref[:48]
            entry.gateway_preference_id = None
            db.add(entry)
            out = {"received": True, "matched": True, "entry_id": entry.id}
    elif status in ("charged_back", "reverted"):
        if entry.status == FinanceEntryStatus.PAID:
            entry.status = FinanceEntryStatus.OVERDUE
            entry.paid_at = None
            entry.mp_reversal_at = now
            entry.mp_reversal_status = status
            db.add(entry)
            out = {"received": True, "matched": True, "entry_id": entry.id, "payment_reversal": status}
        else:
            out = {"received": True, "matched": True, "entry_id": entry.id, "skipped": status}
    elif status == "partially_refunded":
        if entry.status == FinanceEntryStatus.PAID:
            entry.mp_reversal_at = now
            entry.mp_reversal_status = "partially_refunded"
            db.add(entry)
            out = {"received": True, "matched": True, "entry_id": entry.id, "partial_refund": True}
        else:
            out = {"received": True, "matched": True, "entry_id": entry.id, "skipped": status}
    elif status == "refunded":
        if entry.status == FinanceEntryStatus.PAID:
            entry.status = FinanceEntryStatus.OVERDUE
            entry.paid_at = None
            entry.mp_reversal_at = now
            entry.mp_reversal_status = "refunded"
            db.add(entry)
            out = {"received": True, "matched": True, "entry_id": entry.id, "payment_reversal": "refunded"}
        else:
            entry.status = FinanceEntryStatus.CANCELLED
            db.add(entry)
            out = {"received": True, "matched": True, "entry_id": entry.id, "status": "cancelled"}
    elif status in ("rejected", "cancelled"):
        if entry.status == FinanceEntryStatus.PAID:
            out = {"received": True, "matched": True, "entry_id": entry.id, "skipped": "already_paid"}
        else:
            entry.status = FinanceEntryStatus.CANCELLED
            db.add(entry)
            out = {"received": True, "matched": True, "entry_id": entry.id, "status": "cancelled"}
    elif status in ("pending", "in_process") or (status == "in_mediation" and entry.status != FinanceEntryStatus.PAID):
        out = {"received": True, "matched": True, "entry_id": entry.id, "pending": True}
    elif status == "in_mediation" and entry.status == FinanceEntryStatus.PAID:
        entry.mp_reversal_at = now
        entry.mp_reversal_status = "in_mediation"
        db.add(entry)
        out = {"received": True, "matched": True, "entry_id": entry.id, "contested": True, "pending": True}
    else:
        out = {"received": True, "matched": True, "entry_id": entry.id, "ignored_status": status}

    if commit:
        try:
            sync_mercadopago_balance_snapshot(db, row)
            db.commit()
        except Exception:
            db.rollback()
            raise
    return out


def _try_settle_from_payment_id_docs(
    db: Session,
    row: TenantFinanceGateway,
    access_token: str,
    id_docs: list[dict[str, Any]],
    order_ref: str,
) -> tuple[dict[str, Any] | None, str | None, dict[str, Any] | None]:
    """
    id_docs: itens com `id` de pagamento (merchant_order.payments ou /v1/payments/search).
    Retorna (payload de sucesso se houve match, último erro de fetch, última tentativa de liquidação).
    """
    docs = sorted(
        [d for d in id_docs if isinstance(d, dict) and d.get("id") is not None],
        key=_mp_payment_sort_key,
    )
    last_fetch_error: str | None = None
    last_attempt: dict[str, Any] | None = None
    for stub in docs:
        pay_id = str(stub.get("id")).strip()
        ok_p, err_p, payment = fetch_mercadopago_payment(access_token=access_token, payment_id=pay_id)
        if not ok_p or payment is None:
            last_fetch_error = err_p
            continue
        if order_ref and not str(payment.get("external_reference") or "").strip():
            payment = dict(payment)
            payment["external_reference"] = order_ref
        out = _apply_payment_settlement(db, row, payment, commit=False)
        last_attempt = out
        if out.get("matched"):
            return out, last_fetch_error, last_attempt
    return None, last_fetch_error, last_attempt


def _commit_merchant_order_success(out: dict[str, Any], db: Session, row: TenantFinanceGateway, oid: str) -> dict[str, Any]:
    try:
        sync_mercadopago_balance_snapshot(db, row)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {**out, "notification": "merchant_order", "merchant_order_id": oid}


def process_mercadopago_webhook_payload(db: Session, row: TenantFinanceGateway, body: dict[str, Any]) -> dict[str, Any]:
    """
    body: notificação application (type/topic + data.id) ou IPN legado com topic.
    - payment: data.id = payment id
    - merchant_order: data.id = merchant order id (Checkout Pro)
    - subscription_authorized_payment: data.id = payment id (cada cobrança da assinatura)
    - subscription / subscription_preapproval / mp_subscription: data.id = preapproval (ou fallback para payment)
    - subscription_preapproval_plan / plan: apenas sincroniza saldo (sem lançamento)
    """
    if not row.mercadopago_access_token_encrypted:
        return {"received": True, "ignored": True, "reason": "no_credentials"}

    try:
        access_token = decrypt_platform_secret(row.mercadopago_access_token_encrypted)
    except Exception:
        logger.exception("Falha ao decifrar token MP tenant=%s", row.tenant_id)
        return {"received": True, "ignored": True, "reason": "decrypt"}

    entity_type = _notification_entity_type(body)
    data = body.get("data")
    if not isinstance(data, dict):
        return {"received": True, "ignored": True, "reason": "no_data"}

    resource_id = data.get("id")
    if resource_id is None:
        return {"received": True, "ignored": True, "reason": "no_resource_id"}

    if entity_type == "payment":
        pid = str(resource_id).strip()
        ok_pay, err_pay, payment = fetch_mercadopago_payment(access_token=access_token, payment_id=pid)
        if not ok_pay or payment is None:
            logger.warning("MP webhook: não obteve pagamento %s tenant=%s: %s", pid, row.tenant_id, err_pay)
            return {"received": True, "matched": False, "error": err_pay}
        out = _apply_payment_settlement(db, row, payment)
        return {**out, "notification": "payment"}

    if entity_type in ("merchant_order", "mp_merchant_order"):
        oid = str(resource_id).strip()
        ok_ord, err_ord, order = fetch_mercadopago_merchant_order(access_token=access_token, order_id=oid)
        if not ok_ord or order is None:
            logger.warning("MP webhook: merchant_order %s tenant=%s: %s", oid, row.tenant_id, err_ord)
            return {"received": True, "matched": False, "error": err_ord, "merchant_order_id": oid}

        order_ref = str(order.get("external_reference") or "").strip()
        pay_list = order.get("payments")
        stubs: list[dict[str, Any]] = []
        if isinstance(pay_list, list):
            stubs = [p for p in pay_list if isinstance(p, dict) and p.get("id") is not None]

        matched, last_fetch_error, last_attempt = _try_settle_from_payment_id_docs(
            db, row, access_token, stubs, order_ref
        )
        if matched is not None:
            return _commit_merchant_order_success(matched, db, row, oid)

        had_payment_ids = bool(stubs)
        if order_ref:
            ok_s, err_s, search_hits = search_mercadopago_payments_by_external_reference(
                access_token=access_token, external_reference=order_ref
            )
            if not ok_s:
                last_fetch_error = last_fetch_error or err_s
            elif search_hits:
                had_payment_ids = True
                matched_s, err2, att2 = _try_settle_from_payment_id_docs(
                    db, row, access_token, search_hits, order_ref
                )
                last_attempt = att2 or last_attempt
                last_fetch_error = last_fetch_error or err2
                if matched_s is not None:
                    return _commit_merchant_order_success(matched_s, db, row, oid)

        try:
            sync_mercadopago_balance_snapshot(db, row)
            db.commit()
        except Exception:
            db.rollback()

        logger.info(
            "MP webhook merchant_order=%s sem liquidação tenant=%s stubs=%s order_ref=%s err=%s",
            oid,
            row.tenant_id,
            len(stubs),
            bool(order_ref),
            last_fetch_error,
        )
        reason = "no_entry_match" if had_payment_ids else "no_payment_payload"
        return {
            "received": True,
            "matched": False,
            "merchant_order_id": oid,
            "reason": reason,
            "error": last_fetch_error,
            "last_attempt": last_attempt,
        }

    if entity_type == "subscription_authorized_payment":
        pid = str(resource_id).strip()
        ok_pay, err_pay, payment = fetch_mercadopago_payment(access_token=access_token, payment_id=pid)
        if not ok_pay or payment is None:
            logger.warning("MP webhook subscription_authorized_payment: pagamento %s tenant=%s: %s", pid, row.tenant_id, err_pay)
            return {"received": True, "matched": False, "error": err_pay, "notification": "subscription_authorized_payment"}
        out = _apply_payment_settlement(db, row, payment)
        return {**out, "notification": "subscription_authorized_payment"}

    if entity_type in ("subscription_preapproval_plan", "plan"):
        try:
            sync_mercadopago_balance_snapshot(db, row)
            db.commit()
        except Exception:
            db.rollback()
        return {"received": True, "ignored": True, "reason": "subscription_plan_notification", "type": entity_type}

    if entity_type in ("subscription", "subscription_preapproval", "mp_subscription"):
        return _resolve_subscription_notification(db, row, access_token, str(resource_id).strip(), entity_type)

    return {"received": True, "ignored": True, "reason": "unsupported_type", "type": entity_type}


def resolve_mercadopago_gateway_by_path_token(db: Session, path_token: str) -> TenantFinanceGateway | None:
    t = (path_token or "").strip()
    if len(t) < 8:
        return None
    return db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.provider == FinanceGatewayProvider.MERCADOPAGO,
            TenantFinanceGateway.mercadopago_webhook_path_token == t,
        )
    ).scalar_one_or_none()
