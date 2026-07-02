"""Catálogo e solicitações da loja de integrações (tenant)."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.schemas import (
    MarketplaceCatalogItemOut,
    MarketplaceCheckoutIn,
    MarketplaceCheckoutOut,
    MarketplaceMyEntitlementOut,
    MarketplaceRequestIn,
    MarketplaceRequestOut,
)
from app.stripe_billing import require_stripe_credentials
from app.stripe_credentials import stripe_configured
from app.stripe_marketplace import add_marketplace_addon_to_subscription
from app.tenant_subscription import has_active_stripe_subscription
from models import MarketplaceApp, MarketplaceEntitlementStatus, Tenant, TenantMarketplaceEntitlement, User, UserRole

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


def _normalize_app_slug(raw: str) -> str:
    s = raw.strip().lower()
    if not s:
        raise HTTPException(status_code=400, detail="Informe o identificador do app.")
    if len(s) > 64:
        raise HTTPException(status_code=400, detail="Identificador do app muito longo.")
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789-_")
    if any(ch not in allowed for ch in s):
        raise HTTPException(status_code=400, detail="Use apenas letras minúsculas, números, '-' e '_' no identificador.")
    return s


def _money_to_float(v: Decimal | float) -> float:
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


@router.get("/catalog", response_model=list[MarketplaceCatalogItemOut])
def marketplace_catalog(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[MarketplaceCatalogItemOut]:
    apps = db.execute(
        select(MarketplaceApp).where(MarketplaceApp.is_active.is_(True)).order_by(MarketplaceApp.sort_order.asc(), MarketplaceApp.id.asc())
    ).scalars().all()
    tenant = db.get(Tenant, current_user.tenant_id)
    stripe_addon_ready = bool(tenant and stripe_configured(db) and has_active_stripe_subscription(tenant))
    ent_rows = db.execute(
        select(TenantMarketplaceEntitlement).where(TenantMarketplaceEntitlement.tenant_id == current_user.tenant_id)
    ).scalars().all()
    by_app: dict[int, TenantMarketplaceEntitlement] = {e.marketplace_app_id: e for e in ent_rows}
    out: list[MarketplaceCatalogItemOut] = []
    for a in apps:
        ent = by_app.get(a.id)
        out.append(
            MarketplaceCatalogItemOut(
                id=a.id,
                slug=a.slug,
                display_name=a.display_name,
                short_description=a.short_description,
                long_description=a.long_description,
                monthly_price_brl=_money_to_float(a.monthly_price_brl),
                setup_fee_brl=_money_to_float(a.setup_fee_brl),
                feature_flag_key=a.feature_flag_key,
                allow_quantity=bool(a.allow_quantity),
                unit_label=a.unit_label,
                user_seats_per_unit=int(a.user_seats_per_unit or 0),
                entitlement_status=ent.status.value if ent else None,
                entitlement_id=ent.id if ent else None,
                entitlement_quantity=int(ent.quantity) if ent else None,
                stripe_checkout_available=stripe_addon_ready and bool(a.stripe_price_id),
            )
        )
    return out


@router.post("/checkout", response_model=MarketplaceCheckoutOut, status_code=status.HTTP_201_CREATED)
def marketplace_stripe_checkout(
    payload: MarketplaceCheckoutIn,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> MarketplaceCheckoutOut:
    slug = _normalize_app_slug(payload.slug)
    app = db.execute(
        select(MarketplaceApp).where(MarketplaceApp.slug == slug, MarketplaceApp.is_active.is_(True))
    ).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="App não encontrado ou indisponível.")
    if payload.quantity > 1 and not app.allow_quantity:
        raise HTTPException(status_code=400, detail="Este item não permite contratação por quantidade.")

    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace não encontrado.")
    creds = require_stripe_credentials(db)
    ent = add_marketplace_addon_to_subscription(db, creds, tenant, current_user, app, payload.quantity)
    db.commit()
    db.refresh(ent)
    return MarketplaceCheckoutOut(
        slug=app.slug,
        status=ent.status.value,
        quantity=int(ent.quantity or 1),
        activated_via_stripe=True,
    )


@router.get("/my", response_model=list[MarketplaceMyEntitlementOut])
def my_marketplace_entitlements(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[MarketplaceMyEntitlementOut]:
    rows = db.execute(
        select(TenantMarketplaceEntitlement, MarketplaceApp)
        .join(MarketplaceApp, TenantMarketplaceEntitlement.marketplace_app_id == MarketplaceApp.id)
        .where(TenantMarketplaceEntitlement.tenant_id == current_user.tenant_id)
        .order_by(TenantMarketplaceEntitlement.requested_at.desc())
    ).all()
    result: list[MarketplaceMyEntitlementOut] = []
    for ent, app in rows:
        result.append(
            MarketplaceMyEntitlementOut(
                id=ent.id,
                marketplace_app_id=ent.marketplace_app_id,
                slug=app.slug,
                display_name=app.display_name,
                status=ent.status.value,
                quantity=int(ent.quantity or 1),
                requested_at=ent.requested_at,
                activated_at=ent.activated_at,
                tenant_notes=ent.tenant_notes,
            )
        )
    return result


@router.post("/request", response_model=MarketplaceRequestOut, status_code=status.HTTP_201_CREATED)
def request_marketplace_app(
    payload: MarketplaceRequestIn,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> MarketplaceRequestOut:
    slug = _normalize_app_slug(payload.slug)
    app = db.execute(select(MarketplaceApp).where(MarketplaceApp.slug == slug, MarketplaceApp.is_active.is_(True))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="App não encontrado ou indisponível.")
    if payload.quantity > 1 and not app.allow_quantity:
        raise HTTPException(status_code=400, detail="Este item não permite contratação por quantidade.")

    existing = db.execute(
        select(TenantMarketplaceEntitlement).where(
            TenantMarketplaceEntitlement.tenant_id == current_user.tenant_id,
            TenantMarketplaceEntitlement.marketplace_app_id == app.id,
        )
    ).scalar_one_or_none()
    if existing:
        if not app.allow_quantity:
            raise HTTPException(
                status_code=409,
                detail="Este app já consta para o workspace (atualize o status com o suporte se necessário).",
            )
        existing.quantity = int(existing.quantity or 1) + int(payload.quantity or 1)
        if payload.tenant_notes:
            note = payload.tenant_notes.strip()
            existing.tenant_notes = f"{(existing.tenant_notes or '').strip()} | +{payload.quantity} unidade(s): {note}".strip(" |")
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return MarketplaceRequestOut(
            id=existing.id,
            marketplace_app_id=existing.marketplace_app_id,
            slug=app.slug,
            status=existing.status.value,
            quantity=int(existing.quantity or 1),
            requested_at=existing.requested_at,
        )

    ent = TenantMarketplaceEntitlement(
        tenant_id=current_user.tenant_id,
        marketplace_app_id=app.id,
        quantity=int(payload.quantity or 1),
        tenant_notes=payload.tenant_notes.strip() if payload.tenant_notes else None,
    )
    db.add(ent)
    db.commit()
    db.refresh(ent)
    return MarketplaceRequestOut(
        id=ent.id,
        marketplace_app_id=ent.marketplace_app_id,
        slug=app.slug,
        status=ent.status.value,
        quantity=int(ent.quantity or 1),
        requested_at=ent.requested_at,
    )


@router.post("/{entitlement_id}/cancel", response_model=MarketplaceRequestOut)
def cancel_marketplace_request(
    entitlement_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
) -> MarketplaceRequestOut:
    ent = db.execute(
        select(TenantMarketplaceEntitlement, MarketplaceApp)
        .join(MarketplaceApp, TenantMarketplaceEntitlement.marketplace_app_id == MarketplaceApp.id)
        .where(
            TenantMarketplaceEntitlement.id == entitlement_id,
            TenantMarketplaceEntitlement.tenant_id == current_user.tenant_id,
        )
    ).one_or_none()
    if ent is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")

    entitlement, app = ent
    if entitlement.status.value != "requested":
        raise HTTPException(status_code=400, detail="Só é possível cancelar solicitações com status Solicitado.")

    entitlement.status = MarketplaceEntitlementStatus.CANCELLED
    db.add(entitlement)
    db.commit()
    db.refresh(entitlement)
    return MarketplaceRequestOut(
        id=entitlement.id,
        marketplace_app_id=entitlement.marketplace_app_id,
        slug=app.slug,
        status=entitlement.status.value,
        quantity=int(entitlement.quantity or 1),
        requested_at=entitlement.requested_at,
    )
