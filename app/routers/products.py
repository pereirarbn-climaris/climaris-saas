from typing import Annotated, Literal
import re
import unicodedata

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.pagination import clamp_limit
from app.dependencies import get_current_user, require_roles
from app.spreadsheet_rows import header_index, normalize_header_label, normalize_rows_shape, parse_csv_rows, parse_xlsx_rows
from app.product_media import delete_product_image_if_exists
from app.schemas import (
    ProductCountOut,
    ProductCreate,
    ProductDetailOut,
    ProductImportErrorOut,
    ProductImportRequest,
    ProductImportResultOut,
    ProductOut,
    ProductUpdate,
)
from models import Product, ProductImage, User, UserRole

router = APIRouter(prefix="/products", tags=["products"])


def _set_physical_stock(product: Product, quantity: float) -> None:
    """Atualiza estoque físico e mantém stock_quantity legado sincronizado."""
    product.quantity_physical = quantity
    product.stock_quantity = quantity


def _slugify_sku(value: str) -> str:
    normalized = (
        unicodedata.normalize("NFD", value.strip().lower())
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return normalized[:42] or "produto"


def _make_auto_sku(name: str, row_number: int, seq: int = 0) -> str:
    base = f"AUTO-{_slugify_sku(name)}-{row_number}"
    if seq > 0:
        base = f"{base}-{seq}"
    return base[:50]


ProductListSort = Literal[
    "name_asc",
    "name_desc",
    "sku_asc",
    "sku_desc",
    "purchase_asc",
    "purchase_desc",
    "sale_asc",
    "sale_desc",
    "margin_asc",
    "margin_desc",
    "status_active_first",
    "status_inactive_first",
]


def _product_list_filter(tenant_id: int, q: str | None):
    query = select(Product).where(Product.tenant_id == tenant_id)
    if q:
        term = f"%{q}%"
        query = query.where(or_(Product.name.ilike(term), Product.sku.ilike(term)))
    return query


def _apply_product_list_order(query, sort: ProductListSort):
    margin = Product.sale_price - Product.purchase_price
    match sort:
        case "name_desc":
            return query.order_by(Product.name.desc(), Product.id.desc())
        case "sku_asc":
            return query.order_by(Product.sku.asc(), Product.id.asc())
        case "sku_desc":
            return query.order_by(Product.sku.desc(), Product.id.desc())
        case "purchase_asc":
            return query.order_by(Product.purchase_price.asc(), Product.id.asc())
        case "purchase_desc":
            return query.order_by(Product.purchase_price.desc(), Product.id.desc())
        case "sale_asc":
            return query.order_by(Product.sale_price.asc(), Product.id.asc())
        case "sale_desc":
            return query.order_by(Product.sale_price.desc(), Product.id.desc())
        case "margin_asc":
            return query.order_by(margin.asc(), Product.id.asc())
        case "margin_desc":
            return query.order_by(margin.desc(), Product.id.desc())
        case "status_active_first":
            return query.order_by(Product.is_active.desc(), Product.name.asc(), Product.id.asc())
        case "status_inactive_first":
            return query.order_by(Product.is_active.asc(), Product.name.asc(), Product.id.asc())
        case _:
            return query.order_by(Product.name.asc(), Product.id.asc())


@router.get("", response_model=list[ProductOut])
def list_products(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    q: Annotated[str | None, Query(description="Filter by name or SKU")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1)] = 20,
    sort: Annotated[ProductListSort, Query(description="Ordenação da listagem")] = "name_asc",
) -> list[Product]:
    limit = clamp_limit(limit)
    query = _apply_product_list_order(_product_list_filter(current_user.tenant_id, q), sort)
    query = query.options(joinedload(Product.images))
    return db.execute(query.offset(skip).limit(limit)).unique().scalars().all()


@router.get("/count", response_model=ProductCountOut)
def count_products(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    q: Annotated[str | None, Query()] = None,
) -> ProductCountOut:
    tenant_id = current_user.tenant_id

    def count_where(*extra) -> int:
        query = select(func.count(Product.id)).select_from(Product).where(Product.tenant_id == tenant_id)
        if q:
            term = f"%{q}%"
            query = query.where(or_(Product.name.ilike(term), Product.sku.ilike(term)))
        for clause in extra:
            query = query.where(clause)
        return int(db.scalar(query) or 0)

    margin_expr = Product.sale_price - Product.purchase_price
    avg_query = select(func.avg(margin_expr)).where(Product.tenant_id == tenant_id)
    if q:
        term = f"%{q}%"
        avg_query = avg_query.where(or_(Product.name.ilike(term), Product.sku.ilike(term)))
    avg_margin = float(db.scalar(avg_query) or 0)

    return ProductCountOut(
        total=count_where(),
        active=count_where(Product.is_active.is_(True)),
        inactive=count_where(Product.is_active.is_(False)),
        avg_margin=avg_margin,
    )


@router.get("/{product_id}", response_model=ProductDetailOut)
def get_product(
    product_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Product:
    product = db.execute(
        select(Product)
        .options(joinedload(Product.images))
        .where(Product.id == product_id, Product.tenant_id == current_user.tenant_id)
    ).unique().scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    return product


@router.post(
    "",
    response_model=ProductOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def create_product(
    payload: ProductCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Product:
    if payload.purchase_price < 0 or payload.sale_price < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prices must be greater than or equal to 0.")
    if payload.btu_min is not None and payload.btu_max is not None and payload.btu_min > payload.btu_max:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="btu_min cannot be greater than btu_max.")
    existing = db.execute(
        select(Product).where(Product.tenant_id == current_user.tenant_id, Product.sku == payload.sku)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="SKU already exists for this tenant.")

    product = Product(
        tenant_id=current_user.tenant_id,
        name=payload.name,
        sku=payload.sku,
        purchase_price=payload.purchase_price,
        sale_price=payload.sale_price,
        unit_price=payload.sale_price,
        stock_quantity=payload.stock_quantity,
        quantity_physical=payload.stock_quantity,
        quantity_reserved=0,
        compatible_equipment_tags=(payload.compatible_equipment_tags.strip() if payload.compatible_equipment_tags else None),
        btu_min=payload.btu_min,
        btu_max=payload.btu_max,
        application_scope=(payload.application_scope.strip().lower() if payload.application_scope else None),
        is_active=payload.is_active,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.post(
    "/import",
    response_model=ProductImportResultOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def import_products(
    payload: ProductImportRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ProductImportResultOut:
    if not payload.items:
        return ProductImportResultOut(created_count=0, skipped_count=0, error_count=0, errors=[], created_products=[])

    errors: list[ProductImportErrorOut] = []
    created_products: list[Product] = []
    skipped_count = 0
    seen_skus: set[str] = set()

    for row in payload.items:
        name = (row.name or "").strip()
        sku = (row.sku or "").strip()

        if not name:
            errors.append(ProductImportErrorOut(row_number=row.row_number, sku=sku or None, message="Nome é obrigatório."))
            continue
        if len(name) > 150:
            errors.append(
                ProductImportErrorOut(row_number=row.row_number, sku=sku or None, message="Nome deve ter no máximo 150 caracteres.")
            )
            continue
        was_auto_sku = False
        if not sku:
            sku = _make_auto_sku(name, row.row_number)
            was_auto_sku = True

        if len(sku) > 50:
            errors.append(ProductImportErrorOut(row_number=row.row_number, sku=sku, message="SKU deve ter no máximo 50 caracteres."))
            continue

        if row.purchase_price < 0 or row.sale_price < 0:
            errors.append(
                ProductImportErrorOut(
                    row_number=row.row_number,
                    sku=sku,
                    message="Preços de compra e venda devem ser maiores ou iguais a 0.",
                )
            )
            continue
        if row.stock_quantity < 0:
            errors.append(
                ProductImportErrorOut(row_number=row.row_number, sku=sku, message="Estoque inicial deve ser maior ou igual a 0.")
            )
            continue

        candidate = sku
        seq = 0
        while True:
            if candidate in seen_skus:
                if not was_auto_sku:
                    skipped_count += 1
                    candidate = ""
                    break
                seq += 1
                candidate = _make_auto_sku(name, row.row_number, seq)
                continue
            exists = db.execute(
                select(Product).where(Product.tenant_id == current_user.tenant_id, Product.sku == candidate)
            ).scalar_one_or_none()
            if exists is None:
                break
            if not was_auto_sku:
                skipped_count += 1
                candidate = ""
                break
            seq += 1
            candidate = _make_auto_sku(name, row.row_number, seq)

        if not candidate:
            continue
        sku = candidate
        seen_skus.add(sku)

        product = Product(
            tenant_id=current_user.tenant_id,
            name=name,
            sku=sku,
            purchase_price=row.purchase_price,
            sale_price=row.sale_price,
            unit_price=row.sale_price,
            stock_quantity=row.stock_quantity,
            quantity_physical=row.stock_quantity,
            quantity_reserved=0,
            is_active=row.is_active,
        )
        db.add(product)
        created_products.append(product)

    db.commit()
    for product in created_products:
        db.refresh(product)

    return ProductImportResultOut(
        created_count=len(created_products),
        skipped_count=skipped_count,
        error_count=len(errors),
        errors=errors,
        created_products=created_products,
    )


@router.post(
    "/import/file",
    response_model=ProductImportResultOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
async def import_products_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProductImportResultOut:
    filename = (file.filename or "").lower()
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo vazio.")

    if filename.endswith(".xlsx"):
        rows = parse_xlsx_rows(content)
    elif filename.endswith(".csv") or filename.endswith(".txt"):
        rows = parse_csv_rows(content)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato inválido. Use .xlsx ou .csv.")

    rows = normalize_rows_shape(rows)
    if len(rows) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A planilha precisa de cabeçalho e linhas de dados.")

    headers = [normalize_header_label(x) for x in rows[0]]
    name_idx = header_index(headers, ["name", "nome"])
    sku_idx = header_index(headers, ["sku"])
    purchase_idx = header_index(headers, ["purchase_price", "preco_compra", "preco_de_compra"])
    sale_idx = header_index(headers, ["sale_price", "preco_venda", "preco_de_venda"])
    stock_idx = header_index(headers, ["stock_quantity", "estoque_inicial", "estoque"])
    active_idx = header_index(headers, ["is_active", "ativo"])
    if name_idx < 0 or sku_idx < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cabeçalho inválido. Use o modelo de importação.")

    def to_num(value: str) -> float:
        raw = str(value or "").strip()
        if not raw:
            return 0.0
        if "," in raw and "." in raw:
            normalized = raw.replace(".", "").replace(",", ".")
        elif "," in raw:
            normalized = raw.replace(",", ".")
        else:
            normalized = raw
        return float(normalized)

    def to_bool(value: str) -> bool:
        txt = str(value or "").strip().lower()
        if txt in ("0", "false", "nao", "não", "inativo", "n"):
            return False
        return True

    items = []
    for i, row in enumerate(rows[1:], start=2):
        name = row[name_idx].strip() if len(row) > name_idx else ""
        sku = row[sku_idx].strip() if len(row) > sku_idx else ""
        if not name and not sku:
            continue
        try:
            purchase_price = to_num(row[purchase_idx] if purchase_idx >= 0 and len(row) > purchase_idx else "0")
            sale_price = to_num(row[sale_idx] if sale_idx >= 0 and len(row) > sale_idx else "0")
            stock_quantity = to_num(row[stock_idx] if stock_idx >= 0 and len(row) > stock_idx else "0")
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Linha {i}: valores numéricos inválidos.")
        is_active = to_bool(row[active_idx] if active_idx >= 0 and len(row) > active_idx else "sim")
        items.append(
            {
                "row_number": i,
                "name": name,
                "sku": sku,
                "purchase_price": purchase_price,
                "sale_price": sale_price,
                "stock_quantity": stock_quantity,
                "is_active": is_active,
            }
        )

    return import_products(ProductImportRequest(items=items), db, current_user)


@router.put(
    "/{product_id}",
    response_model=ProductOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Product:
    product = db.execute(
        select(Product).where(Product.id == product_id, Product.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    if payload.sku and payload.sku != product.sku:
        existing = db.execute(
            select(Product).where(Product.tenant_id == current_user.tenant_id, Product.sku == payload.sku)
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="SKU already exists for this tenant.")
    if payload.purchase_price is not None and payload.purchase_price < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Purchase price must be greater than or equal to 0.")
    if payload.sale_price is not None and payload.sale_price < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sale price must be greater than or equal to 0.")
    if payload.stock_quantity is not None and payload.stock_quantity < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="stock_quantity must be greater than or equal to 0.")
    if payload.btu_min is not None and payload.btu_max is not None and payload.btu_min > payload.btu_max:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="btu_min cannot be greater than btu_max.")

    if payload.name is not None:
        product.name = payload.name
    if payload.sku is not None:
        product.sku = payload.sku
    if payload.purchase_price is not None:
        product.purchase_price = payload.purchase_price
    if payload.sale_price is not None:
        product.sale_price = payload.sale_price
        product.unit_price = payload.sale_price
    if payload.is_active is not None:
        product.is_active = payload.is_active
    if payload.stock_quantity is not None:
        _set_physical_stock(product, payload.stock_quantity)
    if "compatible_equipment_tags" in payload.model_fields_set:
        product.compatible_equipment_tags = (payload.compatible_equipment_tags or "").strip() or None
    if "btu_min" in payload.model_fields_set:
        product.btu_min = payload.btu_min
    if "btu_max" in payload.model_fields_set:
        product.btu_max = payload.btu_max
    if "application_scope" in payload.model_fields_set:
        product.application_scope = (payload.application_scope or "").strip().lower() or None

    db.commit()
    db.refresh(product)
    return product


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def delete_product(
    product_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    product = db.execute(
        select(Product).where(Product.id == product_id, Product.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    imgs = db.execute(
        select(ProductImage).where(
            ProductImage.product_id == product_id,
            ProductImage.tenant_id == current_user.tenant_id,
        )
    ).scalars().all()
    for im in imgs:
        delete_product_image_if_exists(im.s3_key, db)

    db.delete(product)
    db.commit()
    return None
