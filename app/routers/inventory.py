from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.limiter import limiter
from app.schemas import InventoryProductRowOut, StockAdjustmentCreate, StockMovementOut
from app.stock_ops import reserved_quantities_by_product
from models import Product, StockMovement, StockMovementReason, User, UserRole

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("", response_model=list[InventoryProductRowOut])
def list_inventory(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[InventoryProductRowOut]:
    reserved_map = reserved_quantities_by_product(db, current_user.tenant_id)
    products = db.execute(
        select(Product)
        .where(Product.tenant_id == current_user.tenant_id)
        .order_by(Product.name.asc())
        .offset(skip)
        .limit(limit)
    ).scalars().all()
    rows: list[InventoryProductRowOut] = []
    for p in products:
        r = float(reserved_map.get(p.id, Decimal(0)))
        s = float(p.stock_quantity)
        rows.append(
            InventoryProductRowOut(
                product_id=p.id,
                name=p.name,
                sku=p.sku,
                stock_quantity=s,
                reserved_quantity=r,
                available_quantity=s - r,
                is_active=p.is_active,
            )
        )
    return rows


@router.get("/movements", response_model=list[StockMovementOut])
def list_stock_movements(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    product_id: Annotated[int | None, Query()] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[StockMovement]:
    q = select(StockMovement).where(StockMovement.tenant_id == current_user.tenant_id)
    if product_id is not None:
        q = q.where(StockMovement.product_id == product_id)
    return db.execute(q.order_by(StockMovement.id.desc()).offset(skip).limit(limit)).scalars().all()


@router.post(
    "/adjustments",
    response_model=StockMovementOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def create_stock_adjustment(
    request: Request,
    payload: StockAdjustmentCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> StockMovement:
    if payload.quantity_delta == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity_delta não pode ser zero.")

    product = db.execute(
        select(Product).where(Product.id == payload.product_id, Product.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado.")

    cur = Decimal(str(product.stock_quantity))
    nxt = cur + Decimal(str(payload.quantity_delta))
    if nxt < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ajuste resultaria em estoque negativo (atual {cur}, delta {payload.quantity_delta}).",
        )

    product.stock_quantity = float(nxt)
    row = StockMovement(
        tenant_id=current_user.tenant_id,
        product_id=product.id,
        quantity_delta=float(payload.quantity_delta),
        reason=StockMovementReason.MANUAL_ADJUST,
        service_order_id=None,
        notes=payload.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
