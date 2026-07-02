"""Cobrança de planos SaaS via Stripe Checkout e Customer Portal."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, Any

import stripe
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import APP_PUBLIC_URL
from app.plan_rules import normalize_plan_key
from app.stripe_credentials import StripeCredentials, resolve_stripe_credentials
from app.tenant_subscription import has_active_stripe_subscription
from models import SaasPlanCatalog, Tenant, TenantPlanChangeLog

if TYPE_CHECKING:
    from models import User

logger = logging.getLogger("erp.stripe_billing")

STRIPE_PLAN_METADATA_KEY = "climaris_plan_key"
STRIPE_TENANT_METADATA_KEY = "climaris_tenant_id"


def _configure_stripe(creds: StripeCredentials) -> None:
    stripe.api_key = creds.secret_key


def _stripe_field(obj: Any, key: str, default: Any = None) -> Any:
    """Lê campo de dict ou StripeObject (não use `.get()` em objetos Stripe)."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    try:
        return obj[key]
    except (KeyError, TypeError, AttributeError):
        return default


def _stripe_price_id(price: Any) -> str | None:
    """ID do Price em objeto expandido ou string (payload típico de webhook Stripe)."""
    if isinstance(price, str) and price.strip():
        return price.strip()
    price_id = _stripe_field(price, "id")
    return str(price_id).strip() if price_id else None


def _stripe_price_product_id(price: Any) -> str | None:
    product = _stripe_field(price, "product")
    if isinstance(product, str):
        return product
    product_id = _stripe_field(product, "id")
    return str(product_id) if product_id else None


def _existing_stripe_price_matches(price: Any, *, unit_amount: int, product_id: str) -> bool:
    return (
        _stripe_field(price, "unit_amount") == unit_amount
        and _stripe_field(price, "currency") == "brl"
        and bool(_stripe_field(price, "active"))
        and _stripe_price_product_id(price) == product_id
    )


def _money_to_cents(amount_brl: Decimal | float) -> int:
    value = Decimal(str(amount_brl)).quantize(Decimal("0.01"))
    cents = int(value * 100)
    if cents < 50:
        raise HTTPException(status_code=400, detail="Valor mensal mínimo para Stripe: R$ 0,50.")
    return cents


def change_tenant_plan(
    db: Session,
    tenant: Tenant,
    new_plan: str,
    *,
    changed_by_user_id: int | None = None,
    changed_by_email: str | None = None,
) -> bool:
    normalized = normalize_plan_key(new_plan)
    if tenant.active_plan == normalized:
        return False
    previous = tenant.active_plan
    tenant.active_plan = normalized
    db.add(tenant)
    db.add(
        TenantPlanChangeLog(
            tenant_id=tenant.id,
            previous_plan=previous,
            new_plan=normalized,
            changed_by_user_id=changed_by_user_id,
            changed_by_email=changed_by_email,
        )
    )
    return True


def _plan_key_from_price_id(db: Session, price_id: str | None) -> str | None:
    if not price_id:
        return None
    row = db.execute(
        select(SaasPlanCatalog.plan_key).where(SaasPlanCatalog.stripe_price_id == price_id).limit(1)
    ).scalar_one_or_none()
    return str(row) if row else None


def _plan_key_from_subscription(db: Session, subscription: Any) -> str | None:
    metadata = _stripe_field(subscription, "metadata")
    if isinstance(metadata, dict):
        plan_key = metadata.get(STRIPE_PLAN_METADATA_KEY)
        if isinstance(plan_key, str) and plan_key.strip():
            return normalize_plan_key(plan_key)

    items = _stripe_field(subscription, "items", {})
    data = _stripe_field(items, "data")
    if isinstance(data, list) and data:
        for item in data:
            price_id = _stripe_price_id(_stripe_field(item, "price"))
            if price_id:
                found = _plan_key_from_price_id(db, price_id)
                if found:
                    return found
    return None


def _subscription_pick_score(subscription: Any) -> tuple[int, int]:
    status = str(_stripe_field(subscription, "status") or "").lower()
    status_rank = {"active": 3, "trialing": 2, "past_due": 1}.get(status, 0)
    created = int(_stripe_field(subscription, "created") or 0)
    return status_rank, created


def retrieve_subscription_for_tenant(
    db: Session,
    creds: StripeCredentials,
    tenant: Tenant,
) -> Any | None:
    """Recupera a assinatura Stripe do tenant (por id salvo ou busca no customer)."""
    _configure_stripe(creds)
    sub_id = (tenant.stripe_subscription_id or "").strip()
    if sub_id:
        try:
            return stripe.Subscription.retrieve(sub_id, expand=["items.data.price"])
        except Exception:
            logger.exception("Falha ao recuperar assinatura Stripe %s", sub_id)

    customer_id = (tenant.stripe_customer_id or "").strip()
    if not customer_id:
        return None

    try:
        listed = stripe.Subscription.list(
            customer=customer_id,
            status="all",
            limit=20,
            expand=["data.items.data.price"],
        )
    except Exception:
        logger.exception("Falha ao listar assinaturas Stripe do customer %s", customer_id)
        return None

    candidates: list[Any] = []
    for subscription in listed.data:
        status = str(_stripe_field(subscription, "status") or "").lower()
        if status in {"canceled", "incomplete_expired", "incomplete"}:
            continue
        metadata = _stripe_field(subscription, "metadata")
        tenant_ref = metadata.get(STRIPE_TENANT_METADATA_KEY) if isinstance(metadata, dict) else None
        if tenant_ref is not None and str(tenant_ref) == str(tenant.id):
            candidates.append(subscription)
            continue
        if _plan_key_from_subscription(db, subscription):
            candidates.append(subscription)

    if not candidates:
        return None
    candidates.sort(key=_subscription_pick_score, reverse=True)
    return candidates[0]


def resolve_subscribed_plan_key(db: Session, tenant: Tenant) -> str | None:
    """Plano pago na assinatura Stripe (útil quando o webhook ainda não atualizou active_plan)."""
    pk = normalize_plan_key(tenant.active_plan)
    if has_active_stripe_subscription(tenant) and pk != "free_30d":
        return pk
    creds = resolve_stripe_credentials(db)
    if creds is None:
        return None
    subscription = retrieve_subscription_for_tenant(db, creds, tenant)
    if subscription is None:
        return None
    return _plan_key_from_subscription(db, subscription)


def _period_end_from_subscription(subscription: Any) -> datetime | None:
    raw = _stripe_field(subscription, "current_period_end")
    if raw is None:
        return None
    try:
        return datetime.fromtimestamp(int(raw), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


def _find_plan_subscription_item(db: Session, subscription: Any) -> Any | None:
    items = _stripe_field(subscription, "items", {})
    data = _stripe_field(items, "data")
    if not isinstance(data, list):
        return None
    for item in data:
        price_id = _stripe_price_id(_stripe_field(item, "price"))
        if price_id and _plan_key_from_price_id(db, price_id):
            return item
    return None


def apply_subscription_to_tenant(
    db: Session,
    tenant: Tenant,
    subscription: Any,
    *,
    changed_by_email: str | None = "stripe",
) -> None:
    from app.stripe_marketplace import sync_marketplace_entitlements_from_subscription

    tenant.stripe_subscription_id = str(_stripe_field(subscription, "id") or tenant.stripe_subscription_id or "") or None
    status = str(_stripe_field(subscription, "status") or "").lower()
    tenant.subscription_status = status or None
    tenant.subscription_current_period_end = _period_end_from_subscription(subscription)
    cancel_at_period_end = bool(_stripe_field(subscription, "cancel_at_period_end"))
    cancel_at: datetime | None = None
    raw_cancel_at = _stripe_field(subscription, "cancel_at")
    if raw_cancel_at is not None:
        try:
            cancel_at = datetime.fromtimestamp(int(raw_cancel_at), tz=timezone.utc)
        except (TypeError, ValueError):
            cancel_at = None
    scheduled_cancel = cancel_at_period_end or (
        cancel_at is not None and status in {"active", "trialing"} and cancel_at > datetime.now(timezone.utc)
    )
    tenant.subscription_cancel_at_period_end = scheduled_cancel
    if scheduled_cancel:
        tenant.subscription_ends_at = cancel_at or tenant.subscription_current_period_end
    else:
        tenant.subscription_ends_at = None

    plan_key = _plan_key_from_subscription(db, subscription)
    if plan_key and status in {"active", "trialing"}:
        change_tenant_plan(db, tenant, plan_key, changed_by_email=changed_by_email)
    elif status == "canceled":
        tenant.subscription_cancel_at_period_end = False
        tenant.subscription_ends_at = None
        tenant.stripe_subscription_id = None
        if normalize_plan_key(tenant.active_plan) != "beta_internal":
            change_tenant_plan(db, tenant, "free_30d", changed_by_email=changed_by_email)

    sync_marketplace_entitlements_from_subscription(db, tenant, subscription)
    db.add(tenant)


def sync_tenant_subscription_from_stripe(
    db: Session,
    creds: StripeCredentials,
    tenant: Tenant,
    *,
    changed_by_email: str | None = "stripe",
) -> bool:
    """Busca assinatura no Stripe e aplica plano/status no tenant. Retorna True se sincronizou."""
    subscription = retrieve_subscription_for_tenant(db, creds, tenant)
    if subscription is None:
        had_paid_plan = normalize_plan_key(tenant.active_plan) != "free_30d"
        had_stripe = bool(tenant.stripe_subscription_id or tenant.subscription_status)
        if had_paid_plan or had_stripe:
            tenant.subscription_status = "canceled"
            tenant.stripe_subscription_id = None
            tenant.subscription_current_period_end = None
            tenant.subscription_cancel_at_period_end = False
            tenant.subscription_ends_at = None
            if had_paid_plan and normalize_plan_key(tenant.active_plan) != "beta_internal":
                change_tenant_plan(db, tenant, "free_30d", changed_by_email=changed_by_email)
            db.add(tenant)
            return True
        return False
    before_plan = normalize_plan_key(tenant.active_plan)
    had_subscription = has_active_stripe_subscription(tenant)
    before_cancel = bool(tenant.subscription_cancel_at_period_end)
    apply_subscription_to_tenant(db, tenant, subscription, changed_by_email=changed_by_email)
    after_plan = normalize_plan_key(tenant.active_plan)
    return (
        before_plan != after_plan
        or (not had_subscription and has_active_stripe_subscription(tenant))
        or before_cancel != bool(tenant.subscription_cancel_at_period_end)
    )


def get_contractable_plans(db: Session) -> list[SaasPlanCatalog]:
    return list(
        db.execute(
            select(SaasPlanCatalog)
            .where(
                SaasPlanCatalog.can_contract.is_(True),
                SaasPlanCatalog.is_beta_internal.is_(False),
                SaasPlanCatalog.stripe_price_id.is_not(None),
            )
            .order_by(SaasPlanCatalog.sort_order.asc(), SaasPlanCatalog.plan_key.asc())
        )
        .scalars()
        .all()
    )


def get_or_create_stripe_customer(db: Session, creds: StripeCredentials, tenant: Tenant, admin_user: User) -> str:
    if tenant.stripe_customer_id:
        return tenant.stripe_customer_id

    _configure_stripe(creds)
    email = (tenant.email or admin_user.email or "").strip().lower()
    customer = stripe.Customer.create(
        name=tenant.name,
        email=email or None,
        metadata={STRIPE_TENANT_METADATA_KEY: str(tenant.id)},
    )
    tenant.stripe_customer_id = customer.id
    db.add(tenant)
    db.flush()
    return customer.id


def sync_plan_to_stripe(db: Session, creds: StripeCredentials, plan: SaasPlanCatalog) -> SaasPlanCatalog:
    if not plan.can_contract or plan.is_beta_internal:
        raise HTTPException(status_code=400, detail="Este plano não pode ser sincronizado com Stripe.")
    if plan.monthly_price_brl is None:
        raise HTTPException(status_code=400, detail="Defina o preço mensal (BRL) antes de sincronizar com Stripe.")

    _configure_stripe(creds)
    metadata = {STRIPE_PLAN_METADATA_KEY: plan.plan_key}

    if plan.stripe_product_id:
        product = stripe.Product.modify(
            plan.stripe_product_id,
            name=plan.display_name,
            description=(plan.description or "")[:500] or None,
            metadata=metadata,
            active=True,
        )
    else:
        product = stripe.Product.create(
            name=plan.display_name,
            description=(plan.description or "")[:500] or None,
            metadata=metadata,
        )
        plan.stripe_product_id = product.id

    unit_amount = _money_to_cents(plan.monthly_price_brl)
    if plan.stripe_price_id:
        existing = stripe.Price.retrieve(plan.stripe_price_id)
        if _existing_stripe_price_matches(
            existing,
            unit_amount=unit_amount,
            product_id=plan.stripe_product_id or "",
        ):
            db.add(plan)
            db.flush()
            return plan
        stripe.Price.modify(plan.stripe_price_id, active=False)

    price = stripe.Price.create(
        product=plan.stripe_product_id,
        unit_amount=unit_amount,
        currency="brl",
        recurring={"interval": "month"},
        metadata=metadata,
    )
    plan.stripe_price_id = price.id
    db.add(plan)
    db.flush()
    return plan


def upgrade_subscription_plan_in_place(
    db: Session,
    creds: StripeCredentials,
    tenant: Tenant,
    admin_user: User,
    plan: SaasPlanCatalog,
) -> None:
    if not tenant.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="Assinatura Stripe não encontrada.")
    _configure_stripe(creds)
    get_or_create_stripe_customer(db, creds, tenant, admin_user)
    sub = stripe.Subscription.retrieve(tenant.stripe_subscription_id, expand=["items.data.price"])

    plan_item = _find_plan_subscription_item(db, sub)
    metadata = {
        STRIPE_PLAN_METADATA_KEY: plan.plan_key,
        STRIPE_TENANT_METADATA_KEY: str(tenant.id),
    }
    if plan_item:
        stripe.Subscription.modify(
            tenant.stripe_subscription_id,
            items=[{"id": _stripe_field(plan_item, "id"), "price": plan.stripe_price_id, "quantity": 1}],
            proration_behavior="create_prorations",
            metadata=metadata,
        )
    else:
        stripe.Subscription.modify(
            tenant.stripe_subscription_id,
            items=[{"price": plan.stripe_price_id, "quantity": 1}],
            proration_behavior="create_prorations",
            metadata=metadata,
        )

    refreshed = stripe.Subscription.retrieve(tenant.stripe_subscription_id, expand=["items.data.price"])
    apply_subscription_to_tenant(db, tenant, refreshed, changed_by_email=admin_user.email)


def subscribe_or_change_plan(
    db: Session,
    creds: StripeCredentials,
    tenant: Tenant,
    admin_user: User,
    plan_key: str,
) -> tuple[str | None, bool]:
    """
    Retorna (checkout_url, upgraded_in_place).
    Se já houver assinatura ativa, faz upgrade/downgrade com proration sem redirecionar.
    """
    key = normalize_plan_key(plan_key)
    plan = db.get(SaasPlanCatalog, key)
    if plan is None or not plan.can_contract or plan.is_beta_internal:
        raise HTTPException(status_code=404, detail="Plano não disponível para contratação.")
    if not plan.stripe_price_id:
        raise HTTPException(status_code=503, detail="Plano ainda não vinculado ao Stripe. Contate o suporte.")

    if has_active_stripe_subscription(tenant):
        if normalize_plan_key(tenant.active_plan) == key:
            return None, True
        upgrade_subscription_plan_in_place(db, creds, tenant, admin_user, plan)
        return None, True

    orphan = retrieve_subscription_for_tenant(db, creds, tenant)
    if orphan is not None:
        orphan_status = str(_stripe_field(orphan, "status") or "").lower()
        if orphan_status in {"active", "trialing", "past_due"}:
            apply_subscription_to_tenant(db, tenant, orphan, changed_by_email=admin_user.email)
            if normalize_plan_key(tenant.active_plan) == key:
                return None, True
            upgrade_subscription_plan_in_place(db, creds, tenant, admin_user, plan)
            return None, True

    customer_id = get_or_create_stripe_customer(db, creds, tenant, admin_user)
    _configure_stripe(creds)

    success_url = f"{APP_PUBLIC_URL.rstrip('/')}/app/planos?checkout=success"
    cancel_url = f"{APP_PUBLIC_URL.rstrip('/')}/app/planos?checkout=cancel"

    subscription_data: dict = {
        "metadata": {
            STRIPE_PLAN_METADATA_KEY: plan.plan_key,
            STRIPE_TENANT_METADATA_KEY: str(tenant.id),
        }
    }

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": plan.stripe_price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=str(tenant.id),
        subscription_data=subscription_data,
        metadata={
            STRIPE_PLAN_METADATA_KEY: plan.plan_key,
            STRIPE_TENANT_METADATA_KEY: str(tenant.id),
        },
        allow_promotion_codes=True,
    )
    if not session.url:
        raise HTTPException(status_code=502, detail="Stripe não retornou URL de checkout.")
    return session.url, False


def create_checkout_session(
    db: Session,
    creds: StripeCredentials,
    tenant: Tenant,
    admin_user: User,
    plan_key: str,
) -> str:
    url, _ = subscribe_or_change_plan(db, creds, tenant, admin_user, plan_key)
    if url is None:
        raise HTTPException(status_code=409, detail="Plano atualizado na assinatura existente.")
    return url


def create_customer_portal_session(
    db: Session,
    creds: StripeCredentials,
    tenant: Tenant,
    admin_user: User,
) -> str:
    customer_id = get_or_create_stripe_customer(db, creds, tenant, admin_user)
    _configure_stripe(creds)
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{APP_PUBLIC_URL.rstrip('/')}/app/planos",
    )
    if not session.url:
        raise HTTPException(status_code=502, detail="Stripe não retornou URL do portal.")
    return session.url


def resolve_tenant_from_stripe_refs(
    db: Session,
    *,
    tenant_id: str | None = None,
    customer_id: str | None = None,
    subscription_id: str | None = None,
) -> Tenant | None:
    if tenant_id:
        try:
            row = db.get(Tenant, int(tenant_id))
            if row:
                return row
        except (TypeError, ValueError):
            pass
    if subscription_id:
        row = db.execute(
            select(Tenant).where(Tenant.stripe_subscription_id == subscription_id).limit(1)
        ).scalar_one_or_none()
        if row:
            return row
    if customer_id:
        row = db.execute(select(Tenant).where(Tenant.stripe_customer_id == customer_id).limit(1)).scalar_one_or_none()
        if row:
            return row
    return None


def _tenant_subscription_ids(db: Session, creds: StripeCredentials, tenant: Tenant) -> list[str]:
    """IDs de assinaturas Stripe do tenant (inclui duplicatas do mesmo customer)."""
    ids: list[str] = []
    primary = retrieve_subscription_for_tenant(db, creds, tenant)
    if primary is not None:
        primary_id = str(_stripe_field(primary, "id") or "")
        if primary_id:
            ids.append(primary_id)
    customer_id = (tenant.stripe_customer_id or "").strip()
    if not customer_id:
        return ids
    _configure_stripe(creds)
    listed = stripe.Subscription.list(customer=customer_id, status="all", limit=20)
    for subscription in listed.data:
        status = str(_stripe_field(subscription, "status") or "").lower()
        if status in {"canceled", "incomplete_expired"}:
            continue
        sub_id = str(_stripe_field(subscription, "id") or "")
        if not sub_id or sub_id in ids:
            continue
        metadata = _stripe_field(subscription, "metadata")
        tenant_ref = metadata.get(STRIPE_TENANT_METADATA_KEY) if isinstance(metadata, dict) else None
        if tenant_ref is not None and str(tenant_ref) == str(tenant.id):
            ids.append(sub_id)
        elif _plan_key_from_subscription(db, subscription):
            ids.append(sub_id)
    return ids


def cancel_tenant_subscription(
    db: Session,
    creds: StripeCredentials,
    tenant: Tenant,
    admin_user: "User",
    *,
    at_period_end: bool = True,
) -> None:
    sub_ids = _tenant_subscription_ids(db, creds, tenant)
    if not sub_ids:
        raise HTTPException(status_code=404, detail="Nenhuma assinatura ativa encontrada no Stripe.")
    _configure_stripe(creds)
    last_sub: Any = None
    for sub_id in sub_ids:
        if at_period_end:
            last_sub = stripe.Subscription.modify(sub_id, cancel_at_period_end=True)
        else:
            last_sub = stripe.Subscription.delete(sub_id)
    if last_sub is not None:
        apply_subscription_to_tenant(db, tenant, last_sub, changed_by_email=admin_user.email)
    db.add(tenant)


def resume_tenant_subscription(
    db: Session,
    creds: StripeCredentials,
    tenant: Tenant,
    admin_user: "User",
) -> None:
    subscription = retrieve_subscription_for_tenant(db, creds, tenant)
    if subscription is None:
        raise HTTPException(status_code=404, detail="Nenhuma assinatura encontrada no Stripe.")
    if not tenant.subscription_cancel_at_period_end:
        raise HTTPException(status_code=400, detail="A assinatura não está marcada para cancelamento.")
    _configure_stripe(creds)
    sub_id = str(_stripe_field(subscription, "id") or "")
    updated = stripe.Subscription.modify(sub_id, cancel_at_period_end=False, cancel_at="")
    apply_subscription_to_tenant(db, tenant, updated, changed_by_email=admin_user.email)
    db.add(tenant)


def require_stripe_credentials(db: Session) -> StripeCredentials:
    creds = resolve_stripe_credentials(db)
    if creds is None:
        raise HTTPException(status_code=503, detail="Cobrança Stripe não configurada na plataforma.")
    return creds
