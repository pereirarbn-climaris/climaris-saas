"""Regras de negócio do PMOC (BTU, semeadura de atividades, metadados)."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models import (
    Client,
    ClientSite,
    Equipment,
    PmocActivityFrequency,
    PmocPlan,
    PmocPlanEquipment,
    PmocPlanStatus,
    PmocScheduledActivity,
)

LAW_THRESHOLD_BTU = 60_000

DEFAULT_LAW_NOTE = (
    "Referência: Lei Federal nº 13.589/2018 e ABNT NBR 17.037:2023 (Qualidade do Ar Interior em Sistemas de Climatização). "
    "Para instalações a partir de 60.000 BTUs (soma das capacidades), verifique obrigatoriedade de análise "
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


def client_site_snapshot_dict(client: Client, site: ClientSite) -> dict[str, Any]:
    """Snapshot congelado da obra/filial vinculada ao PMOC."""
    base = client_snapshot_dict(client)
    base.update(
        {
            "site_id": site.id,
            "site_name": site.name,
            "address_street": site.street or client.address_street,
            "address_number": site.number or client.address_number,
            "address_district": site.neighborhood or client.address_district,
            "address_city": site.city or client.address_city,
            "address_state": site.state or client.address_state,
            "address_postal_code": site.cep or client.address_postal_code,
        }
    )
    return base


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
    plan.air_analysis_required = total >= LAW_THRESHOLD_BTU
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


def deactivate_other_active_plans(
    db: Session,
    tenant_id: int,
    client_id: int,
    keep_pmoc_id: int,
    *,
    client_site_id: int | None = None,
) -> None:
    query = select(PmocPlan).where(
        PmocPlan.tenant_id == tenant_id,
        PmocPlan.client_id == client_id,
        PmocPlan.status == PmocPlanStatus.ACTIVE,
        PmocPlan.id != keep_pmoc_id,
    )
    if client_site_id is not None:
        query = query.where(PmocPlan.client_site_id == client_site_id)
    else:
        query = query.where(PmocPlan.client_site_id.is_(None))
    others = db.execute(query).scalars().all()
    now = datetime.now(timezone.utc)
    for p in others:
        p.status = PmocPlanStatus.INACTIVE
        p.deactivated_at = now


def extras_default() -> dict[str, Any]:
    return {
        "photo_report": "",
        "parts_history": "",
        "efficiency_notes": "",
        "improvement_suggestions": "",
        "planning_scheduled_rows": "",
        "company_data": {},
        "building_data": {},
        "environments_data": [],
        "emergency_plan": {},
        "annual_load_review_due": "",
        "service_history_notes": "",
        "consumables_traceability": "",
        "field_operational_targets": {},
        "managerial_indicators_notes": "",
        "rt_extended": {},
    }


def parse_extras(raw: str | None) -> dict[str, Any]:
    if not raw:
        return extras_default()
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            base = extras_default()
            for k, default_value in base.items():
                if k not in data:
                    continue
                incoming = data[k]
                if isinstance(default_value, str):
                    if isinstance(incoming, str):
                        base[k] = incoming
                elif isinstance(default_value, dict):
                    if isinstance(incoming, dict):
                        base[k] = incoming
                elif isinstance(default_value, list):
                    if isinstance(incoming, list):
                        base[k] = incoming
            return base
    except json.JSONDecodeError:
        pass
    return extras_default()


def parse_planning_scheduled_rows(extras: dict[str, Any]) -> set[str]:
    raw = extras.get("planning_scheduled_rows", "")
    if not isinstance(raw, str) or not raw.strip():
        return set()
    return {key.strip() for key in raw.split(",") if key.strip()}


def merge_planning_scheduled_rows(extras: dict[str, Any], row_keys: list[str]) -> dict[str, Any]:
    merged = extras_default()
    for key, default_value in merged.items():
        if key not in extras:
            continue
        incoming = extras[key]
        if isinstance(default_value, str) and isinstance(incoming, str):
            merged[key] = incoming
        elif isinstance(default_value, dict) and isinstance(incoming, dict):
            merged[key] = incoming
        elif isinstance(default_value, list) and isinstance(incoming, list):
            merged[key] = incoming
    scheduled = parse_planning_scheduled_rows(merged)
    scheduled.update(key.strip() for key in row_keys if key.strip())
    merged["planning_scheduled_rows"] = ",".join(sorted(scheduled))
    return merged


def serialize_extras(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False)


def build_pmoc_create_validation_issues(
    *,
    client_id: int,
    client_site_id: int | None,
    requires_site: bool,
    equipment_ids: list[int],
    responsible_name: str | None,
) -> list[dict[str, str]]:
    """Regras mínimas para cadastro PMOC (cliente, obra, equipamentos, RT)."""
    issues: list[dict[str, str]] = []
    if client_id < 1:
        issues.append(
            {
                "code": "missing_client",
                "field": "clientId",
                "message": "Selecione o cliente titular do PMOC.",
                "tab": "identification",
            }
        )
    if requires_site and (client_site_id is None or client_site_id < 1):
        issues.append(
            {
                "code": "missing_site",
                "field": "siteId",
                "message": "Selecione a obra ou filial vinculada ao plano.",
                "tab": "identification",
            }
        )
    if len(equipment_ids) < 1:
        issues.append(
            {
                "code": "missing_equipment",
                "field": "equipmentIds",
                "message": "Vincule ao menos um equipamento ao PMOC.",
                "tab": "identification",
            }
        )
    if not (responsible_name or "").strip():
        issues.append(
            {
                "code": "missing_rt",
                "field": "rtData.responsibleName",
                "message": "Informe o responsável técnico (RT) na aba Ar & ART.",
                "tab": "air",
            }
        )
    return issues


def apply_pmoc_rt_fields(plan: PmocPlan, rt_data: Any | None) -> None:
    if rt_data is None:
        return
    if rt_data.responsible_name is not None:
        plan.responsible_name = rt_data.responsible_name.strip() or None
    if rt_data.responsible_council is not None:
        plan.responsible_council = rt_data.responsible_council.strip()[:16] or None
    if rt_data.responsible_registration is not None:
        plan.responsible_registration = rt_data.responsible_registration.strip()[:80] or None
    if rt_data.art_number is not None:
        plan.art_number = rt_data.art_number.strip()[:120] or None
    if rt_data.art_issued_at is not None:
        plan.art_issued_at = rt_data.art_issued_at
    if rt_data.next_air_analysis_due is not None:
        plan.next_air_analysis_due = rt_data.next_air_analysis_due
