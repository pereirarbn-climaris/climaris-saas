"""Transações financeiras recorrentes: validação, criação e geração automática."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.preventive_maintenance import tenant_local_date
from app.schemas import FinanceEntryCreate, FinanceRecurringSpec
from models import (
    FinanceEntry,
    FinanceEntryStatus,
    FinanceEntryType,
    FinanceRecurringFrequency,
    FinanceRecurringStatus,
    FinanceRecurringTransaction,
)

logger = logging.getLogger("erp.finance_recurring")

WEEKDAY_LABELS_PT = ("segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo")

# Limite de segurança (ex.: 10 anos mensais).
MAX_SCHEDULE_ENTRIES_PER_RULE = 120
DEFAULT_HORIZON_MONTHS = 24

# Metadado interno no template_json da regra (não vira campo do lançamento).
EXCLUDED_DUE_DATES_KEY = "_excluded_due_dates"


def _today_local(tz_name: str = "America/Sao_Paulo") -> date:
    """Data civil no fuso do tenant (evita rejeitar lançamento à noite no Brasil)."""
    return tenant_local_date(datetime.now(timezone.utc), tz_name)


def resolve_first_recurring_due(reference: date, spec: FinanceRecurringSpec) -> date:
    """Primeira data de vencimento da série (dia do mês / dia da semana) em ou após reference."""
    if spec.frequency == "weekly":
        wd = int(spec.weekday or 0)
        delta = (wd - reference.weekday()) % 7
        return reference + timedelta(days=delta)
    dom = int(spec.day_of_month or reference.day)
    return _first_monthly_due_on_or_after_ref(reference, dom)


def _first_monthly_due_on_or_after_ref(ref: date, day_of_month: int) -> date:
    candidate = _add_months_clamped(date(ref.year, ref.month, 1), 0, day_of_month)
    if candidate < ref:
        candidate = _add_months_clamped(ref, 1, day_of_month)
    return candidate


def validate_recurring_spec(
    spec: FinanceRecurringSpec,
    first_due: date,
    *,
    today: date | None = None,
    tz_name: str = "America/Sao_Paulo",
) -> None:
    """Impede agendamento com primeira ocorrência ou término no passado."""
    ref = today or _today_local(tz_name)
    if first_due < ref:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A primeira ocorrência da recorrência não pode ser em data passada.",
        )
    if spec.end_date is not None and spec.end_date < ref:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A data de encerramento não pode ser anterior a hoje.",
        )
    if spec.end_date is not None and spec.end_date < first_due:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A data de encerramento deve ser igual ou posterior à primeira ocorrência.",
        )
    if spec.frequency == "monthly":
        if spec.day_of_month is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Informe o dia do vencimento para recorrência mensal.",
            )
    elif spec.frequency == "weekly":
        if spec.weekday is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Informe o dia da semana para recorrência semanal.",
            )


def load_excluded_due_dates(rule: FinanceRecurringTransaction) -> set[date]:
    try:
        data = json.loads(rule.template_json)
    except Exception:
        return set()
    if not isinstance(data, dict):
        return set()
    raw = data.get(EXCLUDED_DUE_DATES_KEY)
    if not isinstance(raw, list):
        return set()
    out: set[date] = set()
    for item in raw:
        if isinstance(item, str):
            try:
                out.add(date.fromisoformat(item))
            except ValueError:
                continue
    return out


def add_excluded_due_date(rule: FinanceRecurringTransaction, due: date) -> None:
    try:
        data = json.loads(rule.template_json)
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    excluded = load_excluded_due_dates(rule)
    excluded.add(due)
    data[EXCLUDED_DUE_DATES_KEY] = sorted(d.isoformat() for d in excluded)
    rule.template_json = json.dumps(data, ensure_ascii=False)


def apply_recurring_delete_side_effects(
    db: Session,
    *,
    tenant_id: int,
    anchor_entry: FinanceEntry,
    scope: Literal["single", "future", "all"],
) -> None:
    """Impede o agendador de recriar lançamentos após exclusão pelo usuário."""
    rid = anchor_entry.recurring_transaction_id
    if rid is None:
        return
    rule = db.execute(
        select(FinanceRecurringTransaction).where(
            FinanceRecurringTransaction.id == rid,
            FinanceRecurringTransaction.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if rule is None:
        return

    if scope == "all":
        rule.status = FinanceRecurringStatus.ENDED.value
        db.add(rule)
        return

    if scope == "future":
        end = anchor_entry.due_date - timedelta(days=1)
        if rule.end_date is None or end < rule.end_date:
            rule.end_date = end
        db.add(rule)
        return

    add_excluded_due_date(rule, anchor_entry.due_date)
    db.add(rule)


def build_entry_template_from_payload(payload: FinanceEntryCreate) -> dict[str, Any]:
    return {
        "description": payload.description.strip(),
        "entry_type": payload.entry_type.value
        if hasattr(payload.entry_type, "value")
        else str(payload.entry_type),
        "amount": float(payload.amount),
        "payment_method": (payload.payment_method or "").strip().lower() or None,
        "payment_provider": (payload.payment_provider or "").strip() or None,
        "finance_account_id": payload.finance_account_id,
        "credit_card_id": payload.credit_card_id,
        "fee_fixed_amount": float(payload.fee_fixed_amount or 0),
        "fee_percent": float(payload.fee_percent or 0),
        "fee_amount": float(payload.fee_amount or 0),
        "recipient_whatsapp": payload.recipient_whatsapp,
        "settlement_plan": payload.settlement_plan,
        "category_id": payload.category_id,
        "status": payload.status.value if hasattr(payload.status, "value") else str(payload.status),
        "notes": payload.notes,
        "service_order_id": payload.service_order_id,
        "installment_interval_months": int(payload.installment_interval_months or 1),
    }


def create_recurring_rule(
    db: Session,
    *,
    tenant_id: int,
    spec: FinanceRecurringSpec,
    template: dict[str, Any],
    first_due: date,
    tz_name: str = "America/Sao_Paulo",
) -> FinanceRecurringTransaction:
    validate_recurring_spec(spec, first_due, tz_name=tz_name)
    freq = str(spec.frequency)
    row = FinanceRecurringTransaction(
        tenant_id=tenant_id,
        status=FinanceRecurringStatus.ACTIVE.value,
        frequency=freq,
        day_of_month=spec.day_of_month if freq == "monthly" else None,
        weekday=spec.weekday if freq == "weekly" else None,
        end_date=spec.end_date,
        template_json=json.dumps(template, ensure_ascii=False),
        last_generated_due_date=first_due,
    )
    db.add(row)
    db.flush()
    return row


def link_entries_to_recurring(
    db: Session,
    *,
    tenant_id: int,
    recurring_id: int,
    entry_ids: list[int],
) -> None:
    if not entry_ids:
        return
    rows = db.execute(
        select(FinanceEntry).where(
            FinanceEntry.tenant_id == tenant_id,
            FinanceEntry.id.in_(entry_ids),
        )
    ).scalars().all()
    for row in rows:
        row.recurring_transaction_id = recurring_id
        db.add(row)


def _add_months_clamped(d: date, months: int, day_of_month: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    import calendar

    last_day = calendar.monthrange(year, month)[1]
    day = min(day_of_month, last_day)
    return date(year, month, day)


def next_due_after(current: date, rule: FinanceRecurringTransaction) -> date:
    if rule.frequency == FinanceRecurringFrequency.WEEKLY.value:
        return current + timedelta(days=7)
    dom = int(rule.day_of_month or current.day)
    return _add_months_clamped(current, 1, dom)


def _first_weekly_due_on_or_after(rule: FinanceRecurringTransaction, ref: date) -> date:
    wd = int(rule.weekday or 0)
    delta = (wd - ref.weekday()) % 7
    return ref + timedelta(days=delta)


def _first_monthly_due_on_or_after(rule: FinanceRecurringTransaction, ref: date) -> date:
    dom = int(rule.day_of_month or ref.day)
    candidate = _add_months_clamped(date(ref.year, ref.month, 1), 0, dom)
    if candidate < ref:
        candidate = _add_months_clamped(ref, 1, dom)
    return candidate


def _first_due_on_or_after(rule: FinanceRecurringTransaction, ref: date) -> date:
    if rule.frequency == FinanceRecurringFrequency.WEEKLY.value:
        return _first_weekly_due_on_or_after(rule, ref)
    return _first_monthly_due_on_or_after(rule, ref)


def _schedule_end(rule: FinanceRecurringTransaction, *, reference: date | None = None) -> date:
    ref = reference or _today_local()
    if rule.end_date is not None:
        return rule.end_date
    dom = int(rule.day_of_month or ref.day)
    return _add_months_clamped(ref, DEFAULT_HORIZON_MONTHS, dom)


def iter_recurring_due_dates(
    rule: FinanceRecurringTransaction,
    start: date,
    end: date,
) -> list[date]:
    """Todas as datas de vencimento da série entre start e end (inclusive)."""
    if end < start:
        return []
    out: list[date] = []
    if rule.frequency == FinanceRecurringFrequency.WEEKLY.value:
        current = _first_weekly_due_on_or_after(rule, start)
        while current <= end:
            out.append(current)
            current = current + timedelta(days=7)
            if len(out) >= MAX_SCHEDULE_ENTRIES_PER_RULE:
                break
        return out

    dom = int(rule.day_of_month or start.day)
    current = _first_monthly_due_on_or_after(rule, start)
    while current <= end:
        out.append(current)
        current = _add_months_clamped(current, 1, dom)
        if len(out) >= MAX_SCHEDULE_ENTRIES_PER_RULE:
            break
    return out


def _schedule_start_for_rule(db: Session, rule: FinanceRecurringTransaction) -> date:
    min_due = db.execute(
        select(func.min(FinanceEntry.due_date)).where(
            FinanceEntry.recurring_transaction_id == rule.id,
            FinanceEntry.status != FinanceEntryStatus.CANCELLED,
        )
    ).scalar_one_or_none()
    if min_due is not None:
        return min_due
    anchor = rule.created_at.date() if rule.created_at else _today_local()
    return _first_due_on_or_after(rule, anchor)


def materialize_recurring_schedule(
    db: Session,
    rule: FinanceRecurringTransaction,
    *,
    end_at: date | None = None,
    tz_name: str = "America/Sao_Paulo",
) -> int:
    """Cria lançamentos pendentes de toda a série até end_at (idempotente)."""
    if rule.status != FinanceRecurringStatus.ACTIVE.value:
        return 0
    try:
        template = json.loads(rule.template_json)
    except Exception:
        logger.warning("template_json inválido recurring_id=%s", rule.id)
        return 0
    if not isinstance(template, dict):
        return 0

    ref = _today_local(tz_name)
    start = _schedule_start_for_rule(db, rule)
    if rule.end_date is not None and start > rule.end_date:
        return 0

    # Horizonte a partir da primeira ocorrência (não só “hoje”), para séries com vencimento futuro.
    end = end_at if end_at is not None else _schedule_end(rule, reference=max(start, ref))
    if rule.end_date is not None:
        end = min(end, rule.end_date)
    if end < start:
        return 0

    created = 0
    last_due: date | None = None
    excluded = load_excluded_due_dates(rule)
    for due in iter_recurring_due_dates(rule, start, end):
        if due in excluded:
            continue
        last_due = due
        if _create_entry_from_template(
            db,
            tenant_id=rule.tenant_id,
            recurring_id=rule.id,
            template=template,
            due=due,
        ):
            created += 1

    if last_due is not None:
        prev = rule.last_generated_due_date
        rule.last_generated_due_date = max(last_due, prev) if prev else last_due
        db.add(rule)

    return created


def _entry_exists_for_due(
    db: Session,
    recurring_id: int,
    due: date,
    *,
    rule: FinanceRecurringTransaction | None = None,
) -> bool:
    if rule is None:
        rule = db.execute(
            select(FinanceRecurringTransaction).where(FinanceRecurringTransaction.id == recurring_id)
        ).scalar_one_or_none()
    if rule is not None and due in load_excluded_due_dates(rule):
        return True
    n = db.execute(
        select(func.count())
        .select_from(FinanceEntry)
        .where(
            FinanceEntry.recurring_transaction_id == recurring_id,
            FinanceEntry.due_date == due,
        )
    ).scalar_one()
    return int(n or 0) > 0


def _should_run_today(rule: FinanceRecurringTransaction, today: date) -> bool:
    if rule.status != FinanceRecurringStatus.ACTIVE.value:
        return False
    if rule.end_date is not None and today > rule.end_date:
        return False
    if rule.frequency == FinanceRecurringFrequency.WEEKLY.value:
        return today.weekday() == int(rule.weekday or 0)
    dom = int(rule.day_of_month or 0)
    import calendar

    last_dom = calendar.monthrange(today.year, today.month)[1]
    effective_dom = min(dom, last_dom)
    return today.day == effective_dom


def _create_entry_from_template(
    db: Session,
    *,
    tenant_id: int,
    recurring_id: int,
    template: dict[str, Any],
    due: date,
) -> FinanceEntry | None:
    rule = db.execute(
        select(FinanceRecurringTransaction).where(FinanceRecurringTransaction.id == recurring_id)
    ).scalar_one_or_none()
    if _entry_exists_for_due(db, recurring_id, due, rule=rule):
        return None

    from app.finance_settlement import expected_settlement_for_parcel, normalize_settlement_plan

    entry_type_raw = template.get("entry_type", FinanceEntryType.EXPENSE.value)
    entry_type = FinanceEntryType(entry_type_raw) if entry_type_raw in ("income", "expense") else FinanceEntryType.EXPENSE
    status_raw = template.get("status", FinanceEntryStatus.PENDING.value)
    st = (
        FinanceEntryStatus(status_raw)
        if status_raw in ("pending", "paid", "overdue", "cancelled", "awaiting_invoice")
        else FinanceEntryStatus.PENDING
    )
    plan = normalize_settlement_plan(template.get("settlement_plan"), default="same_as_due")
    competence = due

    entry = FinanceEntry(
        tenant_id=tenant_id,
        category_id=template.get("category_id"),
        description=str(template.get("description") or "Recorrente"),
        entry_type=entry_type,
        status=st,
        amount=float(template.get("amount") or 0),
        payment_method=template.get("payment_method"),
        payment_provider=template.get("payment_provider"),
        finance_account_id=template.get("finance_account_id"),
        credit_card_id=template.get("credit_card_id"),
        fee_fixed_amount=float(template.get("fee_fixed_amount") or 0),
        fee_percent=float(template.get("fee_percent") or 0),
        fee_amount=float(template.get("fee_amount") or 0),
        recipient_whatsapp=template.get("recipient_whatsapp"),
        competence_date=competence,
        expected_settlement_date=expected_settlement_for_parcel(due, plan),
        settlement_plan=plan,
        due_date=due,
        paid_at=datetime.now(timezone.utc) if st == FinanceEntryStatus.PAID else None,
        notes=template.get("notes"),
        installment_group_id=None,
        installment_number=1,
        installment_total=1,
        service_order_id=template.get("service_order_id"),
        recurring_transaction_id=recurring_id,
    )
    db.add(entry)
    return entry


def process_due_recurring_transactions(db: Session, *, today: date | None = None) -> dict[str, int]:
    """Materializa cronograma completo das regras ativas (passado e futuro até end_date)."""
    ref = today or _today_local()
    created = 0
    ended = 0

    rules = db.execute(
        select(FinanceRecurringTransaction).where(
            FinanceRecurringTransaction.status == FinanceRecurringStatus.ACTIVE.value,
        )
    ).scalars().all()

    for rule in rules:
        if rule.end_date is not None and ref > rule.end_date:
            rule.status = FinanceRecurringStatus.ENDED.value
            db.add(rule)
            ended += 1
            continue
        created += materialize_recurring_schedule(db, rule)

    if created or ended:
        db.commit()
    return {"created": created, "ended": ended, "checked": len(rules)}


def preview_recurring_message(spec: FinanceRecurringSpec, *, end_infinite: bool) -> str:
    if spec.frequency == "monthly":
        dom = spec.day_of_month or 1
        end = "sem data de término" if end_infinite or not spec.end_date else f"até {spec.end_date.isoformat()}"
        return f"O sistema gerará este lançamento automaticamente todo dia {dom} {end}."
    wd = int(spec.weekday or 0) % 7
    label = WEEKDAY_LABELS_PT[wd]
    end = "sem data de término" if end_infinite or not spec.end_date else f"até {spec.end_date.isoformat()}"
    return f"O sistema gerará este lançamento automaticamente toda {label}-feira {end}."
