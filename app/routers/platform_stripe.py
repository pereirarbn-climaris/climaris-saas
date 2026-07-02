"""Operação: sincronização de planos com Stripe."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_platform_operator
from app.plan_rules import normalize_plan_key
from app.schemas import PlatformMarketplaceAppOut, SaasPlanCatalogOut, StripePlatformStatusOut
from app.stripe_billing import require_stripe_credentials, sync_plan_to_stripe
from app.stripe_credentials import resolve_stripe_credentials, stripe_configured
from app.stripe_marketplace import sync_marketplace_app_to_stripe
from models import MarketplaceApp, SaasPlanCatalog, User

router = APIRouter(prefix="/platform/stripe", tags=["platform-stripe"])


@router.get("/status", response_model=StripePlatformStatusOut)
def platform_stripe_status(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> StripePlatformStatusOut:
    creds = resolve_stripe_credentials(db)
    return StripePlatformStatusOut(
        configured=stripe_configured(db),
        has_webhook_secret=bool(creds and creds.webhook_secret),
        has_publishable_key=bool(creds and creds.publishable_key),
        webhook_url_hint="/api/v1/webhooks/stripe",
    )


@router.post("/sync-plan/{plan_key}", response_model=SaasPlanCatalogOut)
def platform_sync_plan_to_stripe(
    plan_key: str,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> SaasPlanCatalog:
    key = normalize_plan_key(plan_key)
    row = db.get(SaasPlanCatalog, key)
    if row is None:
        raise HTTPException(status_code=404, detail="Plano não encontrado no catálogo.")
    creds = require_stripe_credentials(db)
    sync_plan_to_stripe(db, creds, row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/sync-marketplace-app/{app_id}", response_model=PlatformMarketplaceAppOut)
def platform_sync_marketplace_app_to_stripe(
    app_id: int,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> PlatformMarketplaceAppOut:
    from app.routers.platform_marketplace import _app_to_out

    row = db.get(MarketplaceApp, app_id)
    if row is None:
        raise HTTPException(status_code=404, detail="App da loja não encontrado.")
    creds = require_stripe_credentials(db)
    sync_marketplace_app_to_stripe(db, creds, row)
    db.commit()
    db.refresh(row)
    return _app_to_out(row)
