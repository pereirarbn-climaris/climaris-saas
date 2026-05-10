from __future__ import annotations

from datetime import date, datetime, timezone
from calendar import monthrange
from uuid import uuid4
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.limiter import limiter
from app.asaas_client import account_label_from_my_account, create_asaas_payment, test_asaas_api_key
from app.config import API_PUBLIC_BASE_URL
from app.finance_asaas_service import (
    delete_remote_asaas_webhook_if_any,
    ensure_asaas_webhook_secrets,
    register_asaas_webhook_after_save,
)
from app.finance_settlement import (
    expected_settlement_for_parcel,
    normalize_settlement_plan,
    split_fee_amounts,
    split_installment_amounts,
)
from app.finance_asaas_constants import ASAAS_FINANCE_EXTERNAL_REF_PREFIX
from app.marketplace_util import tenant_has_marketplace_app
from app.plan_rules import normalize_plan_key
from app.saas_plan_effective import effective_finance_max_mode
from app.security import decrypt_platform_secret, encrypt_platform_secret
from app.whatsapp import dispatch_template
from app.schemas import (
    FinanceBankAccountCreate,
    FinanceBankAccountOut,
    FinanceBankAccountUpdate,
    FinanceCategoryCreate,
    FinanceCategoryOut,
    FinanceCategorySummaryOut,
    FinanceCategoryUpdate,
    FinanceBalanceSnapshotOut,
    FinanceCashflowOut,
    FinanceCreditCardCreate,
    FinanceCreditCardOut,
    FinanceCreditCardUpdate,
    FinanceEntryCreate,
    FinanceEntryAsaasChargeCreate,
    FinancePaymentFeeCreate,
    FinancePaymentFeeOut,
    FinancePaymentFeeUpdate,
    FinanceEntryOut,
    FinanceGatewayAsaasTest,
    FinanceGatewayAsaasUpsert,
    FinanceSettingsOut,
    FinanceSettingsUpdate,
    FinanceEntryUpdate,
    FinanceSummaryOut,
)
from models import (
    FinanceCategory,
    FinanceBankAccount,
    FinanceCreditCard,
    FinanceAccountType,
    FinanceEntry,
    FinanceEntryStatus,
    FinanceEntryType,
    FinanceGatewayProvider,
    TenantFinancePaymentFee,
    Tenant,
    TenantFinanceGateway,
    User,
    UserRole,
    ServiceOrder,
    OrderStatus,
)

router = APIRouter(tags=["finance"])


def _is_professional_plan(active_plan: str) -> bool:
    normalized = active_plan.strip().lower()
    return any(token in normalized for token in ("pro", "professional", "premium", "enterprise"))


def _get_tenant_or_404(db: Session, tenant_id: int) -> Tenant:
    tenant = db.execute(select(Tenant).where(Tenant.id == tenant_id)).scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    return tenant


def _require_professional_finance(tenant: Tenant) -> None:
    if _is_professional_plan(tenant.active_plan):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Recurso disponível apenas no plano profissional.",
    )


MODE_ORDER = {"basic": 0, "intermediate": 1, "management": 2}


def _plan_max_mode(db: Session, tenant: Tenant) -> str:
    return effective_finance_max_mode(db, tenant)


def _is_pro_or_higher_plan(active_plan: str) -> bool:
    plan = normalize_plan_key(active_plan)
    return plan in {"professional", "enterprise", "beta_internal"}


def _effective_finance_mode(db: Session, tenant: Tenant) -> tuple[str, str, str]:
    selected = (tenant.finance_mode or "basic").strip().lower()
    if selected not in MODE_ORDER:
        selected = "basic"
    plan_max = _plan_max_mode(db, tenant)
    max_mode = plan_max
    if tenant_has_marketplace_app(db, tenant.id, "finance-intermediate"):
        max_mode = "intermediate" if MODE_ORDER[max_mode] < MODE_ORDER["intermediate"] else max_mode
    if tenant_has_marketplace_app(db, tenant.id, "finance-management"):
        max_mode = "management"
    effective = selected if MODE_ORDER[selected] <= MODE_ORDER[max_mode] else max_mode
    return selected, max_mode, effective


def _require_finance_enabled(db: Session, tenant: Tenant) -> str:
    if not tenant.finance_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Financeiro desativado para este workspace.")
    _selected, _max_mode, effective = _effective_finance_mode(db, tenant)
    return effective


def _require_min_mode(db: Session, tenant: Tenant, needed: str) -> str:
    effective = _require_finance_enabled(db, tenant)
    if MODE_ORDER[effective] < MODE_ORDER[needed]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Recurso disponível a partir do modo financeiro '{needed}'.",
        )
    return effective


def _mask_api_key_hint(secret: str) -> str:
    s = (secret or "").strip()
    if len(s) <= 4:
        return "****"
    return "****" + s[-4:]


def _asaas_row_to_public(row: TenantFinanceGateway | None) -> dict:
    empty = {
        "connected": False,
        "sandbox": False,
        "api_key_hint": None,
        "account_label": None,
        "last_validated_at": None,
        "last_validation_error": None,
        "webhook_url": None,
        "webhook_registered": False,
        "webhook_last_error": None,
    }
    if row is None or not row.asaas_api_key_encrypted:
        return empty
    hint = "****"
    try:
        plain = decrypt_platform_secret(row.asaas_api_key_encrypted)
        hint = _mask_api_key_hint(plain)
    except Exception:
        pass
    wh_url = None
    if row.asaas_webhook_path_token and (API_PUBLIC_BASE_URL or "").strip():
        wh_url = f"{API_PUBLIC_BASE_URL.strip().rstrip('/')}/api/v1/webhooks/asaas/{row.asaas_webhook_path_token}"
    return {
        "connected": True,
        "sandbox": bool(row.asaas_sandbox),
        "api_key_hint": hint,
        "account_label": row.account_label,
        "last_validated_at": row.last_validated_at,
        "last_validation_error": row.last_validation_error,
        "webhook_url": wh_url,
        "webhook_registered": bool(row.asaas_webhook_remote_id),
        "webhook_last_error": row.asaas_webhook_last_error,
    }


def _mercadopago_placeholder(effective_mode: str) -> dict:
    locked = MODE_ORDER[effective_mode] < MODE_ORDER["intermediate"]
    return {
        "connected": False,
        "oauth_available": True,
        "requires_mode": "intermediate" if locked else None,
    }


def _add_months(base: date, months: int) -> date:
    if months <= 0:
        return base
    total = (base.month - 1) + months
    y = base.year + (total // 12)
    m = (total % 12) + 1
    d = min(base.day, monthrange(y, m)[1])
    return date(y, m, d)


def _entry_date_column(basis: str):
    if basis == "competence_date":
        return FinanceEntry.competence_date
    if basis == "expected_settlement_date":
        return FinanceEntry.expected_settlement_date
    return FinanceEntry.due_date


def _parse_date_basis(raw: str) -> str:
    b = (raw or "due_date").strip().lower()
    if b in ("due_date", "competence_date", "expected_settlement_date"):
        return b
    return "due_date"


def _entry_basis_date_value(entry: FinanceEntry, basis: str) -> date:
    if basis == "competence_date":
        return entry.competence_date
    if basis == "expected_settlement_date":
        return entry.expected_settlement_date
    return entry.due_date


def _entry_signed_cash_flow(entry: FinanceEntry) -> float:
    amount = float(entry.amount or 0)
    fee = float(entry.fee_amount or 0)
    if entry.entry_type == FinanceEntryType.INCOME:
        return amount - fee
    return -(amount + fee)


def _entry_matches_bank_account(entry: FinanceEntry, account: FinanceBankAccount) -> bool:
    if entry.finance_account_id is not None and entry.finance_account_id == account.id:
        return True
    if (account.name or "").strip().lower() != "caixa":
        return False
    pm = (entry.payment_method or "").strip().lower()
    return pm == "cash" and entry.finance_account_id is None


def _entry_to_out(entry: FinanceEntry) -> dict:
    amount = float(entry.amount)
    fee_amount = float(entry.fee_amount or 0)
    net_amount = amount - fee_amount if entry.entry_type == FinanceEntryType.INCOME else amount + fee_amount
    return {
        "id": entry.id,
        "tenant_id": entry.tenant_id,
        "category_id": entry.category_id,
        "category_name": entry.category.name if entry.category else None,
        "description": entry.description,
        "entry_type": entry.entry_type.value if hasattr(entry.entry_type, "value") else str(entry.entry_type),
        "status": entry.status.value if hasattr(entry.status, "value") else str(entry.status),
        "amount": amount,
        "payment_method": entry.payment_method,
        "payment_provider": entry.payment_provider,
        "finance_account_id": entry.finance_account_id,
        "credit_card_id": entry.credit_card_id,
        "fee_fixed_amount": float(entry.fee_fixed_amount or 0),
        "fee_percent": float(entry.fee_percent or 0),
        "fee_amount": fee_amount,
        "recipient_whatsapp": (entry.recipient_whatsapp or "").strip() or None,
        "gateway_payment_id": entry.gateway_payment_id,
        "installment_group_id": entry.installment_group_id,
        "installment_number": int(entry.installment_number or 1),
        "installment_total": int(entry.installment_total or 1),
        "net_amount": net_amount,
        "due_date": entry.due_date,
        "competence_date": entry.competence_date,
        "expected_settlement_date": entry.expected_settlement_date,
        "settlement_plan": entry.settlement_plan,
        "paid_at": entry.paid_at,
        "notes": entry.notes,
        "service_order_id": entry.service_order_id,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
    }


def _credit_card_used_limit(db: Session, tenant_id: int, card_id: int) -> float:
    used = db.execute(
        select(func.coalesce(func.sum(FinanceEntry.amount), 0)).where(
            FinanceEntry.tenant_id == tenant_id,
            FinanceEntry.credit_card_id == card_id,
            FinanceEntry.entry_type == FinanceEntryType.EXPENSE,
            FinanceEntry.status != FinanceEntryStatus.CANCELLED,
        )
    ).scalar_one()
    return float(used or 0)


def _credit_card_to_out(db: Session, tenant_id: int, row: FinanceCreditCard) -> dict:
    used_limit = _credit_card_used_limit(db, tenant_id, row.id)
    limit_amount = float(row.limit_amount or 0)
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "billing_account_id": row.billing_account_id,
        "name": row.name,
        "brand": row.brand,
        "limit_amount": limit_amount,
        "used_limit": used_limit,
        "available_limit": limit_amount - used_limit,
        "closing_day": int(row.closing_day),
        "due_day": int(row.due_day),
        "is_active": bool(row.is_active),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _ensure_default_cash_account(db: Session, tenant_id: int) -> None:
    cash = db.execute(
        select(FinanceBankAccount).where(
            FinanceBankAccount.tenant_id == tenant_id,
            func.lower(FinanceBankAccount.name) == "caixa",
        )
    ).scalar_one_or_none()
    if cash is not None:
        return
    db.add(
        FinanceBankAccount(
            tenant_id=tenant_id,
            name="Caixa",
            bank_name="Caixa interno",
            account_type=FinanceAccountType.CASH,
            initial_balance=0,
            is_active=True,
        )
    )
    db.commit()


def _safe_send_whatsapp_for_finance_status(db: Session, current_user: User, entry: FinanceEntry) -> None:
    recipient = (entry.recipient_whatsapp or "").strip()
    if not recipient:
        return
    status_value = entry.status.value if hasattr(entry.status, "value") else str(entry.status)
    if status_value not in (FinanceEntryStatus.PAID.value, FinanceEntryStatus.OVERDUE.value):
        return
    try:
        if status_value == FinanceEntryStatus.PAID.value:
            paid_dt = entry.paid_at.astimezone(timezone.utc) if entry.paid_at else datetime.now(timezone.utc)
            dispatch_template(
                db,
                tenant_id=current_user.tenant_id,
                created_by_user=current_user,
                template_key="payment_paid",
                recipient_whatsapp=recipient,
                variables={
                    "nome": "cliente",
                    "valor": f"{float(entry.amount):.2f}".replace(".", ","),
                    "data_pagamento": paid_dt.strftime("%d/%m/%Y"),
                },
                reference_type="finance_entry",
                reference_id=entry.id,
            )
            return

        dispatch_template(
            db,
            tenant_id=current_user.tenant_id,
            created_by_user=current_user,
            template_key="payment_overdue",
            recipient_whatsapp=recipient,
            variables={
                "nome": "cliente",
                "valor": f"{float(entry.amount):.2f}".replace(".", ","),
                "vencimento": entry.due_date.strftime("%d/%m/%Y"),
                "link_pagamento": "Entre em contato para regularizar.",
            },
            reference_type="finance_entry",
            reference_id=entry.id,
        )
    except Exception:
        # Mantém o fluxo financeiro sem bloquear caso WhatsApp esteja indisponível.
        db.rollback()


@router.get(
    "/finance/entries",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
    response_model=list[FinanceEntryOut],
)
def list_finance_entries(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    entry_type: FinanceEntryType | None = Query(default=None),
    status_filter: Annotated[FinanceEntryStatus | None, Query(alias="status")] = None,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    date_basis: str = Query(default="due_date", description="due_date | competence_date | expected_settlement_date"),
    service_order_id: int | None = Query(default=None, ge=1),
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[dict]:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    basis = _parse_date_basis(date_basis)
    date_col = _entry_date_column(basis)
    query = (
        select(FinanceEntry)
        .where(FinanceEntry.tenant_id == current_user.tenant_id)
        .options(selectinload(FinanceEntry.category))
    )
    if entry_type is not None:
        query = query.where(FinanceEntry.entry_type == entry_type)
    if status_filter is not None:
        query = query.where(FinanceEntry.status == status_filter)
    if start_date is not None:
        query = query.where(date_col >= start_date)
    if end_date is not None:
        query = query.where(date_col <= end_date)
    if service_order_id is not None:
        query = query.where(FinanceEntry.service_order_id == service_order_id)
    rows = db.execute(query.order_by(date_col.desc(), FinanceEntry.id.desc()).offset(skip).limit(limit)).scalars().all()
    return JSONResponse(content=jsonable_encoder([_entry_to_out(row) for row in rows]))


@router.post(
    "/finance/entries",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def create_finance_entry(
    request: Request,
    payload: FinanceEntryCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    if payload.service_order_id is not None:
        svc_order = db.execute(
            select(ServiceOrder).where(
                ServiceOrder.id == payload.service_order_id,
                ServiceOrder.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if svc_order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de serviço não encontrada.")
        if svc_order.status != OrderStatus.DONE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Só é possível lançar no financeiro após a OS estar concluída.",
            )
        if payload.entry_type != FinanceEntryType.INCOME:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Lançamentos vinculados à OS devem ser receitas (entrada).",
            )
        dup = db.execute(
            select(func.count())
            .select_from(FinanceEntry)
            .where(
                FinanceEntry.tenant_id == current_user.tenant_id,
                FinanceEntry.service_order_id == payload.service_order_id,
                FinanceEntry.entry_type == FinanceEntryType.INCOME,
                FinanceEntry.status != FinanceEntryStatus.CANCELLED,
            )
        ).scalar_one()
        if int(dup or 0) > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe lançamento financeiro ativo para esta OS.",
            )
    if payload.category_id is not None:
        category = db.execute(
            select(FinanceCategory).where(
                FinanceCategory.id == payload.category_id,
                FinanceCategory.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria não encontrada.")
    if payload.finance_account_id is not None:
        account = db.execute(
            select(FinanceBankAccount).where(
                FinanceBankAccount.id == payload.finance_account_id,
                FinanceBankAccount.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta bancária não encontrada.")
    card: FinanceCreditCard | None = None
    if payload.credit_card_id is not None:
        card = db.execute(
            select(FinanceCreditCard).where(
                FinanceCreditCard.id == payload.credit_card_id,
                FinanceCreditCard.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if card is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cartão de crédito não encontrado.")
    if payload.entry_type == FinanceEntryType.EXPENSE and payload.credit_card_id is not None:
        used = _credit_card_used_limit(db, current_user.tenant_id, payload.credit_card_id)
        projected = used + float(payload.amount)
        if projected > float(card.limit_amount or 0):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Limite do cartão insuficiente para esta compra parcelada.",
            )
    paid_at = datetime.now(timezone.utc) if payload.status == FinanceEntryStatus.PAID else None
    installments = int(payload.installments or 1)
    interval_months = int(payload.installment_interval_months or 1)
    group_id = uuid4().hex if installments > 1 else None
    competence = payload.competence_date or payload.due_date
    plan = normalize_settlement_plan(
        payload.settlement_plan if payload.settlement_plan is not None else None,
        default="same_as_due",
    )
    total_amount = float(payload.amount)
    total_fee = float(payload.fee_amount or 0)
    amounts = split_installment_amounts(total_amount, installments)
    fee_parts = split_fee_amounts(total_fee, amounts)
    created: list[FinanceEntry] = []
    for idx in range(installments):
        parcel_due = _add_months(payload.due_date, idx * interval_months)
        amt = amounts[idx]
        fee_amt = fee_parts[idx]
        exp_settle = expected_settlement_for_parcel(parcel_due, plan)
        entry = FinanceEntry(
            tenant_id=current_user.tenant_id,
            category_id=payload.category_id,
            description=payload.description.strip(),
            entry_type=payload.entry_type,
            status=payload.status,
            amount=amt,
            payment_method=payload.payment_method.strip().lower() if payload.payment_method else None,
            payment_provider=payload.payment_provider.strip() if payload.payment_provider else None,
            finance_account_id=payload.finance_account_id,
            credit_card_id=payload.credit_card_id,
            fee_fixed_amount=payload.fee_fixed_amount,
            fee_percent=payload.fee_percent,
            fee_amount=fee_amt,
            recipient_whatsapp=payload.recipient_whatsapp,
            competence_date=competence,
            expected_settlement_date=exp_settle,
            settlement_plan=plan,
            due_date=parcel_due,
            paid_at=paid_at if idx == 0 else None,
            notes=payload.notes.strip() if payload.notes else None,
            installment_group_id=group_id,
            installment_number=idx + 1,
            installment_total=installments,
            service_order_id=payload.service_order_id,
        )
        db.add(entry)
        created.append(entry)
    db.commit()
    for row in created:
        db.refresh(row)
        _safe_send_whatsapp_for_finance_status(db, current_user, row)
        db.refresh(row)
    if installments == 1:
        return JSONResponse(content=jsonable_encoder(_entry_to_out(created[0])))
    return JSONResponse(
        content=jsonable_encoder(
            {
                "status": "ok",
                "installment_group_id": group_id,
                "created_count": installments,
                "entries": [_entry_to_out(row) for row in created],
            }
        )
    )


@router.patch(
    "/finance/entries/{entry_id}",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def patch_finance_entry(
    request: Request,
    entry_id: int,
    payload: FinanceEntryUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    entry = db.execute(
        select(FinanceEntry)
        .where(and_(FinanceEntry.id == entry_id, FinanceEntry.tenant_id == current_user.tenant_id))
        .options(selectinload(FinanceEntry.category))
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento não encontrado.")

    if payload.category_id is not None:
        category = db.execute(
            select(FinanceCategory).where(
                FinanceCategory.id == payload.category_id,
                FinanceCategory.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria não encontrada.")
    if payload.finance_account_id is not None:
        account = db.execute(
            select(FinanceBankAccount).where(
                FinanceBankAccount.id == payload.finance_account_id,
                FinanceBankAccount.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta bancária não encontrada.")
    if payload.credit_card_id is not None:
        card = db.execute(
            select(FinanceCreditCard).where(
                FinanceCreditCard.id == payload.credit_card_id,
                FinanceCreditCard.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if card is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cartão de crédito não encontrado.")

    scope = payload.edit_scope or "single"
    targets = [entry]
    if scope != "single":
        if not entry.installment_group_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lançamento não possui grupo de parcelas.")
        q = select(FinanceEntry).where(
            FinanceEntry.tenant_id == current_user.tenant_id,
            FinanceEntry.installment_group_id == entry.installment_group_id,
        )
        if scope == "future":
            q = q.where(FinanceEntry.installment_number >= entry.installment_number)
        targets = db.execute(q.order_by(FinanceEntry.installment_number.asc())).scalars().all()
    if scope != "single" and payload.gateway_payment_id is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="gateway_payment_id só pode ser alterado em uma parcela.")

    for row in targets:
        if payload.description is not None:
            row.description = payload.description.strip()
        if payload.amount is not None:
            row.amount = payload.amount
        if payload.payment_method is not None:
            row.payment_method = payload.payment_method.strip().lower() or None
        if payload.payment_provider is not None:
            row.payment_provider = payload.payment_provider.strip() or None
        if payload.finance_account_id is not None:
            row.finance_account_id = payload.finance_account_id
        if payload.credit_card_id is not None:
            row.credit_card_id = payload.credit_card_id
        if payload.fee_fixed_amount is not None:
            row.fee_fixed_amount = payload.fee_fixed_amount
        if payload.fee_percent is not None:
            row.fee_percent = payload.fee_percent
        if payload.fee_amount is not None:
            row.fee_amount = payload.fee_amount
        if payload.recipient_whatsapp is not None:
            row.recipient_whatsapp = payload.recipient_whatsapp
        if payload.gateway_payment_id is not None:
            row.gateway_payment_id = (payload.gateway_payment_id.strip()[:48] or None) if payload.gateway_payment_id else None
        if payload.installment_group_id is not None:
            row.installment_group_id = payload.installment_group_id.strip() or None
        if payload.installment_number is not None:
            row.installment_number = payload.installment_number
        if payload.installment_total is not None:
            row.installment_total = payload.installment_total
        if payload.due_date is not None:
            row.due_date = payload.due_date
            row.expected_settlement_date = expected_settlement_for_parcel(row.due_date, row.settlement_plan)
        if payload.competence_date is not None:
            row.competence_date = payload.competence_date
        if payload.settlement_plan is not None:
            row.settlement_plan = normalize_settlement_plan(payload.settlement_plan, default="same_as_due")
            row.expected_settlement_date = expected_settlement_for_parcel(row.due_date, row.settlement_plan)
        if payload.notes is not None:
            row.notes = payload.notes.strip() or None
        if payload.category_id is not None:
            row.category_id = payload.category_id
        if payload.status is not None:
            row.status = payload.status
            if payload.status == FinanceEntryStatus.PAID:
                row.paid_at = row.paid_at or datetime.now(timezone.utc)
            elif payload.status != FinanceEntryStatus.PAID:
                row.paid_at = None
        db.add(row)

    db.commit()
    for row in targets:
        db.refresh(row)
        _safe_send_whatsapp_for_finance_status(db, current_user, row)
        db.refresh(row)

    if scope == "single":
        return JSONResponse(content=jsonable_encoder(_entry_to_out(targets[0])))
    return JSONResponse(
        content=jsonable_encoder(
            {"status": "ok", "edit_scope": scope, "updated_count": len(targets), "entries": [_entry_to_out(r) for r in targets]}
        )
    )


@router.post(
    "/finance/entries/{entry_id}/asaas-charge",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def create_asaas_charge_for_entry(
    request: Request,
    entry_id: int,
    payload: FinanceEntryAsaasChargeCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    entry = db.execute(
        select(FinanceEntry).where(
            FinanceEntry.id == entry_id,
            FinanceEntry.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento não encontrado.")
    if entry.entry_type != FinanceEntryType.INCOME:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Somente receitas podem gerar cobrança.")
    if entry.status == FinanceEntryStatus.PAID:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lançamento já está pago.")
    if entry.gateway_payment_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Lançamento já vinculado a cobrança Asaas.")

    gw = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == current_user.tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.ASAAS,
        )
    ).scalar_one_or_none()
    if gw is None or not gw.asaas_api_key_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Asaas não conectado neste workspace.")

    api_key = decrypt_platform_secret(gw.asaas_api_key_encrypted)
    external_ref = f"{ASAAS_FINANCE_EXTERNAL_REF_PREFIX}{entry.id}"
    ok, err, payment_id, invoice_url = create_asaas_payment(
        api_key=api_key,
        sandbox=bool(gw.asaas_sandbox),
        customer_id=payload.customer_id,
        billing_type=payload.billing_type,
        value=float(entry.amount),
        due_date_iso=entry.due_date.isoformat(),
        description=entry.description,
        external_reference=external_ref,
    )
    if not ok or not payment_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Falha ao emitir cobrança no Asaas.")

    entry.gateway_payment_id = payment_id
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "status": "ok",
        "entry": _entry_to_out(entry),
        "payment_id": payment_id,
        "invoice_url": invoice_url,
        "external_reference": external_ref,
        "sandbox": bool(gw.asaas_sandbox),
    }


@router.post(
    "/finance/entries/send-reminders",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("30/minute")
def send_finance_due_reminders(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    due_date: date = Query(...),
    mode: Annotated[Literal["manual", "automatic"], Query()] = "manual",
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    if mode == "automatic" and not _is_pro_or_higher_plan(tenant.active_plan):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Lembrete automático por WhatsApp disponível apenas no plano Professional ou superior.",
        )
    entries = db.execute(
        select(FinanceEntry).where(
            FinanceEntry.tenant_id == current_user.tenant_id,
            FinanceEntry.due_date == due_date,
            FinanceEntry.status == FinanceEntryStatus.PENDING,
            FinanceEntry.recipient_whatsapp.is_not(None),
        )
    ).scalars().all()
    sent_count = 0
    for entry in entries:
        recipient = (entry.recipient_whatsapp or "").strip()
        if not recipient:
            continue
        try:
            dispatch_template(
                db,
                tenant_id=current_user.tenant_id,
                created_by_user=current_user,
                template_key="reminder_due",
                recipient_whatsapp=recipient,
                variables={
                    "nome": "cliente",
                    "valor": f"{float(entry.amount):.2f}".replace(".", ","),
                    "vencimento": entry.due_date.strftime("%d/%m/%Y"),
                    "link_pagamento": "Entre em contato para receber o link de pagamento.",
                },
                reference_type="finance_entry",
                reference_id=entry.id,
            )
            sent_count += 1
        except Exception:
            db.rollback()
            continue
    return {"status": "ok", "mode": mode, "due_date": due_date.isoformat(), "eligible": len(entries), "sent": sent_count}


@router.delete(
    "/finance/entries/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def delete_finance_entry(
    request: Request,
    entry_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    edit_scope: Literal["single", "future", "all"] = Query(default="single"),
) -> None:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    entry = db.execute(
        select(FinanceEntry).where(
            FinanceEntry.id == entry_id,
            FinanceEntry.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento não encontrado.")

    targets: list[FinanceEntry] = [entry]
    if edit_scope != "single":
        if not entry.installment_group_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Lançamento não possui grupo de parcelas.",
            )
        q = select(FinanceEntry).where(
            FinanceEntry.tenant_id == current_user.tenant_id,
            FinanceEntry.installment_group_id == entry.installment_group_id,
        )
        if edit_scope == "future":
            q = q.where(FinanceEntry.installment_number >= entry.installment_number)
        targets = db.execute(q.order_by(FinanceEntry.installment_number.asc())).scalars().all()

    for row in targets:
        db.delete(row)
    db.commit()
    return None


@router.get(
    "/finance/summary",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
    response_model=FinanceSummaryOut,
)
def get_finance_summary(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    start_date: date = Query(...),
    end_date: date = Query(...),
    date_basis: str = Query(default="due_date"),
) -> dict:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    if end_date < start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Período inválido.")
    basis = _parse_date_basis(date_basis)
    date_col = _entry_date_column(basis)
    rows = db.execute(
        select(FinanceEntry).where(
            FinanceEntry.tenant_id == current_user.tenant_id,
            date_col >= start_date,
            date_col <= end_date,
        )
    ).scalars().all()
    incomes = sum(float(r.amount) for r in rows if r.entry_type == FinanceEntryType.INCOME)
    income_fees = sum(float(r.fee_amount or 0) for r in rows if r.entry_type == FinanceEntryType.INCOME)
    incomes_net = incomes - income_fees
    expenses = sum(float(r.amount) for r in rows if r.entry_type == FinanceEntryType.EXPENSE)
    expense_fees = sum(float(r.fee_amount or 0) for r in rows if r.entry_type == FinanceEntryType.EXPENSE)
    total_fees = income_fees + expense_fees
    pending_count = sum(1 for r in rows if r.status == FinanceEntryStatus.PENDING)
    overdue_count = sum(1 for r in rows if r.status == FinanceEntryStatus.OVERDUE)
    return {
        "period_start": start_date,
        "period_end": end_date,
        "incomes": incomes,
        "incomes_net": incomes_net,
        "expenses": expenses,
        "total_fees": total_fees,
        "net": incomes_net - expenses - expense_fees,
        "pending_count": pending_count,
        "overdue_count": overdue_count,
        "total_count": len(rows),
    }


@router.get(
    "/finance/advanced-summary",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
    response_model=list[FinanceCategorySummaryOut],
)
def get_advanced_summary(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    start_date: date = Query(...),
    end_date: date = Query(...),
    date_basis: str = Query(default="due_date"),
) -> list[dict]:
    if end_date < start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Período inválido.")
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_min_mode(db, tenant, "intermediate")
    basis = _parse_date_basis(date_basis)
    date_col = _entry_date_column(basis)
    rows = db.execute(
        select(
            FinanceEntry.category_id,
            FinanceCategory.name,
            func.sum(case((FinanceEntry.entry_type == FinanceEntryType.INCOME, FinanceEntry.amount), else_=0)).label(
                "income_total"
            ),
            func.sum(case((FinanceEntry.entry_type == FinanceEntryType.EXPENSE, FinanceEntry.amount), else_=0)).label(
                "expense_total"
            ),
        )
        .join(FinanceCategory, FinanceCategory.id == FinanceEntry.category_id, isouter=True)
        .where(
            FinanceEntry.tenant_id == current_user.tenant_id,
            date_col >= start_date,
            date_col <= end_date,
        )
        .group_by(FinanceEntry.category_id, FinanceCategory.name)
        .order_by(FinanceCategory.name.asc().nulls_last())
    ).all()
    return [
        {
            "category_id": row[0],
            "category_name": row[1] or "Sem categoria",
            "income_total": float(row[2] or 0),
            "expense_total": float(row[3] or 0),
            "balance": float(row[2] or 0) - float(row[3] or 0),
        }
        for row in rows
    ]


@router.get(
    "/finance/categories",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
    response_model=list[FinanceCategoryOut],
)
def list_finance_categories(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[dict]:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    rows = db.execute(
        select(FinanceCategory)
        .where(FinanceCategory.tenant_id == current_user.tenant_id)
        .order_by(FinanceCategory.name.asc())
    ).scalars().all()
    return JSONResponse(content=jsonable_encoder(rows))


@router.post(
    "/finance/categories",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def create_finance_category(
    request: Request,
    payload: FinanceCategoryCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_min_mode(db, tenant, "intermediate")
    already_exists = db.execute(
        select(FinanceCategory).where(
            FinanceCategory.tenant_id == current_user.tenant_id,
            FinanceCategory.name == payload.name.strip(),
        )
    ).scalar_one_or_none()
    if already_exists is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Categoria já existe.")
    row = FinanceCategory(
        tenant_id=current_user.tenant_id,
        name=payload.name.strip(),
        color=payload.color.strip().upper() if payload.color else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return JSONResponse(content=jsonable_encoder(row))


@router.patch(
    "/finance/categories/{category_id}",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def patch_finance_category(
    request: Request,
    category_id: int,
    payload: FinanceCategoryUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> JSONResponse:
    del request
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum campo para atualizar.",
        )
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    _require_min_mode(db, tenant, "intermediate")
    row = db.execute(
        select(FinanceCategory).where(
            FinanceCategory.id == category_id,
            FinanceCategory.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria não encontrada.")
    if "name" in updates:
        name_clean = updates["name"].strip()
        dup = db.execute(
            select(FinanceCategory).where(
                FinanceCategory.tenant_id == current_user.tenant_id,
                FinanceCategory.name == name_clean,
                FinanceCategory.id != category_id,
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe uma categoria com esse nome.")
        row.name = name_clean
    if "color" in updates:
        raw_color = updates["color"]
        row.color = raw_color.strip().upper() if raw_color and str(raw_color).strip() else None
    db.add(row)
    db.commit()
    db.refresh(row)
    return JSONResponse(content=jsonable_encoder(row))


@router.delete(
    "/finance/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def delete_finance_category(
    request: Request,
    category_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    _require_min_mode(db, tenant, "intermediate")
    row = db.execute(
        select(FinanceCategory).where(
            FinanceCategory.id == category_id,
            FinanceCategory.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria não encontrada.")
    db.delete(row)
    db.commit()
    return None


@router.get(
    "/finance/accounts",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
    response_model=list[FinanceBankAccountOut],
)
def list_finance_accounts(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[FinanceBankAccount]:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    _ensure_default_cash_account(db, current_user.tenant_id)
    return db.execute(
        select(FinanceBankAccount)
        .where(FinanceBankAccount.tenant_id == current_user.tenant_id)
        .order_by(FinanceBankAccount.name.asc())
    ).scalars().all()


@router.post(
    "/finance/accounts",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
    response_model=FinanceBankAccountOut,
)
@limiter.limit("120/minute")
def create_finance_account(
    request: Request,
    payload: FinanceBankAccountCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> FinanceBankAccount:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    _ensure_default_cash_account(db, current_user.tenant_id)
    row = FinanceBankAccount(
        tenant_id=current_user.tenant_id,
        name=payload.name.strip(),
        bank_name=payload.bank_name.strip() if payload.bank_name else None,
        account_type=FinanceAccountType(payload.account_type),
        initial_balance=payload.initial_balance,
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch(
    "/finance/accounts/{account_id}",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
    response_model=FinanceBankAccountOut,
)
@limiter.limit("120/minute")
def patch_finance_account(
    request: Request,
    account_id: int,
    payload: FinanceBankAccountUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> FinanceBankAccount:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    row = db.execute(
        select(FinanceBankAccount).where(
            FinanceBankAccount.id == account_id,
            FinanceBankAccount.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta bancária não encontrada.")
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.bank_name is not None:
        row.bank_name = payload.bank_name.strip() or None
    if payload.account_type is not None:
        row.account_type = FinanceAccountType(payload.account_type)
    if payload.initial_balance is not None:
        row.initial_balance = payload.initial_balance
    if payload.is_active is not None:
        row.is_active = payload.is_active
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/finance/accounts/{account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("120/minute")
def delete_finance_account(
    request: Request,
    account_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    row = db.execute(
        select(FinanceBankAccount).where(
            FinanceBankAccount.id == account_id,
            FinanceBankAccount.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta bancária não encontrada.")
    if row.name.strip().lower() == "caixa":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A conta Caixa é obrigatória e não pode ser removida.")
    db.delete(row)
    db.commit()
    return None


@router.get(
    "/finance/credit-cards",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
    response_model=list[FinanceCreditCardOut],
)
def list_finance_credit_cards(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[dict]:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    rows = db.execute(
        select(FinanceCreditCard)
        .where(FinanceCreditCard.tenant_id == current_user.tenant_id)
        .order_by(FinanceCreditCard.name.asc())
    ).scalars().all()
    return [_credit_card_to_out(db, current_user.tenant_id, row) for row in rows]


@router.post(
    "/finance/credit-cards",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
    response_model=FinanceCreditCardOut,
)
@limiter.limit("120/minute")
def create_finance_credit_card(
    request: Request,
    payload: FinanceCreditCardCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    if payload.billing_account_id is not None:
        account = db.execute(
            select(FinanceBankAccount).where(
                FinanceBankAccount.id == payload.billing_account_id,
                FinanceBankAccount.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta de cobrança não encontrada.")
    row = FinanceCreditCard(
        tenant_id=current_user.tenant_id,
        billing_account_id=payload.billing_account_id,
        name=payload.name.strip(),
        brand=payload.brand.strip().lower(),
        limit_amount=payload.limit_amount,
        closing_day=payload.closing_day,
        due_day=payload.due_day,
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _credit_card_to_out(db, current_user.tenant_id, row)


@router.patch(
    "/finance/credit-cards/{card_id}",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
    response_model=FinanceCreditCardOut,
)
@limiter.limit("120/minute")
def patch_finance_credit_card(
    request: Request,
    card_id: int,
    payload: FinanceCreditCardUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    row = db.execute(
        select(FinanceCreditCard).where(
            FinanceCreditCard.id == card_id,
            FinanceCreditCard.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cartão não encontrado.")
    if payload.billing_account_id is not None:
        account = db.execute(
            select(FinanceBankAccount).where(
                FinanceBankAccount.id == payload.billing_account_id,
                FinanceBankAccount.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta de cobrança não encontrada.")
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.brand is not None:
        row.brand = payload.brand.strip().lower()
    if payload.billing_account_id is not None:
        row.billing_account_id = payload.billing_account_id
    if payload.limit_amount is not None:
        row.limit_amount = payload.limit_amount
    if payload.closing_day is not None:
        row.closing_day = payload.closing_day
    if payload.due_day is not None:
        row.due_day = payload.due_day
    if payload.is_active is not None:
        row.is_active = payload.is_active
    db.add(row)
    db.commit()
    db.refresh(row)
    return _credit_card_to_out(db, current_user.tenant_id, row)


@router.delete(
    "/finance/credit-cards/{card_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("120/minute")
def delete_finance_credit_card(
    request: Request,
    card_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    row = db.execute(
        select(FinanceCreditCard).where(
            FinanceCreditCard.id == card_id,
            FinanceCreditCard.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cartão não encontrado.")
    db.delete(row)
    db.commit()
    return None


@router.get(
    "/finance/cashflow",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
    response_model=FinanceCashflowOut,
)
def get_finance_cashflow(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    start_date: date = Query(...),
    end_date: date = Query(...),
) -> dict:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_min_mode(db, tenant, "management")
    if end_date < start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Período inválido.")
    opening_balance = float(
        db.execute(
            select(func.coalesce(func.sum(FinanceBankAccount.initial_balance), 0)).where(
                FinanceBankAccount.tenant_id == current_user.tenant_id
            )
        ).scalar_one()
    )
    rows = db.execute(
        select(FinanceEntry).where(
            FinanceEntry.tenant_id == current_user.tenant_id,
            FinanceEntry.expected_settlement_date >= start_date,
            FinanceEntry.expected_settlement_date <= end_date,
            FinanceEntry.status != FinanceEntryStatus.CANCELLED,
        )
    ).scalars().all()
    incomes = sum(float(r.amount or 0) for r in rows if r.entry_type == FinanceEntryType.INCOME)
    expenses = sum(float(r.amount or 0) for r in rows if r.entry_type == FinanceEntryType.EXPENSE)
    net_flow = incomes - expenses
    return {
        "period_start": start_date,
        "period_end": end_date,
        "opening_balance": opening_balance,
        "incomes": incomes,
        "expenses": expenses,
        "net_flow": net_flow,
        "closing_balance": opening_balance + net_flow,
    }


@router.get(
    "/finance/balance-snapshot",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
    response_model=FinanceBalanceSnapshotOut,
)
def get_finance_balance_snapshot(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    end_date: date = Query(..., description="Saldo projetado considera lançamentos até esta data (fim do período)."),
    date_basis: str = Query(default="due_date", description="due_date | competence_date | expected_settlement_date"),
) -> dict:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    basis = _parse_date_basis(date_basis)
    tzname = (tenant.timezone or "").strip() or "America/Sao_Paulo"
    try:
        tenant_tz = ZoneInfo(tzname)
    except Exception:
        tenant_tz = ZoneInfo("America/Sao_Paulo")
    today = datetime.now(tenant_tz).date()

    initial_total = float(
        db.execute(
            select(func.coalesce(func.sum(FinanceBankAccount.initial_balance), 0)).where(
                FinanceBankAccount.tenant_id == current_user.tenant_id,
                FinanceBankAccount.is_active.is_(True),
            )
        ).scalar_one()
        or 0
    )

    entries = db.execute(
        select(FinanceEntry).where(
            FinanceEntry.tenant_id == current_user.tenant_id,
            FinanceEntry.status != FinanceEntryStatus.CANCELLED,
        )
    ).scalars().all()

    current_flow_total = 0.0
    projected_flow_total = 0.0
    for entry in entries:
        bdv = _entry_basis_date_value(entry, basis)
        signed = _entry_signed_cash_flow(entry)
        if entry.status == FinanceEntryStatus.PAID and bdv <= today:
            current_flow_total += signed
        if bdv <= end_date:
            projected_flow_total += signed

    accounts = db.execute(
        select(FinanceBankAccount)
        .where(
            FinanceBankAccount.tenant_id == current_user.tenant_id,
            FinanceBankAccount.is_active.is_(True),
        )
        .order_by(FinanceBankAccount.name.asc())
    ).scalars().all()

    account_rows: list[dict] = []
    for acc in accounts:
        initial = float(acc.initial_balance or 0)
        cur_flow = 0.0
        proj_flow = 0.0
        for entry in entries:
            if not _entry_matches_bank_account(entry, acc):
                continue
            bdv = _entry_basis_date_value(entry, basis)
            signed = _entry_signed_cash_flow(entry)
            if entry.status == FinanceEntryStatus.PAID and bdv <= today:
                cur_flow += signed
            if bdv <= end_date:
                proj_flow += signed
        account_rows.append(
            {
                "id": acc.id,
                "name": acc.name,
                "initial_balance": initial,
                "current_balance": initial + cur_flow,
                "projected_balance": initial + proj_flow,
            }
        )

    return {
        "date_basis": basis,
        "period_end": end_date,
        "as_of": today,
        "initial_balance_total": initial_total,
        "current_balance_total": initial_total + current_flow_total,
        "projected_balance_total": initial_total + projected_flow_total,
        "accounts": account_rows,
    }


@router.get(
    "/finance/settings",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
    response_model=FinanceSettingsOut,
)
def get_finance_settings(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    selected, max_mode, effective = _effective_finance_mode(db, tenant)
    requires_slug = None
    if MODE_ORDER[selected] > MODE_ORDER[max_mode]:
        requires_slug = "finance-management" if selected == "management" else "finance-intermediate"
    return {
        "finance_enabled": bool(tenant.finance_enabled),
        "selected_mode": selected,
        "effective_mode": effective,
        "max_available_mode": max_mode,
        "can_use_marketplace_upgrade": MODE_ORDER[max_mode] < MODE_ORDER["management"],
        "requires_marketplace_slug": requires_slug,
    }


@router.patch(
    "/finance/settings",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
    response_model=FinanceSettingsOut,
)
def patch_finance_settings(
    payload: FinanceSettingsUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    tenant.finance_enabled = payload.finance_enabled
    tenant.finance_mode = payload.finance_mode
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    selected, max_mode, effective = _effective_finance_mode(db, tenant)
    requires_slug = None
    if MODE_ORDER[selected] > MODE_ORDER[max_mode]:
        requires_slug = "finance-management" if selected == "management" else "finance-intermediate"
    return {
        "finance_enabled": bool(tenant.finance_enabled),
        "selected_mode": selected,
        "effective_mode": effective,
        "max_available_mode": max_mode,
        "can_use_marketplace_upgrade": MODE_ORDER[max_mode] < MODE_ORDER["management"],
        "requires_marketplace_slug": requires_slug,
    }


@router.get(
    "/finance/gateways",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def list_finance_gateways(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    effective = _require_finance_enabled(db, tenant)
    row = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == current_user.tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.ASAAS,
        )
    ).scalar_one_or_none()
    return {
        "effective_mode": effective,
        "asaas": _asaas_row_to_public(row),
        "mercadopago": _mercadopago_placeholder(effective),
    }


@router.post(
    "/finance/gateways/asaas/test",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("30/minute")
def test_finance_gateway_asaas(
    request: Request,
    payload: FinanceGatewayAsaasTest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    ok, err, data = test_asaas_api_key(payload.api_key, sandbox=payload.sandbox)
    label = account_label_from_my_account(data or {})
    return {
        "ok": ok,
        "error": err,
        "account_label": label if ok else None,
    }


@router.put(
    "/finance/gateways/asaas",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("30/minute")
def upsert_finance_gateway_asaas(
    request: Request,
    payload: FinanceGatewayAsaasUpsert,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    ok, err, data = test_asaas_api_key(payload.api_key, sandbox=payload.sandbox)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Falha ao validar a chave Asaas.")
    label = account_label_from_my_account(data or {})

    row = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == current_user.tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.ASAAS,
        )
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if row is None:
        row = TenantFinanceGateway(
            tenant_id=current_user.tenant_id,
            provider=FinanceGatewayProvider.ASAAS,
        )
        db.add(row)
    ensure_asaas_webhook_secrets(row)
    row.asaas_api_key_encrypted = encrypt_platform_secret(payload.api_key.strip())
    row.asaas_sandbox = payload.sandbox
    row.last_validated_at = now
    row.last_validation_error = None
    row.account_label = label
    db.add(row)
    db.commit()
    db.refresh(row)
    register_asaas_webhook_after_save(db, row, payload.api_key.strip(), payload.sandbox)
    db.commit()
    db.refresh(row)
    _sel, _max, effective = _effective_finance_mode(db, tenant)
    return {
        "status": "ok",
        "asaas": _asaas_row_to_public(row),
        "mercadopago": _mercadopago_placeholder(effective),
    }


@router.delete(
    "/finance/gateways/asaas",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("30/minute")
def delete_finance_gateway_asaas(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    row = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == current_user.tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.ASAAS,
        )
    ).scalar_one_or_none()
    if row is not None:
        if row.asaas_api_key_encrypted:
            try:
                api_plain = decrypt_platform_secret(row.asaas_api_key_encrypted)
                delete_remote_asaas_webhook_if_any(row, api_plain, bool(row.asaas_sandbox))
            except Exception:
                pass
        db.delete(row)
        db.commit()
    return None


@router.get(
    "/finance/payment-fees",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
    response_model=list[FinancePaymentFeeOut],
)
def list_finance_payment_fees(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[TenantFinancePaymentFee]:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    return db.execute(
        select(TenantFinancePaymentFee)
        .where(TenantFinancePaymentFee.tenant_id == current_user.tenant_id)
        .order_by(
            TenantFinancePaymentFee.provider_name.asc(),
            TenantFinancePaymentFee.payment_method.asc(),
            TenantFinancePaymentFee.installments.asc(),
        )
    ).scalars().all()


@router.post(
    "/finance/payment-fees",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
    response_model=FinancePaymentFeeOut,
)
@limiter.limit("120/minute")
def create_finance_payment_fee(
    request: Request,
    payload: FinancePaymentFeeCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TenantFinancePaymentFee:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    row = TenantFinancePaymentFee(
        tenant_id=current_user.tenant_id,
        provider_name=payload.provider_name.strip(),
        payment_method=payload.payment_method.strip().lower(),
        installments=payload.installments,
        fee_percent=payload.fee_percent,
        fee_fixed_amount=payload.fee_fixed_amount,
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch(
    "/finance/payment-fees/{fee_id}",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
    response_model=FinancePaymentFeeOut,
)
@limiter.limit("120/minute")
def patch_finance_payment_fee(
    request: Request,
    fee_id: int,
    payload: FinancePaymentFeeUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TenantFinancePaymentFee:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    row = db.execute(
        select(TenantFinancePaymentFee).where(
            TenantFinancePaymentFee.id == fee_id,
            TenantFinancePaymentFee.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Taxa não encontrada.")
    if payload.provider_name is not None:
        row.provider_name = payload.provider_name.strip()
    if payload.payment_method is not None:
        row.payment_method = payload.payment_method.strip().lower()
    if payload.installments is not None:
        row.installments = payload.installments
    if payload.fee_percent is not None:
        row.fee_percent = payload.fee_percent
    if payload.fee_fixed_amount is not None:
        row.fee_fixed_amount = payload.fee_fixed_amount
    if payload.is_active is not None:
        row.is_active = payload.is_active
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/finance/payment-fees/{fee_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("120/minute")
def delete_finance_payment_fee(
    request: Request,
    fee_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    row = db.execute(
        select(TenantFinancePaymentFee).where(
            TenantFinancePaymentFee.id == fee_id,
            TenantFinancePaymentFee.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Taxa não encontrada.")
    db.delete(row)
    db.commit()
    return None
