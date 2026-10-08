"""Gestão da loja de apps e solicitações (operadores da plataforma)."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_platform_operator
from app.schemas import (
    PlatformMarketplaceAppCreate,
    PlatformMarketplaceAppOut,
    PlatformMarketplaceAppUpdate,
    PlatformMarketplaceEntitlementOut,
    PlatformMarketplaceEntitlementUpdate,
)
from models import (
    MarketplaceApp,
    MarketplaceEntitlementStatus,
    Tenant,
    TenantMarketplaceEntitlement,
    User,
)

router = APIRouter(prefix="/platform/marketplace", tags=["platform-marketplace"])


def _normalize_slug(raw: str) -> str:
    s = raw.strip().lower()
    if not s:
        raise HTTPException(status_code=400, detail="Informe o slug do app.")
    if len(s) > 64:
        raise HTTPException(status_code=400, detail="Slug muito longo.")
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789-_")
    if any(ch not in allowed for ch in s):
        raise HTTPException(status_code=400, detail="Use apenas letras minúsculas, números, '-' e '_' no slug.")
    return s


def _money_to_float(v: Decimal | float) -> float:
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _app_to_out(row: MarketplaceApp) -> PlatformMarketplaceAppOut:
    return PlatformMarketplaceAppOut(
        id=row.id,
        slug=row.slug,
        display_name=row.display_name,
        short_description=row.short_description,
        long_description=row.long_description,
        monthly_price_brl=_money_to_float(row.monthly_price_brl),
        setup_fee_brl=_money_to_float(row.setup_fee_brl),
        feature_flag_key=row.feature_flag_key,
        allow_quantity=bool(row.allow_quantity),
        unit_label=row.unit_label,
        user_seats_per_unit=int(row.user_seats_per_unit or 0),
        sort_order=row.sort_order,
        is_active=row.is_active,
        created_at=row.created_at,
    )


@router.post("/bootstrap-finance-apps", response_model=list[PlatformMarketplaceAppOut])
def platform_bootstrap_finance_apps(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> list[PlatformMarketplaceAppOut]:
    presets = [
        {
            "slug": "finance-intermediate",
            "display_name": "Financeiro Intermediário",
            "short_description": "Desbloqueia categorias avançadas, análises por categoria e visão intermediária do financeiro.",
            "monthly_price_brl": 69.0,
            "setup_fee_brl": 0.0,
            "feature_flag_key": "finance_intermediate",
            "allow_quantity": False,
            "unit_label": None,
            "user_seats_per_unit": 0,
            "sort_order": 30,
            "is_active": True,
        },
        {
            "slug": "finance-management",
            "display_name": "Gestão Financeira Completa",
            "short_description": "Desbloqueia gestão financeira completa com controles avançados e operação profissional.",
            "monthly_price_brl": 129.0,
            "setup_fee_brl": 0.0,
            "feature_flag_key": "finance_management",
            "allow_quantity": False,
            "unit_label": None,
            "user_seats_per_unit": 0,
            "sort_order": 31,
            "is_active": True,
        },
        {
            "slug": "whatsapp",
            "display_name": "WhatsApp Oficial",
            "short_description": "Habilita integração oficial de WhatsApp para lembretes e confirmações.",
            "monthly_price_brl": 49.9,
            "setup_fee_brl": 0.0,
            "feature_flag_key": "integration_whatsapp",
            "allow_quantity": False,
            "unit_label": None,
            "user_seats_per_unit": 0,
            "sort_order": 20,
            "is_active": True,
        },
        {
            "slug": "extra-user-seat",
            "display_name": "Acesso extra por usuário",
            "short_description": "Adicione acessos extras além do limite do plano.",
            "monthly_price_brl": 19.9,
            "setup_fee_brl": 0.0,
            "feature_flag_key": "extra_user_seat",
            "allow_quantity": True,
            "unit_label": "usuário",
            "user_seats_per_unit": 1,
            "sort_order": 21,
            "is_active": True,
        },
    ]
    out: list[PlatformMarketplaceAppOut] = []
    for preset in presets:
        existing = db.execute(select(MarketplaceApp).where(MarketplaceApp.slug == preset["slug"]).limit(1)).scalar_one_or_none()
        if existing is None:
            row = MarketplaceApp(**preset)
            db.add(row)
            db.flush()
            out.append(_app_to_out(row))
        else:
            out.append(_app_to_out(existing))
    db.commit()
    return out


@router.get("/apps", response_model=list[PlatformMarketplaceAppOut])
def platform_list_apps(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
    include_inactive: Annotated[bool, Query()] = True,
) -> list[PlatformMarketplaceAppOut]:
    q = select(MarketplaceApp).order_by(MarketplaceApp.sort_order.asc(), MarketplaceApp.id.asc())
    if not include_inactive:
        q = q.where(MarketplaceApp.is_active.is_(True))
    rows = db.execute(q).scalars().all()
    return [_app_to_out(r) for r in rows]


@router.post("/apps", response_model=PlatformMarketplaceAppOut, status_code=status.HTTP_201_CREATED)
def platform_create_app(
    payload: PlatformMarketplaceAppCreate,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformMarketplaceAppOut:
    slug = _normalize_slug(payload.slug)
    clash = db.execute(select(MarketplaceApp.id).where(MarketplaceApp.slug == slug).limit(1)).scalar_one_or_none()
    if clash is not None:
        raise HTTPException(status_code=409, detail="Já existe um app com esse slug.")
    row = MarketplaceApp(
        slug=slug,
        display_name=payload.display_name.strip(),
        short_description=payload.short_description.strip(),
        long_description=payload.long_description.strip() if payload.long_description else None,
        monthly_price_brl=payload.monthly_price_brl,
        setup_fee_brl=payload.setup_fee_brl,
        feature_flag_key=payload.feature_flag_key.strip(),
        allow_quantity=payload.allow_quantity,
        unit_label=payload.unit_label.strip() if payload.unit_label else None,
        user_seats_per_unit=payload.user_seats_per_unit,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _app_to_out(row)


@router.patch("/apps/{app_id}", response_model=PlatformMarketplaceAppOut)
def platform_update_app(
    app_id: int,
    payload: PlatformMarketplaceAppUpdate,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformMarketplaceAppOut:
    row = db.get(MarketplaceApp, app_id)
    if not row:
        raise HTTPException(status_code=404, detail="App não encontrado.")
    data = payload.model_dump(exclude_unset=True)
    if "display_name" in data and data["display_name"] is not None:
        row.display_name = data["display_name"].strip()
    if "short_description" in data and data["short_description"] is not None:
        row.short_description = data["short_description"].strip()
    if "long_description" in data:
        row.long_description = data["long_description"].strip() if data["long_description"] else None
    if "monthly_price_brl" in data and data["monthly_price_brl"] is not None:
        row.monthly_price_brl = data["monthly_price_brl"]
    if "setup_fee_brl" in data and data["setup_fee_brl"] is not None:
        row.setup_fee_brl = data["setup_fee_brl"]
    if "feature_flag_key" in data and data["feature_flag_key"] is not None:
        row.feature_flag_key = data["feature_flag_key"].strip()
    if "allow_quantity" in data and data["allow_quantity"] is not None:
        row.allow_quantity = bool(data["allow_quantity"])
    if "unit_label" in data:
        row.unit_label = data["unit_label"].strip() if data["unit_label"] else None
    if "user_seats_per_unit" in data and data["user_seats_per_unit"] is not None:
        row.user_seats_per_unit = int(data["user_seats_per_unit"])
    if "sort_order" in data and data["sort_order"] is not None:
        row.sort_order = data["sort_order"]
    if "is_active" in data and data["is_active"] is not None:
        row.is_active = data["is_active"]
    db.commit()
    db.refresh(row)
    return _app_to_out(row)


def _entitlement_to_out(ent: TenantMarketplaceEntitlement, tenant: Tenant, app: MarketplaceApp) -> PlatformMarketplaceEntitlementOut:
    return PlatformMarketplaceEntitlementOut(
        id=ent.id,
        tenant_id=ent.tenant_id,
        tenant_name=tenant.name,
        marketplace_app_id=ent.marketplace_app_id,
        app_slug=app.slug,
        app_display_name=app.display_name,
        status=ent.status.value,
        quantity=int(ent.quantity or 1),
        requested_at=ent.requested_at,
        activated_at=ent.activated_at,
        tenant_notes=ent.tenant_notes,
        internal_notes=ent.internal_notes,
        updated_at=ent.updated_at,
    )


@router.get("/entitlements", response_model=list[PlatformMarketplaceEntitlementOut])
def platform_list_entitlements(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
    tenant_id: Annotated[int | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[PlatformMarketplaceEntitlementOut]:
    q = (
        select(TenantMarketplaceEntitlement, Tenant, MarketplaceApp)
        .join(Tenant, TenantMarketplaceEntitlement.tenant_id == Tenant.id)
        .join(MarketplaceApp, TenantMarketplaceEntitlement.marketplace_app_id == MarketplaceApp.id)
    )
    if tenant_id is not None:
        q = q.where(TenantMarketplaceEntitlement.tenant_id == tenant_id)
    if status_filter:
        try:
            st = MarketplaceEntitlementStatus(status_filter)
        except ValueError:
            raise HTTPException(status_code=400, detail="Status inválido.") from None
        q = q.where(TenantMarketplaceEntitlement.status == st)
    q = q.order_by(TenantMarketplaceEntitlement.updated_at.desc()).offset(skip).limit(limit)
    rows = db.execute(q).all()
    return [_entitlement_to_out(ent, tenant, app) for ent, tenant, app in rows]


@router.patch("/entitlements/{entitlement_id}", response_model=PlatformMarketplaceEntitlementOut)
def platform_update_entitlement(
    entitlement_id: int,
    payload: PlatformMarketplaceEntitlementUpdate,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformMarketplaceEntitlementOut:
    ent = db.get(TenantMarketplaceEntitlement, entitlement_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    try:
        new_status = MarketplaceEntitlementStatus(payload.status)
    except ValueError:
        raise HTTPException(status_code=400, detail="Status inválido.") from None

    ent.status = new_status
    if payload.quantity is not None:
        ent.quantity = int(payload.quantity)
    if payload.internal_notes is not None:
        ent.internal_notes = payload.internal_notes.strip() if payload.internal_notes else None

    now = datetime.now(timezone.utc)
    if new_status == MarketplaceEntitlementStatus.ACTIVE and ent.activated_at is None:
        ent.activated_at = now
    db.commit()
    db.refresh(ent)

    tenant = db.get(Tenant, ent.tenant_id)
    app = db.get(MarketplaceApp, ent.marketplace_app_id)
    if not tenant or not app:
        raise HTTPException(status_code=500, detail="Dados relacionados inconsistentes.")
    return _entitlement_to_out(ent, tenant, app)
