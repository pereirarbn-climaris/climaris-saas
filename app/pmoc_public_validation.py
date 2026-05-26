"""Validação pública de PMOC — payload seguro e QR Code."""

from __future__ import annotations

import json
from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import public_app_base_url
from app.pmoc_compliance import compute_pmoc_compliance_summary
from app.pmoc_pending_tasks import compute_pmoc_pending_tasks
from models import (
    Client,
    Equipment,
    PmocExecution,
    PmocPlan,
    PmocPlanEquipment,
    PmocPlanStatus,
)

ConservationStatus = Literal["ok", "attention", "critical", "pending"]


@dataclass
class PublicPmocValidationEquipment:
    label: str
    model: str | None
    location: str | None
    conservation_status: ConservationStatus
    last_inspection_at: datetime | None


@dataclass
class PublicPmocValidationResult:
    pmoc_id: int
    plan_title: str
    plan_status: str
    client_name: str
    establishment_label: str | None
    establishment_city: str | None
    establishment_state: str | None
    responsible_name: str | None
    art_number: str | None
    art_valid_until: date | None
    overall_status: str
    indicators: list
    last_maintenance_at: datetime | None
    next_maintenance_expected: date | None
    equipments: list[PublicPmocValidationEquipment]
    validated_at: datetime
    validation_url: str


def build_public_pmoc_validation_url(pmoc_id: int) -> str:
    return f"{public_app_base_url()}/public/pmoc-validation/{pmoc_id}"


def generate_pmoc_validation_qr_png(url: str) -> bytes:
    import qrcode

    qr = qrcode.QRCode(version=None, box_size=4, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _establishment_label(plan: PmocPlan, client: Client) -> str | None:
    snap: dict[str, Any] = {}
    if plan.establishment_snapshot_json:
        try:
            raw = json.loads(plan.establishment_snapshot_json)
            if isinstance(raw, dict):
                snap = raw
        except json.JSONDecodeError:
            snap = {}
    trade = (snap.get("trade_name") or snap.get("nome_fantasia") or client.trade_name or "").strip()
    if trade:
        return trade
    return (client.name or "").strip() or None


def _snapshot_city_state(plan: PmocPlan, client: Client) -> tuple[str | None, str | None]:
    snap: dict[str, Any] = {}
    if plan.establishment_snapshot_json:
        try:
            raw = json.loads(plan.establishment_snapshot_json)
            if isinstance(raw, dict):
                snap = raw
        except json.JSONDecodeError:
            snap = {}
    city = (snap.get("address_city") or client.address_city or "").strip() or None
    state = (snap.get("address_state") or client.address_state or "").strip() or None
    return city, state


def _parse_field_inspection_has_not_ok(notes: str | None) -> bool | None:
    if not notes or not notes.strip():
        return None
    try:
        data = json.loads(notes)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or data.get("type") != "field_inspection":
        return None
    checklist = data.get("checklist")
    if not isinstance(checklist, list):
        return None
    return any(isinstance(item, dict) and item.get("status") == "not_ok" for item in checklist)


def _equipment_conservation(
    equipment_id: int,
    executions: list[PmocExecution],
) -> tuple[ConservationStatus, datetime | None]:
    related = sorted(
        [ex for ex in executions if ex.equipment_id == equipment_id],
        key=lambda row: row.executed_at,
        reverse=True,
    )
    if not related:
        return "pending", None

    latest = related[0]
    has_not_ok = _parse_field_inspection_has_not_ok(latest.notes)
    status_value = latest.completion_status.value if hasattr(latest.completion_status, "value") else latest.completion_status

    if has_not_ok or status_value in ("partial", "skipped"):
        return "critical", latest.executed_at
    if status_value == "done" or has_not_ok is False:
        return "ok", latest.executed_at
    return "attention", latest.executed_at


def _art_valid_until(plan: PmocPlan) -> date | None:
    if plan.art_issued_at is None:
        return None
    return plan.art_issued_at + timedelta(days=365)


def _next_maintenance_expected(today: date, pending_count: int) -> date:
    if pending_count > 0:
        last_day = monthrange(today.year, today.month)[1]
        return date(today.year, today.month, last_day)
    if today.month == 12:
        return date(today.year + 1, 1, 1)
    return date(today.year, today.month + 1, 1)


def build_public_pmoc_validation(
    db: Session,
    pmoc_id: int,
) -> PublicPmocValidationResult:
    plan = db.get(PmocPlan, pmoc_id)
    if plan is None:
        raise LookupError("PMOC não encontrado.")
    if plan.status == PmocPlanStatus.DRAFT:
        raise LookupError("Plano PMOC ainda não publicado para validação.")

    client = db.get(Client, plan.client_id)
    if client is None:
        raise LookupError("Cliente do PMOC não encontrado.")

    from models import PmocOccurrence, PmocOccurrenceStatus

    open_occurrences = db.execute(
        select(PmocOccurrence).where(
            PmocOccurrence.pmoc_id == pmoc_id,
            PmocOccurrence.status == PmocOccurrenceStatus.OPEN,
        )
    ).scalars().all()

    compliance = compute_pmoc_compliance_summary(
        db,
        pmoc_id=pmoc_id,
        tenant_id=plan.tenant_id,
        open_occurrences=len(open_occurrences),
    )

    executions = db.execute(
        select(PmocExecution)
        .where(PmocExecution.pmoc_id == pmoc_id)
        .order_by(PmocExecution.executed_at.desc())
    ).scalars().all()

    last_maintenance_at = executions[0].executed_at if executions else None

    pending = compute_pmoc_pending_tasks(db, pmoc_id=pmoc_id, tenant_id=plan.tenant_id)
    today = date.today()
    next_expected = _next_maintenance_expected(today, len(pending.tasks))

    eq_links = db.execute(
        select(PmocPlanEquipment, Equipment)
        .join(Equipment, Equipment.id == PmocPlanEquipment.equipment_id)
        .where(PmocPlanEquipment.pmoc_id == pmoc_id, Equipment.ativo.is_(True))
        .order_by(PmocPlanEquipment.sort_order, PmocPlanEquipment.id)
    ).all()

    equipments: list[PublicPmocValidationEquipment] = []
    for link, eq in eq_links:
        conservation, last_insp = _equipment_conservation(link.equipment_id, list(executions))
        equipments.append(
            PublicPmocValidationEquipment(
                label=(eq.identificacao if eq else None) or f"Equipamento #{link.equipment_id}",
                model=(eq.modelo if eq else None),
                location=(eq.local_instalacao if eq else None),
                conservation_status=conservation,
                last_inspection_at=last_insp,
            )
        )

    city, state = _snapshot_city_state(plan, client)
    rt_name = (plan.responsible_name or "").strip() or None
    art_number = (plan.art_number or "").strip() or None

    return PublicPmocValidationResult(
        pmoc_id=plan.id,
        plan_title=plan.title,
        plan_status=plan.status.value if hasattr(plan.status, "value") else str(plan.status),
        client_name=client.name,
        establishment_label=_establishment_label(plan, client),
        establishment_city=city,
        establishment_state=state,
        responsible_name=rt_name,
        art_number=art_number,
        art_valid_until=_art_valid_until(plan),
        overall_status=compliance.overall_status,
        indicators=compliance.indicators,
        last_maintenance_at=last_maintenance_at,
        next_maintenance_expected=next_expected,
        equipments=equipments,
        validated_at=datetime.now(timezone.utc),
        validation_url=build_public_pmoc_validation_url(plan.id),
    )
