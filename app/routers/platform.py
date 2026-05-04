"""Rotas exclusivas de operadores da plataforma (não clientes do ERP)."""

import json
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_platform_operator
from app.schemas import (
    PlatformApiCredentialOut,
    PlatformApiCredentialUpsertRequest,
    PlatformLoginAttemptAuditOut,
    PlatformSessionOut,
    PlatformTenantDetailOut,
    PlatformTenantListItemOut,
    PlatformTenantPlanChangeLogOut,
    PlatformTenantPlanUpdateRequest,
    SaasPlanCatalogCreate,
    SaasPlanCatalogOut,
    SaasPlanCatalogUpdate,
)
from app.plan_rules import normalize_plan_key
from app.saas_plan_effective import count_tenants_using_plan_key, effective_plan_label_and_max_users
from app.security import encrypt_platform_secret
from models import (
    Client,
    LoginAttemptAudit,
    MarketplaceApp,
    MarketplaceEntitlementStatus,
    PlatformApiCredential,
    SaasPlanCatalog,
    Schedule,
    ServiceOrder,
    Tenant,
    TenantMarketplaceEntitlement,
    TenantPlanChangeLog,
    User,
    UserRole,
)

router = APIRouter(prefix="/platform", tags=["platform"])


@router.get("/session", response_model=PlatformSessionOut)
def platform_session(current_user: Annotated[User, Depends(require_platform_operator)]) -> PlatformSessionOut:
    """Valida o token e confirma que a sessão pertence a um operador da plataforma."""
    return PlatformSessionOut(
        email=current_user.email,
        full_name=current_user.full_name,
        tenant_id=current_user.tenant_id,
    )


def _normalize_provider_slug(provider_slug: str) -> str:
    s = provider_slug.strip().lower()
    if not s:
        raise HTTPException(status_code=400, detail="Informe o identificador do provedor.")
    if len(s) > 64:
        raise HTTPException(status_code=400, detail="Identificador do provedor muito longo.")
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789-_")
    if any(ch not in allowed for ch in s):
        raise HTTPException(status_code=400, detail="Use apenas letras, números, '-' e '_' no provedor.")
    return s


def _to_out(row: PlatformApiCredential) -> PlatformApiCredentialOut:
    extra: dict | None = None
    if row.extra_config_json:
        try:
            parsed = json.loads(row.extra_config_json)
            if isinstance(parsed, dict):
                extra = parsed
        except json.JSONDecodeError:
            extra = None
    return PlatformApiCredentialOut(
        id=row.id,
        provider_slug=row.provider_slug,
        display_name=row.display_name,
        api_base_url=row.api_base_url,
        has_api_key=bool(row.api_key_secret),
        api_key_preview=row.api_key_preview,
        has_aws_access_key_id=bool(row.aws_access_key_id),
        aws_access_key_id_preview=row.aws_access_key_id_preview,
        has_aws_secret_access_key=bool(row.aws_secret_access_key),
        aws_secret_access_key_preview=row.aws_secret_access_key_preview,
        aws_keys_updated_at=row.aws_keys_updated_at,
        extra_config=extra,
        key_updated_at=row.key_updated_at,
        updated_at=row.updated_at,
    )


def _mask_api_key(raw: str) -> str:
    if len(raw) <= 6:
        return "***"
    return f"{raw[:4]}...{raw[-2:]}"


def _to_tenant_list_item(
    tenant: Tenant,
    *,
    registration_email: str | None = None,
    users_count: int = 0,
    base_user_limit: int | None = None,
    extra_user_seats: int = 0,
    total_user_limit: int | None = None,
    clients_count: int = 0,
    service_orders_count: int = 0,
    schedules_count: int = 0,
) -> PlatformTenantListItemOut:
    return PlatformTenantListItemOut(
        id=tenant.id,
        name=tenant.name,
        tax_id_kind=tenant.tax_id_kind,
        tax_document=tenant.cnpj,
        status=tenant.status,
        active_plan=tenant.active_plan,
        timezone=tenant.timezone,
        created_at=tenant.created_at,
        registration_email=registration_email,
        users_count=users_count,
        base_user_limit=base_user_limit,
        extra_user_seats=extra_user_seats,
        total_user_limit=total_user_limit,
        clients_count=clients_count,
        service_orders_count=service_orders_count,
        schedules_count=schedules_count,
    )


def _to_tenant_detail_out(db: Session, tenant: Tenant) -> PlatformTenantDetailOut:
    tenant_id = tenant.id
    users_count = db.execute(select(func.count(User.id)).where(User.tenant_id == tenant_id)).scalar_one()
    clients_count = db.execute(select(func.count(Client.id)).where(Client.tenant_id == tenant_id)).scalar_one()
    orders_count = db.execute(select(func.count(ServiceOrder.id)).where(ServiceOrder.tenant_id == tenant_id)).scalar_one()
    schedules_count = db.execute(select(func.count(Schedule.id)).where(Schedule.tenant_id == tenant_id)).scalar_one()
    registration_email_row = db.execute(
        select(User.email).where(User.tenant_id == tenant_id, User.role == UserRole.ADMIN).order_by(User.id.asc()).limit(1)
    ).scalar_one_or_none()
    logs = db.execute(
        select(TenantPlanChangeLog)
        .where(TenantPlanChangeLog.tenant_id == tenant_id)
        .order_by(TenantPlanChangeLog.changed_at.desc(), TenantPlanChangeLog.id.desc())
        .limit(30)
    ).scalars().all()
    base_user_limit, extra_user_seats, total_user_limit = _tenant_user_capacity(db, tenant)
    return PlatformTenantDetailOut(
        **_to_tenant_list_item(
            tenant,
            registration_email=str(registration_email_row) if registration_email_row else None,
            users_count=int(users_count),
            base_user_limit=base_user_limit,
            extra_user_seats=extra_user_seats,
            total_user_limit=total_user_limit,
            clients_count=int(clients_count),
            service_orders_count=int(orders_count),
            schedules_count=int(schedules_count),
        ).model_dump(),
        business_days=tenant.business_days,
        workday_start=tenant.workday_start,
        workday_end=tenant.workday_end,
        phone=tenant.phone,
        email=tenant.email,
        website=tenant.website,
        address_city=tenant.address_city,
        address_state=tenant.address_state,
        plan_change_logs=[
            PlatformTenantPlanChangeLogOut(
                id=log.id,
                previous_plan=log.previous_plan,
                new_plan=log.new_plan,
                changed_by_user_id=log.changed_by_user_id,
                changed_by_email=log.changed_by_email,
                changed_at=log.changed_at,
            )
            for log in logs
        ],
    )


def _tenant_user_capacity(db: Session, tenant: Tenant) -> tuple[int | None, int, int | None]:
    _label, base_limit = effective_plan_label_and_max_users(db, tenant)
    extra_seats = db.execute(
        select(func.coalesce(func.sum(TenantMarketplaceEntitlement.quantity * MarketplaceApp.user_seats_per_unit), 0))
        .select_from(TenantMarketplaceEntitlement)
        .join(MarketplaceApp, MarketplaceApp.id == TenantMarketplaceEntitlement.marketplace_app_id)
        .where(
            TenantMarketplaceEntitlement.tenant_id == tenant.id,
            TenantMarketplaceEntitlement.status == MarketplaceEntitlementStatus.ACTIVE,
            MarketplaceApp.user_seats_per_unit > 0,
        )
    ).scalar_one()
    extra = int(extra_seats or 0)
    if base_limit is None:
        return None, extra, None
    return int(base_limit), extra, int(base_limit) + extra


def _query_plan_change_logs(
    db: Session,
    *,
    tenant_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 200,
) -> list[TenantPlanChangeLog]:
    stmt = select(TenantPlanChangeLog).where(TenantPlanChangeLog.tenant_id == tenant_id)
    if start_date is not None:
        stmt = stmt.where(func.date(TenantPlanChangeLog.changed_at) >= start_date)
    if end_date is not None:
        stmt = stmt.where(func.date(TenantPlanChangeLog.changed_at) <= end_date)
    stmt = stmt.order_by(TenantPlanChangeLog.changed_at.desc(), TenantPlanChangeLog.id.desc()).limit(limit)
    return db.execute(stmt).scalars().all()


@router.get("/api-credentials", response_model=list[PlatformApiCredentialOut])
def list_platform_api_credentials(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
) -> list[PlatformApiCredentialOut]:
    rows = db.execute(select(PlatformApiCredential).order_by(PlatformApiCredential.provider_slug.asc())).scalars().all()
    return [_to_out(r) for r in rows]


@router.get("/tenants", response_model=list[PlatformTenantListItemOut])
def list_platform_tenants(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
    q: Annotated[str | None, Query(description="Filtro por nome, e-mail ou documento (CPF/CNPJ).")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[PlatformTenantListItemOut]:
    stmt = select(Tenant).order_by(Tenant.created_at.desc(), Tenant.id.desc()).offset(skip).limit(limit)
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = (
            select(Tenant)
            .where(
                func.lower(Tenant.name).like(term) | func.lower(func.coalesce(Tenant.email, "")).like(term) | Tenant.cnpj.like(term)
            )
            .order_by(Tenant.created_at.desc(), Tenant.id.desc())
            .offset(skip)
            .limit(limit)
        )
    rows = db.execute(stmt).scalars().all()
    if not rows:
        return []
    tenant_ids = [t.id for t in rows]

    users_map = {
        int(tid): int(total)
        for tid, total in db.execute(
            select(User.tenant_id, func.count(User.id)).where(User.tenant_id.in_(tenant_ids)).group_by(User.tenant_id)
        ).all()
    }
    tenant_by_id: dict[int, Tenant] = {int(t.id): t for t in rows}
    capacity_map: dict[int, tuple[int | None, int, int | None]] = {
        tid: _tenant_user_capacity(db, tenant_by_id[tid]) for tid in tenant_by_id
    }
    clients_map = {
        int(tid): int(total)
        for tid, total in db.execute(
            select(Client.tenant_id, func.count(Client.id)).where(Client.tenant_id.in_(tenant_ids)).group_by(Client.tenant_id)
        ).all()
    }
    orders_map = {
        int(tid): int(total)
        for tid, total in db.execute(
            select(ServiceOrder.tenant_id, func.count(ServiceOrder.id))
            .where(ServiceOrder.tenant_id.in_(tenant_ids))
            .group_by(ServiceOrder.tenant_id)
        ).all()
    }
    schedules_map = {
        int(tid): int(total)
        for tid, total in db.execute(
            select(Schedule.tenant_id, func.count(Schedule.id)).where(Schedule.tenant_id.in_(tenant_ids)).group_by(Schedule.tenant_id)
        ).all()
    }
    admin_email_map: dict[int, str] = {}
    admin_rows = db.execute(
        select(User.tenant_id, User.email)
        .where(User.tenant_id.in_(tenant_ids), User.role == UserRole.ADMIN)
        .order_by(User.tenant_id.asc(), User.id.asc())
    ).all()
    for tid, email in admin_rows:
        if int(tid) not in admin_email_map:
            admin_email_map[int(tid)] = str(email)

    return [
        _to_tenant_list_item(
            t,
            registration_email=admin_email_map.get(t.id),
            users_count=users_map.get(t.id, 0),
            base_user_limit=capacity_map.get(t.id, (None, 0, None))[0],
            extra_user_seats=capacity_map.get(t.id, (None, 0, None))[1],
            total_user_limit=capacity_map.get(t.id, (None, 0, None))[2],
            clients_count=clients_map.get(t.id, 0),
            service_orders_count=orders_map.get(t.id, 0),
            schedules_count=schedules_map.get(t.id, 0),
        )
        for t in rows
    ]


@router.get("/tenants/{tenant_id}", response_model=PlatformTenantDetailOut)
def get_platform_tenant(
    tenant_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformTenantDetailOut:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Cliente SaaS não encontrado.")
    return _to_tenant_detail_out(db, tenant)


@router.patch("/tenants/{tenant_id}/plan", response_model=PlatformTenantDetailOut)
def update_platform_tenant_plan(
    tenant_id: int,
    payload: PlatformTenantPlanUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformTenantDetailOut:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Cliente SaaS não encontrado.")
    previous_plan = tenant.active_plan
    new_plan = payload.active_plan
    if previous_plan != new_plan:
        tenant.active_plan = new_plan
        db.add(tenant)
        db.add(
            TenantPlanChangeLog(
                tenant_id=tenant.id,
                previous_plan=previous_plan,
                new_plan=new_plan,
                changed_by_user_id=current_user.id,
                changed_by_email=current_user.email,
            )
        )
        db.commit()
        db.refresh(tenant)
    return _to_tenant_detail_out(db, tenant)


@router.get("/tenants/{tenant_id}/plan-change-logs", response_model=list[PlatformTenantPlanChangeLogOut])
def list_platform_tenant_plan_change_logs(
    tenant_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
) -> list[PlatformTenantPlanChangeLogOut]:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Cliente SaaS não encontrado.")
    if start_date is not None and end_date is not None and end_date < start_date:
        raise HTTPException(status_code=400, detail="Período inválido.")
    rows = _query_plan_change_logs(db, tenant_id=tenant_id, start_date=start_date, end_date=end_date, limit=limit)
    return [
        PlatformTenantPlanChangeLogOut(
            id=row.id,
            previous_plan=row.previous_plan,
            new_plan=row.new_plan,
            changed_by_user_id=row.changed_by_user_id,
            changed_by_email=row.changed_by_email,
            changed_at=row.changed_at,
        )
        for row in rows
    ]


@router.get("/tenants/{tenant_id}/plan-change-logs.csv")
def export_platform_tenant_plan_change_logs_csv(
    tenant_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 1000,
) -> Response:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Cliente SaaS não encontrado.")
    if start_date is not None and end_date is not None and end_date < start_date:
        raise HTTPException(status_code=400, detail="Período inválido.")
    rows = _query_plan_change_logs(db, tenant_id=tenant_id, start_date=start_date, end_date=end_date, limit=limit)
    lines = ["id,changed_at,previous_plan,new_plan,changed_by_user_id,changed_by_email"]
    for row in rows:
        changed_at = row.changed_at.isoformat()
        prev = (row.previous_plan or "").replace('"', '""')
        new = (row.new_plan or "").replace('"', '""')
        by_email = (row.changed_by_email or "").replace('"', '""')
        by_user = "" if row.changed_by_user_id is None else str(row.changed_by_user_id)
        lines.append(f'{row.id},"{changed_at}","{prev}","{new}","{by_user}","{by_email}"')
    csv_bytes = ("\n".join(lines) + "\n").encode("utf-8")
    filename = f"tenant-{tenant_id}-plan-change-logs.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/security/login-attempts", response_model=list[PlatformLoginAttemptAuditOut])
def list_platform_login_attempts(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
    email: Annotated[str | None, Query(description="Filtro por e-mail (parcial).")] = None,
    outcome: Annotated[str | None, Query(description="Filtro por resultado: success/failure/blocked/challenge.")] = None,
    start_date: Annotated[date | None, Query(description="Data inicial (YYYY-MM-DD).")] = None,
    end_date: Annotated[date | None, Query(description="Data final (YYYY-MM-DD).")] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
) -> list[PlatformLoginAttemptAuditOut]:
    if start_date is not None and end_date is not None and end_date < start_date:
        raise HTTPException(status_code=400, detail="Período inválido.")
    stmt = select(LoginAttemptAudit)
    if email:
        term = f"%{email.strip().lower()}%"
        stmt = stmt.where(func.lower(LoginAttemptAudit.email).like(term))
    if outcome:
        stmt = stmt.where(LoginAttemptAudit.outcome == outcome.strip().lower())
    if start_date is not None:
        stmt = stmt.where(func.date(LoginAttemptAudit.created_at) >= start_date)
    if end_date is not None:
        stmt = stmt.where(func.date(LoginAttemptAudit.created_at) <= end_date)
    stmt = stmt.order_by(LoginAttemptAudit.created_at.desc(), LoginAttemptAudit.id.desc()).limit(limit)
    rows = db.execute(stmt).scalars().all()
    return [
        PlatformLoginAttemptAuditOut(
            id=row.id,
            email=row.email,
            tenant_id=row.tenant_id,
            user_id=row.user_id,
            ip_address=row.ip_address,
            user_agent=row.user_agent,
            device_fingerprint=row.device_fingerprint,
            outcome=row.outcome,
            reason=row.reason,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/security/login-attempts.csv")
def export_platform_login_attempts_csv(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
    email: Annotated[str | None, Query(description="Filtro por e-mail (parcial).")] = None,
    outcome: Annotated[str | None, Query(description="Filtro por resultado: success/failure/blocked/challenge.")] = None,
    start_date: Annotated[date | None, Query(description="Data inicial (YYYY-MM-DD).")] = None,
    end_date: Annotated[date | None, Query(description="Data final (YYYY-MM-DD).")] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 1000,
) -> Response:
    if start_date is not None and end_date is not None and end_date < start_date:
        raise HTTPException(status_code=400, detail="Período inválido.")
    stmt = select(LoginAttemptAudit)
    if email:
        term = f"%{email.strip().lower()}%"
        stmt = stmt.where(func.lower(LoginAttemptAudit.email).like(term))
    if outcome:
        stmt = stmt.where(LoginAttemptAudit.outcome == outcome.strip().lower())
    if start_date is not None:
        stmt = stmt.where(func.date(LoginAttemptAudit.created_at) >= start_date)
    if end_date is not None:
        stmt = stmt.where(func.date(LoginAttemptAudit.created_at) <= end_date)
    stmt = stmt.order_by(LoginAttemptAudit.created_at.desc(), LoginAttemptAudit.id.desc()).limit(limit)
    rows = db.execute(stmt).scalars().all()
    lines = ["id,created_at,email,tenant_id,user_id,ip_address,outcome,reason,device_fingerprint,user_agent"]
    for row in rows:
        created_at = row.created_at.isoformat()
        safe_email = (row.email or "").replace('"', '""')
        safe_ip = (row.ip_address or "").replace('"', '""')
        safe_outcome = (row.outcome or "").replace('"', '""')
        safe_reason = (row.reason or "").replace('"', '""')
        safe_fp = (row.device_fingerprint or "").replace('"', '""')
        safe_ua = (row.user_agent or "").replace('"', '""')
        tenant_id = "" if row.tenant_id is None else str(row.tenant_id)
        user_id = "" if row.user_id is None else str(row.user_id)
        lines.append(
            f'{row.id},"{created_at}","{safe_email}","{tenant_id}","{user_id}","{safe_ip}","{safe_outcome}","{safe_reason}","{safe_fp}","{safe_ua}"'
        )
    csv_bytes = ("\n".join(lines) + "\n").encode("utf-8")
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="platform-login-attempts.csv"'},
    )

@router.delete("/tenants/{tenant_id}", status_code=204)
def delete_platform_tenant(
    tenant_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
) -> None:
    if tenant_id == current_user.tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Não é permitido excluir o tenant da própria sessão de operação.",
        )
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Cliente SaaS não encontrado.")
    try:
        # Usa cascata ORM para remover registros relacionados mesmo em bancos legados
        # onde alguns FKs podem não estar com ON DELETE CASCADE.
        db.delete(tenant)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Não foi possível excluir o cliente porque existem registros vinculados que bloqueiam a remoção.",
        ) from exc


@router.get("/api-credentials/{provider_slug}", response_model=PlatformApiCredentialOut)
def get_platform_api_credential(
    provider_slug: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformApiCredentialOut:
    slug = _normalize_provider_slug(provider_slug)
    row = db.execute(select(PlatformApiCredential).where(PlatformApiCredential.provider_slug == slug)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Credencial não encontrada para este provedor.")
    return _to_out(row)


@router.put("/api-credentials/{provider_slug}", response_model=PlatformApiCredentialOut)
def upsert_platform_api_credential(
    provider_slug: str,
    payload: PlatformApiCredentialUpsertRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformApiCredentialOut:
    slug = _normalize_provider_slug(provider_slug)
    row = db.execute(select(PlatformApiCredential).where(PlatformApiCredential.provider_slug == slug)).scalar_one_or_none()
    if row is None:
        row = PlatformApiCredential(provider_slug=slug, display_name=payload.display_name)
        db.add(row)

    row.display_name = payload.display_name
    row.api_base_url = payload.api_base_url
    row.extra_config_json = json.dumps(payload.extra_config, ensure_ascii=False) if payload.extra_config is not None else None

    if payload.clear_api_key:
        row.api_key_secret = None
        row.api_key_preview = None
        row.key_updated_at = datetime.now(timezone.utc)
    elif payload.api_key is not None:
        row.api_key_secret = encrypt_platform_secret(payload.api_key)
        row.api_key_preview = _mask_api_key(payload.api_key)
        row.key_updated_at = datetime.now(timezone.utc)

    if payload.clear_aws_keys:
        row.aws_access_key_id = None
        row.aws_access_key_id_preview = None
        row.aws_secret_access_key = None
        row.aws_secret_access_key_preview = None
        row.aws_keys_updated_at = datetime.now(timezone.utc)
    else:
        updated_aws = False
        if payload.aws_access_key_id is not None:
            row.aws_access_key_id = encrypt_platform_secret(payload.aws_access_key_id)
            row.aws_access_key_id_preview = _mask_api_key(payload.aws_access_key_id)
            updated_aws = True
        if payload.aws_secret_access_key is not None:
            row.aws_secret_access_key = encrypt_platform_secret(payload.aws_secret_access_key)
            row.aws_secret_access_key_preview = _mask_api_key(payload.aws_secret_access_key)
            updated_aws = True
        if updated_aws:
            row.aws_keys_updated_at = datetime.now(timezone.utc)

    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.get("/saas-plans", response_model=list[SaasPlanCatalogOut])
def list_saas_plans(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
    for_matrix: Annotated[bool, Query(description="Somente planos exibidos na matriz do painel.")] = False,
    for_tenant_select: Annotated[
        bool, Query(description="Somente planos que aparecem no seletor ao editar clientes.")
    ] = False,
) -> list[SaasPlanCatalog]:
    stmt = select(SaasPlanCatalog).order_by(SaasPlanCatalog.sort_order.asc(), SaasPlanCatalog.plan_key.asc())
    if for_matrix:
        stmt = stmt.where(SaasPlanCatalog.show_in_matrix.is_(True))
    if for_tenant_select:
        stmt = stmt.where(SaasPlanCatalog.is_selectable_for_tenants.is_(True))
    return list(db.execute(stmt).scalars().all())


@router.post("/saas-plans", response_model=SaasPlanCatalogOut, status_code=201)
def create_saas_plan(
    payload: SaasPlanCatalogCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
) -> SaasPlanCatalog:
    key = normalize_plan_key(payload.plan_key)
    if db.get(SaasPlanCatalog, key) is not None:
        raise HTTPException(status_code=409, detail="Já existe um plano com esta chave.")
    row = SaasPlanCatalog(
        plan_key=key,
        display_name=payload.display_name.strip(),
        description=(payload.description or "").strip(),
        footnote=(payload.footnote or "").strip(),
        finance_max_mode=payload.finance_max_mode,
        max_users=payload.max_users,
        sort_order=payload.sort_order,
        is_beta_internal=payload.is_beta_internal,
        can_contract=payload.can_contract,
        is_selectable_for_tenants=payload.is_selectable_for_tenants,
        show_in_matrix=payload.show_in_matrix,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/saas-plans/{plan_key}", response_model=SaasPlanCatalogOut)
def update_saas_plan(
    plan_key: str,
    payload: SaasPlanCatalogUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
) -> SaasPlanCatalog:
    key = normalize_plan_key(plan_key)
    row = db.get(SaasPlanCatalog, key)
    if row is None:
        raise HTTPException(status_code=404, detail="Plano não encontrado no catálogo.")
    data = payload.model_dump(exclude_unset=True)
    for field_name, value in data.items():
        if field_name == "display_name" and isinstance(value, str):
            setattr(row, field_name, value.strip())
        elif field_name in ("description", "footnote") and isinstance(value, str):
            setattr(row, field_name, value.strip())
        else:
            setattr(row, field_name, value)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/saas-plans/{plan_key}", status_code=204)
def delete_saas_plan(
    plan_key: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_platform_operator)],
) -> Response:
    key = normalize_plan_key(plan_key)
    row = db.get(SaasPlanCatalog, key)
    if row is None:
        raise HTTPException(status_code=404, detail="Plano não encontrado no catálogo.")
    if count_tenants_using_plan_key(db, key) > 0:
        raise HTTPException(
            status_code=409,
            detail="Não é possível excluir: existem workspaces usando este plano (por chave ou alias).",
        )
    db.delete(row)
    db.commit()
    return Response(status_code=204)
