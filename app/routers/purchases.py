"""Compras de produtos — despesa no financeiro e entrada em estoque."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.limiter import limiter
from app.product_purchase_service import ProductPurchaseError, create_product_purchase, purchase_to_out
from app.routers.finance import _get_tenant_or_404, _require_finance_enabled
from app.schemas import ProductPurchaseCreate, ProductPurchaseOut
from models import ProductPurchase, ProductPurchaseLine, User, UserRole

router = APIRouter(prefix="/purchases", tags=["purchases"])


@router.get(
    "",
    response_model=list[ProductPurchaseOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def list_product_purchases(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> list[ProductPurchaseOut]:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    rows = db.execute(
        select(ProductPurchase)
        .where(ProductPurchase.tenant_id == current_user.tenant_id)
        .order_by(ProductPurchase.id.desc())
        .offset(skip)
        .limit(limit)
        .options(
            selectinload(ProductPurchase.finance_entry),
            selectinload(ProductPurchase.lines).selectinload(ProductPurchaseLine.product),
        )
    ).scalars().all()
    return [purchase_to_out(db, p) for p in rows]


@router.post(
    "",
    response_model=ProductPurchaseOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def post_product_purchase(
    request: Request,
    payload: ProductPurchaseCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> JSONResponse:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    try:
        purchase = create_product_purchase(
            db,
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            description=payload.description,
            total_amount=payload.total_amount,
            due_date=payload.due_date,
            purchased_at=payload.purchased_at,
            status=payload.status,
            finance_account_id=payload.finance_account_id,
            category_id=payload.category_id,
            payment_method=payload.payment_method,
            credit_card_id=payload.credit_card_id,
            supplier_name=payload.supplier_name,
            notes=payload.notes,
            lines=[line.model_dump() for line in payload.lines],
            update_product_cost=payload.update_product_cost,
        )
        db.commit()
    except ProductPurchaseError as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    out = purchase_to_out(db, purchase)
    return JSONResponse(content=jsonable_encoder(out), status_code=status.HTTP_201_CREATED)
