"""Upload e gestão de imagens de produto (S3)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.product_media import delete_product_image_if_exists, process_and_upload_product_image
from app.schemas import ProductImageOut, ProductImagesReorderRequest
from models import Product, ProductImage, User, UserRole

router = APIRouter(prefix="/products", tags=["products"])


@router.post(
    "/{product_id}/images",
    response_model=ProductImageOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
async def upload_product_image(
    product_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> ProductImage:
    product = db.execute(
        select(Product).where(Product.id == product_id, Product.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado.")

    raw = await file.read()
    try:
        up = process_and_upload_product_image(
            tenant_id=current_user.tenant_id,
            product_id=product_id,
            file_bytes=raw,
            source_filename=file.filename,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    max_ord = db.execute(
        select(func.coalesce(func.max(ProductImage.sort_order), -1)).where(ProductImage.product_id == product_id)
    ).scalar_one()
    row = ProductImage(
        tenant_id=current_user.tenant_id,
        product_id=product_id,
        public_url=up.public_url,
        s3_key=up.s3_key,
        sort_order=int(max_ord) + 1,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/{product_id}/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def delete_product_image(
    product_id: int,
    image_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    row = db.execute(
        select(ProductImage).where(
            ProductImage.id == image_id,
            ProductImage.product_id == product_id,
            ProductImage.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imagem não encontrada.")
    delete_product_image_if_exists(row.s3_key, db)
    db.delete(row)
    db.commit()
    return None


@router.patch(
    "/{product_id}/images/reorder",
    response_model=list[ProductImageOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def reorder_product_images(
    product_id: int,
    payload: ProductImagesReorderRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[ProductImage]:
    product = db.execute(
        select(Product).where(Product.id == product_id, Product.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado.")

    ids = payload.image_ids
    existing = db.execute(
        select(ProductImage.id).where(
            ProductImage.product_id == product_id,
            ProductImage.tenant_id == current_user.tenant_id,
        )
    ).scalars().all()
    if sorted(ids) != sorted(existing):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Envie todos os IDs de imagens do produto, na nova ordem desejada.",
        )
    rows = db.execute(
        select(ProductImage).where(
            ProductImage.product_id == product_id,
            ProductImage.tenant_id == current_user.tenant_id,
            ProductImage.id.in_(ids),
        )
    ).scalars().all()
    pos = {iid: idx for idx, iid in enumerate(ids)}
    for r in rows:
        r.sort_order = pos[r.id]
    db.commit()
    ordered = db.execute(
        select(ProductImage)
        .where(ProductImage.product_id == product_id)
        .order_by(ProductImage.sort_order.asc(), ProductImage.id.asc())
    ).scalars().all()
    return list(ordered)
