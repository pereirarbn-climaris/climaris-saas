"""Registro de compras de produtos: lançamento financeiro + entrada em estoque."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.schemas import FinanceEntryCreate
from app.tenant_inventory import tenant_inventory_enabled
from models import (
    FinanceBankAccount,
    FinanceCategory,
    FinanceCreditCard,
    FinanceEntry,
    FinanceEntryStatus,
    FinanceEntryType,
    Product,
    ProductPurchase,
    ProductPurchaseLine,
    StockMovement,
    StockMovementReason,
)

_ALLOWED_PAYMENT_METHODS = frozenset(
    {"pix", "cash", "credit_card", "debit_card", "boleto", "bank_transfer"}
)


class ProductPurchaseError(Exception):
    pass


def _build_finance_notes(
    *,
    purchase_id: int,
    lines: list[tuple[str, str, Decimal, Decimal]],
    extra_notes: str | None,
) -> str:
    parts = [f"Compra #{purchase_id}"]
    for name, sku, qty, unit in lines:
        parts.append(f"· {name} (SKU {sku}) × {qty} @ R$ {unit}")
    if extra_notes and extra_notes.strip():
        parts.append(extra_notes.strip())
    return "\n".join(parts)


def create_product_purchase(
    db: Session,
    *,
    tenant_id: int,
    user_id: int | None,
    description: str,
    total_amount: float,
    due_date: date,
    purchased_at: date,
    status: FinanceEntryStatus,
    finance_account_id: int | None,
    category_id: int | None,
    payment_method: str | None,
    credit_card_id: int | None,
    supplier_name: str | None,
    notes: str | None,
    lines: list[dict],
    update_product_cost: bool = True,
) -> ProductPurchase:
    if total_amount <= 0:
        raise ProductPurchaseError("Informe o valor pago maior que zero.")
    if not lines:
        raise ProductPurchaseError("Adicione ao menos um produto à compra.")

    inventory_on = tenant_inventory_enabled(db, tenant_id)

    product_ids = {int(row["product_id"]) for row in lines}
    products = db.execute(
        select(Product).where(Product.tenant_id == tenant_id, Product.id.in_(product_ids))
    ).scalars().all()
    by_id = {p.id: p for p in products}
    if len(by_id) != len(product_ids):
        raise ProductPurchaseError("Um ou mais produtos não foram encontrados.")

    parsed_lines: list[tuple[Product, Decimal, Decimal]] = []
    lines_meta: list[tuple[str, str, Decimal, Decimal]] = []
    subtotal = Decimal(0)

    for row in lines:
        pid = int(row["product_id"])
        prod = by_id[pid]
        qty = Decimal(str(row["quantity"]))
        if qty <= 0:
            raise ProductPurchaseError(f"Quantidade inválida para «{prod.name}».")
        raw_unit = row.get("unit_cost")
        if raw_unit is None:
            unit = Decimal(str(prod.purchase_price or 0)).quantize(Decimal("0.01"))
        else:
            unit = Decimal(str(raw_unit)).quantize(Decimal("0.01"))
        if unit < 0:
            raise ProductPurchaseError(f"Custo unitário inválido para «{prod.name}».")
        parsed_lines.append((prod, qty, unit))
        lines_meta.append((prod.name, prod.sku, qty, unit))
        subtotal += qty * unit

    if category_id is not None:
        cat = db.execute(
            select(FinanceCategory).where(
                FinanceCategory.id == category_id,
                FinanceCategory.tenant_id == tenant_id,
            )
        ).scalar_one_or_none()
        if cat is None:
            raise ProductPurchaseError("Categoria financeira não encontrada.")

    pm = (payment_method or "pix").strip().lower()
    if pm not in _ALLOWED_PAYMENT_METHODS:
        raise ProductPurchaseError("Forma de pagamento inválida.")

    card: FinanceCreditCard | None = None
    is_credit_card = pm == "credit_card"
    if is_credit_card:
        if credit_card_id is None:
            raise ProductPurchaseError("Selecione o cartão de crédito usado na compra.")
        card = db.execute(
            select(FinanceCreditCard).where(
                FinanceCreditCard.id == credit_card_id,
                FinanceCreditCard.tenant_id == tenant_id,
            )
        ).scalar_one_or_none()
        if card is None:
            raise ProductPurchaseError("Cartão de crédito não encontrado.")
        if not card.billing_account_id:
            raise ProductPurchaseError(
                "Configure a conta bancária de débito da fatura deste cartão em Financeiro → Cartões."
            )
        used = db.execute(
            select(func.coalesce(func.sum(FinanceEntry.amount), 0)).where(
                FinanceEntry.tenant_id == tenant_id,
                FinanceEntry.credit_card_id == credit_card_id,
                FinanceEntry.entry_type == FinanceEntryType.EXPENSE,
                FinanceEntry.status == FinanceEntryStatus.AWAITING_INVOICE,
            )
        ).scalar_one()
        projected = float(used or 0) + float(total_amount)
        if projected > float(card.limit_amount or 0):
            raise ProductPurchaseError("Limite do cartão insuficiente para esta compra.")
        finance_account_id = None
    elif credit_card_id is not None:
        raise ProductPurchaseError("Cartão de crédito só se aplica quando o meio é cartão de crédito.")

    if finance_account_id is not None:
        acc = db.execute(
            select(FinanceBankAccount).where(
                FinanceBankAccount.id == finance_account_id,
                FinanceBankAccount.tenant_id == tenant_id,
            )
        ).scalar_one_or_none()
        if acc is None:
            raise ProductPurchaseError("Conta bancária não encontrada.")

    paid_at = datetime.now(timezone.utc) if status == FinanceEntryStatus.PAID else None
    competence = purchased_at
    desc = description.strip() or "Compra de produtos"
    if supplier_name and supplier_name.strip():
        desc = f"{desc} — {supplier_name.strip()}"

    amount_f = float(Decimal(str(total_amount)).quantize(Decimal("0.01")))

    if is_credit_card and card is not None:
        from fastapi import HTTPException

        from app.finance_credit_card_invoice import create_credit_card_expense_entries

        cc_payload = FinanceEntryCreate(
            description=desc[:180],
            entry_type=FinanceEntryType.EXPENSE,
            amount=amount_f,
            payment_method="credit_card",
            credit_card_id=card.id,
            finance_account_id=None,
            category_id=category_id,
            status=status,
            due_date=due_date,
            competence_date=competence,
            notes=None,
        )
        try:
            created_cc = create_credit_card_expense_entries(
                db,
                tenant_id=tenant_id,
                card=card,
                payload=cc_payload,
            )
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            raise ProductPurchaseError(detail) from exc
        entry = created_cc[0]
    else:
        entry = FinanceEntry(
            tenant_id=tenant_id,
            category_id=category_id,
            description=desc[:180],
            entry_type=FinanceEntryType.EXPENSE,
            status=status,
            amount=amount_f,
            payment_method=pm[:40] or None,
            finance_account_id=finance_account_id,
            credit_card_id=None,
            due_date=due_date,
            competence_date=competence,
            expected_settlement_date=due_date,
            settlement_plan="same_as_due",
            paid_at=paid_at,
            notes=None,
        )
        db.add(entry)
        db.flush()

    purchase = ProductPurchase(
        tenant_id=tenant_id,
        finance_entry_id=entry.id,
        supplier_name=supplier_name.strip() if supplier_name else None,
        purchased_at=purchased_at,
        notes=notes.strip() if notes else None,
        created_by_user_id=user_id,
    )
    db.add(purchase)
    db.flush()

    purchase_notes = _build_finance_notes(purchase_id=purchase.id, lines=lines_meta, extra_notes=notes)
    if is_credit_card and entry.notes:
        entry.notes = f"{purchase_notes}\n\n---\n{entry.notes}"
    else:
        entry.notes = purchase_notes
    db.add(entry)

    if inventory_on:
        locked = db.execute(
            select(Product)
            .where(Product.tenant_id == tenant_id, Product.id.in_(product_ids))
            .with_for_update()
        ).scalars().all()
        locked_by_id = {p.id: p for p in locked}

        for prod, qty, unit in parsed_lines:
            p = locked_by_id[prod.id]
            physical = Decimal(str(p.quantity_physical)) + qty
            p.quantity_physical = float(physical)
            p.stock_quantity = float(physical)
            if update_product_cost:
                p.purchase_price = float(unit)
            db.add(
                ProductPurchaseLine(
                    purchase_id=purchase.id,
                    product_id=p.id,
                    quantity=float(qty),
                    unit_cost=float(unit),
                )
            )
            db.add(
                StockMovement(
                    tenant_id=tenant_id,
                    product_id=p.id,
                    quantity_delta=float(qty),
                    reason=StockMovementReason.PURCHASE,
                    product_purchase_id=purchase.id,
                    notes=f"Compra #{purchase.id}",
                )
            )
    else:
        for prod, qty, unit in parsed_lines:
            db.add(
                ProductPurchaseLine(
                    purchase_id=purchase.id,
                    product_id=prod.id,
                    quantity=float(qty),
                    unit_cost=float(unit),
                )
            )

    db.flush()
    return purchase


def purchase_to_out(db: Session, purchase: ProductPurchase) -> dict:
    purchase = db.execute(
        select(ProductPurchase)
        .where(ProductPurchase.id == purchase.id)
        .options(
            selectinload(ProductPurchase.finance_entry),
            selectinload(ProductPurchase.lines).selectinload(ProductPurchaseLine.product),
        )
    ).scalar_one()
    entry = purchase.finance_entry
    line_rows = []
    subtotal = 0.0
    for ln in purchase.lines:
        subtotal += float(ln.quantity) * float(ln.unit_cost)
        p = ln.product
        line_rows.append(
            {
                "id": ln.id,
                "product_id": ln.product_id,
                "product_name": p.name if p else "",
                "sku": p.sku if p else "",
                "quantity": float(ln.quantity),
                "unit_cost": float(ln.unit_cost),
                "line_total": float(ln.quantity) * float(ln.unit_cost),
            }
        )
    return {
        "id": purchase.id,
        "tenant_id": purchase.tenant_id,
        "finance_entry_id": purchase.finance_entry_id,
        "supplier_name": purchase.supplier_name,
        "purchased_at": purchase.purchased_at.isoformat(),
        "notes": purchase.notes,
        "created_at": purchase.created_at,
        "lines_subtotal": round(subtotal, 2),
        "total_paid": float(entry.amount) if entry else 0,
        "finance_entry": {
            "id": entry.id,
            "description": entry.description,
            "status": entry.status.value if hasattr(entry.status, "value") else str(entry.status),
            "amount": float(entry.amount),
            "due_date": entry.due_date.isoformat(),
            "payment_method": entry.payment_method,
            "finance_account_id": entry.finance_account_id,
            "credit_card_id": entry.credit_card_id,
            "category_id": entry.category_id,
        }
        if entry
        else None,
        "lines": line_rows,
    }
