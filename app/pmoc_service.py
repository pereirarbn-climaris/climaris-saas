"""Regras de negócio do PMOC (BTU, semeadura de atividades, metadados)."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models import (
    Client,
    Equipment,
    PmocActivityFrequency,
    PmocPlan,
    PmocPlanEquipment,
    PmocPlanStatus,
    PmocScheduledActivity,
)

LAW_THRESHOLD_BTU = 60_000

DEFAULT_LAW_NOTE = (
    "Referência: Lei Federal nº 13.589/2018 e normas correlatas da ANVISA sobre sistemas de climatização. "
    "Para instalações acima de 60.000 BTUs (soma das capacidades), verifique obrigatoriedade de análise "
    "periódica da qualidade do ar em ambiente climatizado e responsável técnico habilitado."
)


def client_snapshot_dict(client: Client) -> dict[str, Any]:
    return {
        "name": client.name,
        "trade_name": client.trade_name,
        "document": client.document,
        "tax_id_kind": client.tax_id_kind,
        "phone": client.phone,
        "email": client.email,
        "address_street": client.address_street,
        "address_number": client.address_number,
        "address_complement": client.address_complement,
        "address_district": client.address_district,
        "address_city": client.address_city,
        "address_state": client.address_state,
        "address_postal_code": client.address_postal_code,
        "address_country": client.address_country,
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }


def sum_equipment_btu_for_pmoc(db: Session, pmoc_id: int) -> int:
    total = db.execute(
        select(func.coalesce(func.sum(Equipment.capacidade_btu), 0)).where(
            Equipment.id.in_(
                select(PmocPlanEquipment.equipment_id).where(PmocPlanEquipment.pmoc_id == pmoc_id)
            ),
            Equipment.ativo.is_(True),
        )
    ).scalar_one()
    return int(total or 0)


def refresh_pmoc_computed_fields(db: Session, plan: PmocPlan) -> None:
    total = sum_equipment_btu_for_pmoc(db, plan.id)
    plan.total_btu_sum = total
    plan.air_analysis_required = total > LAW_THRESHOLD_BTU
    if plan.air_analysis_required and plan.next_air_analysis_due is None:
        plan.next_air_analysis_due = date.today() + timedelta(days=180)


def seed_default_activities(db: Session, pmoc_id: int) -> None:
    """Cronograma-tipo exigido na operação (ajuste conforme contrato e memorial descritivo)."""
    seed_rows: list[tuple[str, PmocActivityFrequency, str, str | None]] = [
        (
            "Limpeza de filtros e grades de ar",
            PmocActivityFrequency.MONTHLY,
            "Retirar, lavar ou aspirar filtros; verificar integridade das grades.",
            "filtros",
        ),
        (
            "Verificação de drenos e bandejas",
            PmocActivityFrequency.MONTHLY,
            "Conferir escoamento, ausência de obstruções e algas.",
            "dreno",
        ),
        (
            "Inspeção visual de tubulações e isolamento",
            PmocActivityFrequency.QUARTERLY,
            "Verificar condensação anormal, ruídos e estado do isolante.",
            "inspecao",
        ),
        (
            "Higienização de serpentinas (evaporadora)",
            PmocActivityFrequency.SEMIANNUAL,
            "Limpeza química/mecânica conforme fabricante e NR.",
            "higienizacao",
        ),
        (
            "Verificação elétrica básica e dreno bomba d'água",
            PmocActivityFrequency.ANNUAL,
            "Conferir aperto de terminais acessíveis, tomada dedicada e eletroduto.",
            "eletrica",
        ),
    ]
    for idx, (title, freq, desc, code) in enumerate(seed_rows):
        db.add(
            PmocScheduledActivity(
                pmoc_id=pmoc_id,
                equipment_id=None,
                frequency=freq,
                task_code=code,
                title=title,
                description=desc,
                sort_order=idx,
                is_system_seed=True,
            )
        )


def deactivate_other_active_plans(db: Session, tenant_id: int, client_id: int, keep_pmoc_id: int) -> None:
    others = db.execute(
        select(PmocPlan).where(
            PmocPlan.tenant_id == tenant_id,
            PmocPlan.client_id == client_id,
            PmocPlan.status == PmocPlanStatus.ACTIVE,
            PmocPlan.id != keep_pmoc_id,
        )
    ).scalars().all()
    now = datetime.now(timezone.utc)
    for p in others:
        p.status = PmocPlanStatus.INACTIVE
        p.deactivated_at = now


def extras_default() -> dict[str, str]:
    return {
        "photo_report": "",
        "parts_history": "",
        "efficiency_notes": "",
        "improvement_suggestions": "",
    }


def parse_extras(raw: str | None) -> dict[str, Any]:
    if not raw:
        return extras_default()
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            base = extras_default()
            for k in base:
                if k in data and isinstance(data[k], str):
                    base[k] = data[k]
            return base
    except json.JSONDecodeError:
        pass
    return extras_default()


def serialize_extras(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False)
