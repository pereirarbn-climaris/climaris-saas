from typing import Annotated
import io
import re
import zipfile
import xml.etree.ElementTree as ET
import unicodedata

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.product_media import delete_product_image_if_exists
from app.schemas import (
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


def _cell_text_from_xlsx_cell(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        node = cell.find(".//{*}is/{*}t")
        return (node.text or "").strip() if node is not None else ""
    value_node = cell.find("{*}v")
    if value_node is None or value_node.text is None:
        return ""
    raw = value_node.text.strip()
    if cell_type == "s":
        try:
            idx = int(raw)
            return shared_strings[idx] if 0 <= idx < len(shared_strings) else ""
        except ValueError:
            return ""
    return raw


def _parse_xlsx_rows(content: bytes) -> list[list[str]]:
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            shared_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in shared_root.findall("{*}si"):
                parts = [node.text or "" for node in si.findall(".//{*}t")]
                shared_strings.append("".join(parts).strip())

        workbook_rels_path = "xl/_rels/workbook.xml.rels"
        workbook_path = "xl/workbook.xml"
        if workbook_path not in zf.namelist() or workbook_rels_path not in zf.namelist():
            raise ValueError("Arquivo XLSX inválido.")

        wb_root = ET.fromstring(zf.read(workbook_path))
        first_sheet = wb_root.find(".//{*}sheets/{*}sheet")
        if first_sheet is None:
            return []
        rel_id = first_sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        if not rel_id:
            return []

        rels_root = ET.fromstring(zf.read(workbook_rels_path))
        rel_node = None
        for rel in rels_root.findall("{*}Relationship"):
            if rel.attrib.get("Id") == rel_id:
                rel_node = rel
                break
        if rel_node is None:
            return []

        target = rel_node.attrib.get("Target", "")
        if not target:
            return []
        sheet_path = f"xl/{target}" if not target.startswith("xl/") else target
        if sheet_path not in zf.namelist():
            return []

        sheet_root = ET.fromstring(zf.read(sheet_path))
        data = sheet_root.find("{*}sheetData")
        if data is None:
            return []

        rows: list[list[str]] = []
        for row in data.findall("{*}row"):
            values: list[str] = []
            for cell in row.findall("{*}c"):
                ref = cell.attrib.get("r", "")
                letters = "".join(ch for ch in ref if ch.isalpha())
                col_index = 0
                for ch in letters:
                    col_index = col_index * 26 + (ord(ch.upper()) - ord("A") + 1)
                if col_index <= 0:
                    col_index = len(values) + 1
                needed = col_index - 1
                if len(values) < needed:
                    values.extend([""] * (needed - len(values)))
                text = _cell_text_from_xlsx_cell(cell, shared_strings)
                if len(values) == needed:
                    values.append(text)
                else:
                    values[needed] = text
            if any(v.strip() for v in values):
                rows.append(values)
        return rows


def _parse_csv_rows(content: bytes) -> list[list[str]]:
    text = content.decode("utf-8-sig", errors="ignore")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return []
    delimiter = ";" if ";" in lines[0] else ","
    return [[col.strip() for col in line.split(delimiter)] for line in lines]


def _split_inline_csv_row(row: list[str], delimiter: str) -> list[str]:
    if len(row) != 1:
        return row
    cell = (row[0] or "").strip()
    if delimiter not in cell:
        return row
    return [part.strip() for part in cell.split(delimiter)]


def _normalize_rows_shape(rows: list[list[str]]) -> list[list[str]]:
    if not rows:
        return rows
    # Alguns arquivos chegam com tudo em uma única célula por linha.
    # Detectamos o delimitador pelo cabeçalho e expandimos cada linha.
    first = rows[0][0] if rows[0] else ""
    if ";" in first:
        delimiter = ";"
    elif "\t" in first:
        delimiter = "\t"
    else:
        delimiter = ","
    normalized = [_split_inline_csv_row(r, delimiter) for r in rows]
    return normalized


@router.get("", response_model=list[ProductOut])
def list_products(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    q: Annotated[str | None, Query(description="Filter by name or SKU")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[Product]:
    query = select(Product).where(Product.tenant_id == current_user.tenant_id)
    if q:
        term = f"%{q}%"
        query = query.where(or_(Product.name.ilike(term), Product.sku.ilike(term)))
    return db.execute(query.order_by(Product.id.desc()).offset(skip).limit(limit)).scalars().all()


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
        rows = _parse_xlsx_rows(content)
    elif filename.endswith(".csv") or filename.endswith(".txt"):
        rows = _parse_csv_rows(content)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato inválido. Use .xlsx ou .csv.")

    rows = _normalize_rows_shape(rows)
    if len(rows) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A planilha precisa de cabeçalho e linhas de dados.")

    def idx(headers: list[str], aliases: list[str]) -> int:
        for i, h in enumerate(headers):
            if h in aliases:
                return i
        return -1

    headers = [
        unicodedata.normalize("NFD", str(x).strip().lower())
        .encode("ascii", "ignore")
        .decode("ascii")
        .replace(" ", "_")
        for x in rows[0]
    ]
    name_idx = idx(headers, ["name", "nome"])
    sku_idx = idx(headers, ["sku"])
    purchase_idx = idx(headers, ["purchase_price", "preco_compra", "preco_de_compra"])
    sale_idx = idx(headers, ["sale_price", "preco_venda", "preco_de_venda"])
    stock_idx = idx(headers, ["stock_quantity", "estoque_inicial", "estoque"])
    active_idx = idx(headers, ["is_active", "ativo"])
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
        product.stock_quantity = payload.stock_quantity
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
