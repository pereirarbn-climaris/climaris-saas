"""Cupons e códigos promocionais Stripe (painel /operacao)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal

import stripe
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.stripe_billing import _configure_stripe, _stripe_field
from app.stripe_credentials import StripeCredentials
from models import MarketplaceApp, SaasPlanCatalog

logger = logging.getLogger("erp.stripe_coupons")

CouponDuration = Literal["once", "forever", "repeating"]
DiscountType = Literal["percent", "amount"]


def _money_to_cents(amount_brl: Decimal | float) -> int:
    value = Decimal(str(amount_brl)).quantize(Decimal("0.01"))
    cents = int(value * 100)
    if cents < 1:
        raise HTTPException(status_code=400, detail="Valor do desconto deve ser maior que zero.")
    return cents


def _ts_to_dt(raw: Any) -> datetime | None:
    if raw is None:
        return None
    try:
        return datetime.fromtimestamp(int(raw), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


def _coupon_discount_label(coupon: Any) -> str:
    percent = _stripe_field(coupon, "percent_off")
    if percent is not None:
        return f"{percent:g}%"
    amount = _stripe_field(coupon, "amount_off")
    currency = str(_stripe_field(coupon, "currency") or "brl").upper()
    if amount is not None:
        return f"{currency} {int(amount) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return "—"


def serialize_coupon(coupon: Any) -> dict[str, Any]:
    applies_to = _stripe_field(coupon, "applies_to") or {}
    product_ids = applies_to.get("products") if isinstance(applies_to, dict) else None
    metadata = _stripe_field(coupon, "metadata") or {}
    return {
        "id": str(_stripe_field(coupon, "id") or ""),
        "name": _stripe_field(coupon, "name"),
        "valid": bool(_stripe_field(coupon, "valid", True)),
        "discount_type": "percent" if _stripe_field(coupon, "percent_off") is not None else "amount",
        "discount_label": _coupon_discount_label(coupon),
        "percent_off": _stripe_field(coupon, "percent_off"),
        "amount_off": _stripe_field(coupon, "amount_off"),
        "currency": _stripe_field(coupon, "currency"),
        "duration": _stripe_field(coupon, "duration"),
        "duration_in_months": _stripe_field(coupon, "duration_in_months"),
        "max_redemptions": _stripe_field(coupon, "max_redemptions"),
        "times_redeemed": int(_stripe_field(coupon, "times_redeemed") or 0),
        "redeem_by": _ts_to_dt(_stripe_field(coupon, "redeem_by")),
        "applies_to_product_ids": list(product_ids) if isinstance(product_ids, list) else [],
        "metadata": dict(metadata) if isinstance(metadata, dict) else {},
        "created_at": _ts_to_dt(_stripe_field(coupon, "created")),
    }


def serialize_promotion_code(promo: Any) -> dict[str, Any]:
    coupon = _stripe_field(promo, "coupon")
    coupon_id = coupon if isinstance(coupon, str) else _stripe_field(coupon, "id")
    restrictions = _stripe_field(promo, "restrictions") or {}
    min_amount = None
    min_currency = None
    first_time_only = False
    if isinstance(restrictions, dict):
        first_time_only = bool(restrictions.get("first_time_transaction"))
        min_amount = restrictions.get("minimum_amount")
        min_currency = restrictions.get("minimum_amount_currency")
    metadata = _stripe_field(promo, "metadata") or {}
    return {
        "id": str(_stripe_field(promo, "id") or ""),
        "code": str(_stripe_field(promo, "code") or ""),
        "coupon_id": str(coupon_id) if coupon_id else None,
        "active": bool(_stripe_field(promo, "active", True)),
        "max_redemptions": _stripe_field(promo, "max_redemptions"),
        "times_redeemed": int(_stripe_field(promo, "times_redeemed") or 0),
        "expires_at": _ts_to_dt(_stripe_field(promo, "expires_at")),
        "first_time_transaction": first_time_only,
        "minimum_amount": min_amount,
        "minimum_amount_currency": min_currency,
        "metadata": dict(metadata) if isinstance(metadata, dict) else {},
        "created_at": _ts_to_dt(_stripe_field(promo, "created")),
    }


def list_stripe_product_options(db: Session, creds: StripeCredentials) -> list[dict[str, str]]:
    options: dict[str, str] = {}
    for row in db.execute(select(SaasPlanCatalog)).scalars().all():
        if row.stripe_product_id:
            options[row.stripe_product_id] = f"Plano: {row.display_name}"
    for row in db.execute(select(MarketplaceApp)).scalars().all():
        if row.stripe_product_id:
            options[row.stripe_product_id] = f"Loja: {row.display_name}"
    _configure_stripe(creds)
    try:
        products = stripe.Product.list(active=True, limit=100)
        for product in products.auto_paging_iter():
            pid = str(_stripe_field(product, "id") or "")
            if not pid:
                continue
            if pid not in options:
                options[pid] = str(_stripe_field(product, "name") or pid)
    except Exception:
        logger.exception("Falha ao listar produtos Stripe")
    return [{"id": pid, "label": label} for pid, label in sorted(options.items(), key=lambda x: x[1].lower())]


def list_coupons(creds: StripeCredentials, *, limit: int = 100) -> list[dict[str, Any]]:
    _configure_stripe(creds)
    try:
        rows = stripe.Coupon.list(limit=min(limit, 100))
        return [serialize_coupon(c) for c in rows.data]
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=502, detail=f"Stripe: {exc.user_message or str(exc)}") from exc


def create_coupon(
    creds: StripeCredentials,
    *,
    name: str,
    discount_type: DiscountType,
    percent_off: float | None,
    amount_off_brl: float | None,
    duration: CouponDuration,
    duration_in_months: int | None,
    coupon_id: str | None,
    max_redemptions: int | None,
    redeem_by: datetime | None,
    applies_to_product_ids: list[str],
    metadata: dict[str, str],
) -> dict[str, Any]:
    _configure_stripe(creds)
    params: dict[str, Any] = {
        "name": name.strip(),
        "duration": duration,
        "metadata": metadata or None,
    }
    if coupon_id and coupon_id.strip():
        params["id"] = coupon_id.strip()
    if discount_type == "percent":
        if percent_off is None or percent_off <= 0 or percent_off > 100:
            raise HTTPException(status_code=400, detail="percent_off deve estar entre 0 e 100.")
        params["percent_off"] = percent_off
    else:
        if amount_off_brl is None:
            raise HTTPException(status_code=400, detail="Informe o valor do desconto em BRL.")
        params["amount_off"] = _money_to_cents(amount_off_brl)
        params["currency"] = "brl"
    if duration == "repeating":
        if duration_in_months is None or duration_in_months < 1:
            raise HTTPException(status_code=400, detail="duration_in_months é obrigatório para duração repetida.")
        params["duration_in_months"] = duration_in_months
    if max_redemptions is not None:
        params["max_redemptions"] = max_redemptions
    if redeem_by is not None:
        params["redeem_by"] = int(redeem_by.timestamp())
    product_ids = [p.strip() for p in applies_to_product_ids if p and p.strip()]
    if product_ids:
        params["applies_to"] = {"products": product_ids}
    try:
        coupon = stripe.Coupon.create(**params)
        return serialize_coupon(coupon)
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=400, detail=f"Stripe: {exc.user_message or str(exc)}") from exc


def update_coupon(
    creds: StripeCredentials,
    coupon_id: str,
    *,
    name: str | None,
    metadata: dict[str, str] | None,
) -> dict[str, Any]:
    _configure_stripe(creds)
    params: dict[str, Any] = {}
    if name is not None:
        params["name"] = name.strip()
    if metadata is not None:
        params["metadata"] = metadata
    if not params:
        raise HTTPException(status_code=400, detail="Nada para atualizar.")
    try:
        coupon = stripe.Coupon.modify(coupon_id, **params)
        return serialize_coupon(coupon)
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=400, detail=f"Stripe: {exc.user_message or str(exc)}") from exc


def delete_coupon(creds: StripeCredentials, coupon_id: str) -> None:
    _configure_stripe(creds)
    try:
        stripe.Coupon.delete(coupon_id)
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=400, detail=f"Stripe: {exc.user_message or str(exc)}") from exc


def list_promotion_codes(
    creds: StripeCredentials,
    *,
    coupon_id: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    _configure_stripe(creds)
    params: dict[str, Any] = {"limit": min(limit, 100)}
    if coupon_id:
        params["coupon"] = coupon_id
    try:
        rows = stripe.PromotionCode.list(**params)
        return [serialize_promotion_code(p) for p in rows.data]
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=502, detail=f"Stripe: {exc.user_message or str(exc)}") from exc


def create_promotion_code(
    creds: StripeCredentials,
    *,
    coupon_id: str,
    code: str,
    active: bool,
    max_redemptions: int | None,
    expires_at: datetime | None,
    first_time_transaction: bool,
    minimum_amount_brl: float | None,
    metadata: dict[str, str],
) -> dict[str, Any]:
    _configure_stripe(creds)
    params: dict[str, Any] = {
        "coupon": coupon_id.strip(),
        "code": code.strip().upper(),
        "active": active,
        "metadata": metadata or None,
    }
    if max_redemptions is not None:
        params["max_redemptions"] = max_redemptions
    if expires_at is not None:
        params["expires_at"] = int(expires_at.timestamp())
    restrictions: dict[str, Any] = {}
    if first_time_transaction:
        restrictions["first_time_transaction"] = True
    if minimum_amount_brl is not None:
        restrictions["minimum_amount"] = _money_to_cents(minimum_amount_brl)
        restrictions["minimum_amount_currency"] = "brl"
    if restrictions:
        params["restrictions"] = restrictions
    try:
        promo = stripe.PromotionCode.create(**params)
        return serialize_promotion_code(promo)
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=400, detail=f"Stripe: {exc.user_message or str(exc)}") from exc


def update_promotion_code(
    creds: StripeCredentials,
    promotion_code_id: str,
    *,
    active: bool | None,
    metadata: dict[str, str] | None,
) -> dict[str, Any]:
    _configure_stripe(creds)
    params: dict[str, Any] = {}
    if active is not None:
        params["active"] = active
    if metadata is not None:
        params["metadata"] = metadata
    if not params:
        raise HTTPException(status_code=400, detail="Nada para atualizar.")
    try:
        promo = stripe.PromotionCode.modify(promotion_code_id, **params)
        return serialize_promotion_code(promo)
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=400, detail=f"Stripe: {exc.user_message or str(exc)}") from exc
