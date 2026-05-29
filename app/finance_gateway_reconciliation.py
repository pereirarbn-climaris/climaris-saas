"""Conciliação bancária: extrato gateway (MP / Stone) × lançamentos Climaris."""

from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.mercadopago_client import search_mercadopago_payments_in_range
from app.security import decrypt_platform_secret
from app.stone_pagarme_client import list_pagarme_orders
from models import (
    FinanceBankAccount,
    FinanceEntry,
    FinanceEntryStatus,
    FinanceEntryType,
    FinanceGatewayProvider,
    TenantFinanceGateway,
)

_AMOUNT_TOLERANCE = Decimal("0.01")
_BUSINESS_DAY_TOLERANCE = 2


def _parse_notes_obj(notes: str | None) -> dict[str, Any]:
    if not notes or not notes.strip():
        return {}
    try:
        parsed = json.loads(notes)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def is_entry_gateway_reconciled(entry: FinanceEntry) -> bool:
    rec = _parse_notes_obj(entry.notes).get("gateway_reconciliation")
    if isinstance(rec, dict) and rec.get("status") == "reconciled":
        return True
    return False


def entry_reconciliation_feed_id(entry: FinanceEntry) -> str | None:
    rec = _parse_notes_obj(entry.notes).get("gateway_reconciliation")
    if isinstance(rec, dict):
        fid = rec.get("feed_id")
        if isinstance(fid, str) and fid.strip():
            return fid.strip()
    return None


def set_entry_gateway_reconciled(entry: FinanceEntry, feed_id: str) -> None:
    notes = _parse_notes_obj(entry.notes)
    notes["gateway_reconciliation"] = {
        "status": "reconciled",
        "feed_id": feed_id,
        "reconciled_at": datetime.now(timezone.utc).isoformat(),
    }
    entry.notes = json.dumps(notes, ensure_ascii=False)


def _is_weekend(d: date) -> bool:
    return d.weekday() >= 5


def _business_days_between(a: date, b: date) -> int:
    if a > b:
        a, b = b, a
    cur = a
    count = 0
    while cur < b:
        cur += timedelta(days=1)
        if not _is_weekend(cur):
            count += 1
    return count


def amounts_match(a: float, b: float) -> bool:
    return abs(Decimal(str(a)) - Decimal(str(b))) <= _AMOUNT_TOLERANCE


def settlement_dates_match(a: date, b: date) -> bool:
    if a == b:
        return True
    return _business_days_between(a, b) <= _BUSINESS_DAY_TOLERANCE


def _parse_mp_date(raw: Any) -> date | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        if "T" in s:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _mp_payment_settlement_date(payment: dict[str, Any]) -> date:
    for key in ("money_release_date", "date_approved", "date_created"):
        d = _parse_mp_date(payment.get(key))
        if d is not None:
            return d
    return date.today()


def _mp_payment_amount(payment: dict[str, Any]) -> float:
    for key in ("transaction_details",):
        td = payment.get(key)
        if isinstance(td, dict) and td.get("net_received_amount") is not None:
            try:
                return float(td["net_received_amount"])
            except (TypeError, ValueError):
                pass
    try:
        return float(payment.get("transaction_amount") or 0)
    except (TypeError, ValueError):
        return 0.0


def _stone_order_amount(order: dict[str, Any]) -> float:
    try:
        if order.get("amount") is not None:
            return int(order["amount"]) / 100.0
    except (TypeError, ValueError):
        pass
    total = 0
    for ch in order.get("charges") or []:
        if not isinstance(ch, dict):
            continue
        try:
            total += int(ch.get("amount") or 0)
        except (TypeError, ValueError):
            continue
    return total / 100.0 if total else 0.0


def _stone_order_settlement_date(order: dict[str, Any]) -> date:
    for key in ("closed_at", "updated_at", "created_at"):
        d = _parse_mp_date(order.get(key))
        if d is not None:
            return d
    return date.today()


def _order_is_paid_stone(order: dict[str, Any]) -> bool:
    st = str(order.get("status") or "").strip().lower()
    if st == "paid":
        return True
    for ch in order.get("charges") or []:
        if isinstance(ch, dict) and str(ch.get("status") or "").strip().lower() == "paid":
            return True
    return False


def _entry_settlement_date(entry: FinanceEntry) -> date:
    if entry.paid_at is not None:
        return entry.paid_at.date()
    return entry.expected_settlement_date or entry.due_date


def _entry_provider_slug(entry: FinanceEntry) -> str | None:
    p = (entry.payment_provider or "").strip().lower()
    if p in ("mercadopago", "mercado_pago", "mp"):
        return "mercadopago"
    if p in ("stone", "pagarme", "pagar.me"):
        return "stone"
    return p or None


def _feed_line_status(
    feed_id: str,
    external_id: str,
    provider: str,
    entries_by_gateway_id: dict[str, FinanceEntry],
    reconciled_feed_ids: set[str],
) -> tuple[str, int | None]:
    if feed_id in reconciled_feed_ids:
        return "processed", None
    key = f"{provider}:{external_id}"
    hit = entries_by_gateway_id.get(external_id) or entries_by_gateway_id.get(key)
    if hit is not None and is_entry_gateway_reconciled(hit):
        return "processed", hit.id
    if hit is not None:
        return "pending", hit.id
    return "pending", None


def auto_match_pairs(
    feed_lines: list[dict[str, Any]],
    entries: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Sugere pares feed × lançamento (valor ±R$0,01, liquidação ±2 dias úteis)."""
    used_feed: set[str] = set()
    used_entry: set[int] = set()
    suggestions: list[dict[str, Any]] = []

    for fl in feed_lines:
        if fl.get("status") == "processed":
            continue
        fid = str(fl["id"])
        famt = float(fl["amount"])
        fdate = date.fromisoformat(str(fl["settlement_date"]))
        best: tuple[int, str] | None = None
        for ent in entries:
            if ent.get("status") == "reconciled":
                continue
            eid = int(ent["id"])
            if eid in used_entry:
                continue
            if not amounts_match(famt, float(ent["amount"])):
                continue
            edate = date.fromisoformat(str(ent["settlement_date"]))
            if not settlement_dates_match(fdate, edate):
                continue
            conf = "high" if famt == float(ent["amount"]) and fdate == edate else "medium"
            if best is None or conf == "high":
                best = (eid, conf)
                if conf == "high" and fdate == edate:
                    break
        if best is not None:
            used_feed.add(fid)
            used_entry.add(best[0])
            suggestions.append({"feed_id": fid, "entry_id": best[0], "confidence": best[1]})
    return suggestions


def fetch_mercadopago_feed_lines(
    db: Session,
    row: TenantFinanceGateway,
    *,
    start: date,
    end: date,
    entries_by_gateway_id: dict[str, FinanceEntry],
    reconciled_feed_ids: set[str],
) -> tuple[list[dict[str, Any]], str | None]:
    if not row.mercadopago_access_token_encrypted:
        return [], "Mercado Pago não conectado."
    try:
        token = decrypt_platform_secret(row.mercadopago_access_token_encrypted)
    except Exception:
        return [], "Falha ao decifrar credenciais Mercado Pago."
    begin = f"{start.isoformat()}T00:00:00.000-03:00"
    end_s = f"{end.isoformat()}T23:59:59.000-03:00"
    ok, err, payments = search_mercadopago_payments_in_range(
        access_token=token,
        begin_date=begin,
        end_date=end_s,
        range_field="money_release_date",
        limit=50,
    )
    if not ok:
        return [], err or "Falha ao buscar pagamentos MP."
    lines: list[dict[str, Any]] = []
    for pay in payments:
        status_mp = str(pay.get("status") or "").strip().lower()
        if status_mp not in ("approved", "accredited"):
            continue
        pid = str(pay.get("id") or "").strip()
        if not pid:
            continue
        feed_id = f"mercadopago:{pid}"
        st, matched_id = _feed_line_status(
            feed_id, pid, "mercadopago", entries_by_gateway_id, reconciled_feed_ids
        )
        lines.append(
            {
                "id": feed_id,
                "provider": "mercadopago",
                "external_id": pid,
                "description": str(pay.get("description") or f"Pagamento MP #{pid}")[:180],
                "amount": _mp_payment_amount(pay),
                "settlement_date": _mp_payment_settlement_date(pay).isoformat(),
                "status": st,
                "matched_entry_id": matched_id,
            }
        )
    return lines, None


def fetch_stone_feed_lines(
    db: Session,
    row: TenantFinanceGateway,
    *,
    start: date,
    end: date,
    entries_by_gateway_id: dict[str, FinanceEntry],
    reconciled_feed_ids: set[str],
) -> tuple[list[dict[str, Any]], str | None]:
    if not row.stone_secret_key_encrypted:
        return [], "Stone / Pagar.me não conectado."
    try:
        sk = decrypt_platform_secret(row.stone_secret_key_encrypted)
    except Exception:
        return [], "Falha ao decifrar credenciais Stone."
    ok, err, orders = list_pagarme_orders(sk, page=1, size=50)
    if not ok:
        return [], err or "Falha ao listar pedidos Pagar.me."
    lines: list[dict[str, Any]] = []
    for order in orders:
        if not _order_is_paid_stone(order):
            continue
        sett = _stone_order_settlement_date(order)
        if sett < start or sett > end:
            continue
        oid = str(order.get("id") or "").strip()
        if not oid:
            continue
        feed_id = f"stone:{oid}"
        st, matched_id = _feed_line_status(
            feed_id, oid, "stone", entries_by_gateway_id, reconciled_feed_ids
        )
        lines.append(
            {
                "id": feed_id,
                "provider": "stone",
                "external_id": oid,
                "description": str(order.get("code") or f"Pedido {oid}")[:180],
                "amount": _stone_order_amount(order),
                "settlement_date": sett.isoformat(),
                "status": st,
                "matched_entry_id": matched_id,
            }
        )
    return lines, None


def build_reconciliation_dashboard(
    db: Session,
    *,
    tenant_id: int,
    finance_account_id: int | None,
    start: date,
    end: date,
    provider: str | None,
) -> dict[str, Any]:
    entries_q = (
        select(FinanceEntry)
        .options(selectinload(FinanceEntry.category))
        .where(
            FinanceEntry.tenant_id == tenant_id,
            FinanceEntry.entry_type == FinanceEntryType.INCOME,
            FinanceEntry.due_date >= start,
            FinanceEntry.due_date <= end,
        )
    )
    if finance_account_id is not None:
        entries_q = entries_q.where(FinanceEntry.finance_account_id == finance_account_id)
    entries = list(db.execute(entries_q).scalars().all())

    entries_by_gateway_id: dict[str, FinanceEntry] = {}
    reconciled_feed_ids: set[str] = set()
    for e in entries:
        gid = (e.gateway_payment_id or "").strip()
        if gid:
            entries_by_gateway_id[gid] = e
        fid = entry_reconciliation_feed_id(e)
        if fid:
            reconciled_feed_ids.add(fid)
        if is_entry_gateway_reconciled(e):
            prov = _entry_provider_slug(e)
            if prov and gid:
                reconciled_feed_ids.add(f"{prov}:{gid}")

    gw_rows = list(
        db.execute(select(TenantFinanceGateway).where(TenantFinanceGateway.tenant_id == tenant_id)).scalars().all()
    )
    by_prov = {r.provider: r for r in gw_rows}

    feed_lines: list[dict[str, Any]] = []
    fetch_errors: list[str] = []
    providers_loaded: list[str] = []

    want_mp = provider in (None, "", "mercadopago", "all")
    want_stone = provider in (None, "", "stone", "all")

    if want_mp:
        mp_row = by_prov.get(FinanceGatewayProvider.MERCADOPAGO)
        if mp_row and mp_row.mercadopago_access_token_encrypted:
            lines, err = fetch_mercadopago_feed_lines(
                db,
                mp_row,
                start=start,
                end=end,
                entries_by_gateway_id=entries_by_gateway_id,
                reconciled_feed_ids=reconciled_feed_ids,
            )
            if err:
                fetch_errors.append(err)
            else:
                providers_loaded.append("mercadopago")
                feed_lines.extend(lines)

    if want_stone:
        stone_row = by_prov.get(FinanceGatewayProvider.STONE)
        if stone_row and stone_row.stone_secret_key_encrypted:
            lines, err = fetch_stone_feed_lines(
                db,
                stone_row,
                start=start,
                end=end,
                entries_by_gateway_id=entries_by_gateway_id,
                reconciled_feed_ids=reconciled_feed_ids,
            )
            if err:
                fetch_errors.append(err)
            else:
                providers_loaded.append("stone")
                feed_lines.extend(lines)

    feed_lines.sort(key=lambda x: (x["settlement_date"], x["id"]))

    climaris_out: list[dict[str, Any]] = []
    for e in entries:
        prov = _entry_provider_slug(e)
        if provider not in (None, "", "all") and prov != provider:
            continue
        if prov not in ("mercadopago", "stone") and not (e.gateway_payment_id or "").strip():
            continue
        rec = is_entry_gateway_reconciled(e)
        ent_status = "reconciled" if rec else "pending"
        climaris_out.append(
            {
                "id": e.id,
                "description": e.description,
                "amount": float(e.amount),
                "settlement_date": _entry_settlement_date(e).isoformat(),
                "status": ent_status,
                "payment_provider": e.payment_provider,
                "gateway_payment_id": e.gateway_payment_id,
                "finance_account_id": e.finance_account_id,
                "entry_status": e.status.value if hasattr(e.status, "value") else str(e.status),
            }
        )

    suggestions = auto_match_pairs(feed_lines, climaris_out)

    return {
        "feed_lines": feed_lines,
        "climaris_entries": climaris_out,
        "suggestions": suggestions,
        "providers_loaded": providers_loaded,
        "fetch_errors": fetch_errors,
    }


def apply_gateway_reconciliation_match(
    db: Session,
    *,
    tenant_id: int,
    feed_id: str,
    finance_entry_id: int,
) -> FinanceEntry:
    entry = db.execute(
        select(FinanceEntry)
        .options(selectinload(FinanceEntry.category))
        .where(FinanceEntry.id == finance_entry_id, FinanceEntry.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if entry is None:
        raise ValueError("Lançamento não encontrado.")

    parts = feed_id.split(":", 1)
    if len(parts) != 2:
        raise ValueError("Identificador do extrato inválido.")
    provider, external_id = parts[0].strip(), parts[1].strip()
    if provider not in ("mercadopago", "stone") or not external_id:
        raise ValueError("Identificador do extrato inválido.")

    if is_entry_gateway_reconciled(entry):
        raise ValueError("Lançamento já conciliado.")

    if entry.status not in (FinanceEntryStatus.PENDING, FinanceEntryStatus.OVERDUE, FinanceEntryStatus.PAID):
        raise ValueError("Status do lançamento não permite conciliação.")

    entry.gateway_payment_id = external_id[:48]
    entry.payment_provider = provider
    paid_at = datetime.combine(_entry_settlement_date(entry), time(12, 0), tzinfo=timezone.utc)
    entry.status = FinanceEntryStatus.PAID
    entry.paid_at = paid_at
    set_entry_gateway_reconciled(entry, feed_id)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
