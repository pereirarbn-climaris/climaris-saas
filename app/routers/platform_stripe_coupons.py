"""Operação: cupons e códigos promocionais Stripe."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_platform_operator
from app.schemas import (
    StripeCouponCreateRequest,
    StripeCouponOut,
    StripeCouponUpdateRequest,
    StripeProductOptionOut,
    StripePromotionCodeCreateRequest,
    StripePromotionCodeOut,
    StripePromotionCodeUpdateRequest,
)
from app.stripe_billing import require_stripe_credentials
from app.stripe_coupons import (
    create_coupon,
    create_promotion_code,
    delete_coupon,
    list_coupons,
    list_promotion_codes,
    list_stripe_product_options,
    update_coupon,
    update_promotion_code,
)
from models import User

router = APIRouter(prefix="/platform/stripe", tags=["platform-stripe-coupons"])


@router.get("/products", response_model=list[StripeProductOptionOut])
def platform_stripe_products(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> list[StripeProductOptionOut]:
    creds = require_stripe_credentials(db)
    return [StripeProductOptionOut(**row) for row in list_stripe_product_options(db, creds)]


@router.get("/coupons", response_model=list[StripeCouponOut])
def platform_list_stripe_coupons(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[StripeCouponOut]:
    creds = require_stripe_credentials(db)
    return [StripeCouponOut(**row) for row in list_coupons(creds, limit=limit)]


@router.post("/coupons", response_model=StripeCouponOut, status_code=status.HTTP_201_CREATED)
def platform_create_stripe_coupon(
    payload: StripeCouponCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> StripeCouponOut:
    creds = require_stripe_credentials(db)
    row = create_coupon(
        creds,
        name=payload.name,
        discount_type=payload.discount_type,
        percent_off=payload.percent_off,
        amount_off_brl=payload.amount_off_brl,
        duration=payload.duration,
        duration_in_months=payload.duration_in_months,
        coupon_id=payload.coupon_id,
        max_redemptions=payload.max_redemptions,
        redeem_by=payload.redeem_by,
        applies_to_product_ids=payload.applies_to_product_ids,
        metadata=payload.metadata,
    )
    return StripeCouponOut(**row)


@router.patch("/coupons/{coupon_id}", response_model=StripeCouponOut)
def platform_update_stripe_coupon(
    coupon_id: str,
    payload: StripeCouponUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> StripeCouponOut:
    creds = require_stripe_credentials(db)
    row = update_coupon(creds, coupon_id, name=payload.name, metadata=payload.metadata)
    return StripeCouponOut(**row)


@router.delete("/coupons/{coupon_id}", status_code=status.HTTP_204_NO_CONTENT)
def platform_delete_stripe_coupon(
    coupon_id: str,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> None:
    creds = require_stripe_credentials(db)
    delete_coupon(creds, coupon_id)


@router.get("/promotion-codes", response_model=list[StripePromotionCodeOut])
def platform_list_stripe_promotion_codes(
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
    coupon_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> list[StripePromotionCodeOut]:
    creds = require_stripe_credentials(db)
    return [
        StripePromotionCodeOut(**row)
        for row in list_promotion_codes(creds, coupon_id=coupon_id, limit=limit)
    ]


@router.post("/promotion-codes", response_model=StripePromotionCodeOut, status_code=status.HTTP_201_CREATED)
def platform_create_stripe_promotion_code(
    payload: StripePromotionCodeCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> StripePromotionCodeOut:
    creds = require_stripe_credentials(db)
    row = create_promotion_code(
        creds,
        coupon_id=payload.coupon_id,
        code=payload.code,
        active=payload.active,
        max_redemptions=payload.max_redemptions,
        expires_at=payload.expires_at,
        first_time_transaction=payload.first_time_transaction,
        minimum_amount_brl=payload.minimum_amount_brl,
        metadata=payload.metadata,
    )
    return StripePromotionCodeOut(**row)


@router.patch("/promotion-codes/{promotion_code_id}", response_model=StripePromotionCodeOut)
def platform_update_stripe_promotion_code(
    promotion_code_id: str,
    payload: StripePromotionCodeUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    _user: Annotated[User, Depends(require_platform_operator)],
) -> StripePromotionCodeOut:
    creds = require_stripe_credentials(db)
    row = update_promotion_code(
        creds,
        promotion_code_id,
        active=payload.active,
        metadata=payload.metadata,
    )
    return StripePromotionCodeOut(**row)
