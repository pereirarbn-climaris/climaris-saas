from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, time, timezone
from decimal import Decimal
from calendar import monthrange
from uuid import uuid4
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.limiter import limiter
from app.asaas_client import account_label_from_my_account, create_asaas_payment, test_asaas_api_key
from app.mercadopago_client import (
    account_label_from_mp_user,
    create_mercadopago_boleto_payment,
    create_mercadopago_checkout_preference,
    create_mercadopago_pix_payment,
    mercadopago_payment_boleto_urls,
    mercadopago_payment_pix_urls,
    mercadopago_preference_checkout_urls,
    mp_user_id_str,
    test_mercadopago_access_token,
)
from app.config import mercadopago_webhook_signature_enforced, public_api_base_url
from app.finance_asaas_service import (
    delete_remote_asaas_webhook_if_any,
    ensure_asaas_webhook_secrets,
    register_asaas_webhook_after_save,
)
from app.finance_bank_catalog_storage import logo_file_path
from app.finance_ofx_service import (
    amount_matches_ofx_line,
    finance_entry_matches_bank_account_for_ofx,
    suggest_finance_entries_for_ofx_line,
)
from app.finance_settlement import (
    expected_settlement_for_parcel,
    normalize_settlement_plan,
    split_fee_amounts,
    split_installment_amounts,
)
from app.finance_asaas_constants import ASAAS_FINANCE_EXTERNAL_REF_PREFIX
from app.finance_mercadopago_constants import MERCADOPAGO_FINANCE_EXTERNAL_REF_PREFIX
from app.finance_mercadopago_service import ensure_mercadopago_webhook_secrets, sync_mercadopago_balance_snapshot
from app.finance_entry_payer_hints import (
    batch_linked_payers_by_service_order_ids,
    linked_payer_for_entry,
    merge_stone_payer_contact,
)
from app.finance_stone_constants import STONE_FINANCE_EXTERNAL_REF_PREFIX
from app.finance_stone_service import ensure_stone_webhook_secrets
from app.stone_pagarme_client import (
    account_label_from_pagarme_orders_payload,
    boleto_due_at_iso_from_entry_due,
    create_pagarme_boleto_order,
    create_pagarme_credit_card_order,
    create_pagarme_pix_order,
    credit_card_charge_declined_message,
    customer_block_with_br_document,
    extract_boleto_from_order,
    extract_order_id,
    extract_pix_from_order,
    fetch_pagarme_order,
    test_pagarme_secret_key,
)
from app.marketplace_util import tenant_has_marketplace_app
from app.plan_rules import normalize_plan_key
from app.ofx_parser import parse_ofx_statement_transactions
from app.saas_plan_effective import effective_finance_max_mode
from app.security import decrypt_platform_secret, encrypt_platform_secret
from app.whatsapp import dispatch_template
from app.schemas import (
    FinanceBankAccountCreate,
    FinanceBankAccountOut,
    FinanceBankAccountUpdate,
    FinanceBankCatalogPublicOut,
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
    FinanceEntryMercadoPagoBoletoChargeCreate,
    FinanceEntryMercadoPagoChargeCreate,
    FinanceEntryMercadoPagoPreferenceCreate,
    FinancePaymentFeeCreate,
    FinancePaymentFeeOut,
    FinancePaymentFeeUpdate,
    FinanceEntryOut,
    FinanceGatewayAsaasTest,
    FinanceGatewayAsaasUpsert,
    FinanceGatewayMercadoPagoProductsUpdate,
    FinanceGatewayMercadoPagoTest,
    FinanceGatewayMercadoPagoUpsert,
    FinanceGatewayMercadoPagoWebhookSignatureUpdate,
    FinanceGatewayStoneTest,
    FinanceGatewayStoneUpsert,
    FinanceEntryStoneBoletoChargeCreate,
    FinanceEntryStoneCardChargeCreate,
    FinanceEntryStoneChargeCreate,
    FinanceOfxApplyMatches,
    FinanceSettingsOut,
    FinanceSettingsUpdate,
    FinanceEntryUpdate,
    FinanceSummaryOut,
)
from models import (
    FinanceCategory,
    FinanceBankAccount,
    FinanceBankCatalog,
    FinanceCreditCard,
    FinanceAccountType,
    FinanceEntry,
    FinanceEntryStatus,
    FinanceEntryType,
    FinanceGatewayProvider,
    FinanceOfxImport,
    FinanceOfxStatementLine,
    TenantFinancePaymentFee,
    Tenant,
    TenantFinanceGateway,
    User,
    UserRole,
    ServiceOrder,
    OrderStatus,
    Client,
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
    base_pub = public_api_base_url()
    if row.asaas_webhook_path_token and base_pub:
        wh_url = f"{base_pub}/api/v1/webhooks/asaas/{row.asaas_webhook_path_token}"
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


def _mp_products_default() -> dict[str, bool]:
    return {"checkout_pro": False, "pix": False, "boleto": False, "subscriptions": False, "payment_link": False}


def _mp_products_parse(raw: str | None) -> dict[str, bool]:
    out = _mp_products_default()
    if not raw or not str(raw).strip():
        return out
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            for k in out:
                if k in data and isinstance(data[k], bool):
                    out[k] = bool(data[k])
    except Exception:
        pass
    return out


def _mp_products_dump(d: dict[str, bool]) -> str:
    base = _mp_products_default()
    for k in base:
        if k in d:
            base[k] = bool(d[k])
    return json.dumps(base, separators=(",", ":"))


def _mercadopago_row_to_public(row: TenantFinanceGateway | None) -> dict:
    empty: dict = {
        "connected": False,
        "sandbox": False,
        "access_token_hint": None,
        "public_key_hint": None,
        "public_key": None,
        "account_label": None,
        "mp_user_id": None,
        "finance_bank_account_id": None,
        "products": _mp_products_default(),
        "webhook_url": None,
        "api_public_base_url": public_api_base_url() or None,
        "webhook_signature_configured": False,
        "webhook_signature_enforced": False,
        "last_validated_at": None,
        "last_validation_error": None,
        "cached_balance": None,
    }
    if row is None or not row.mercadopago_access_token_encrypted:
        return empty
    at_hint = "****"
    pk_hint = "****"
    plain_pk: str | None = None
    try:
        plain_at = decrypt_platform_secret(row.mercadopago_access_token_encrypted)
        at_hint = _mask_api_key_hint(plain_at)
    except Exception:
        pass
    try:
        if row.mercadopago_public_key_encrypted:
            plain_pk = decrypt_platform_secret(row.mercadopago_public_key_encrypted)
            pk_hint = _mask_api_key_hint(plain_pk)
    except Exception:
        plain_pk = None
    wh_url = None
    base_pub = public_api_base_url()
    if row.mercadopago_webhook_path_token and base_pub:
        wh_url = f"{base_pub}/api/v1/webhooks/mercadopago/{row.mercadopago_webhook_path_token}"
    bal = float(row.mercadopago_cached_balance) if row.mercadopago_cached_balance is not None else None
    sandbox = bool(row.mercadopago_sandbox)
    return {
        "connected": True,
        "sandbox": sandbox,
        "access_token_hint": at_hint,
        "public_key_hint": pk_hint,
        "public_key": plain_pk,
        "account_label": row.account_label,
        "mp_user_id": row.mercadopago_mp_user_id,
        "finance_bank_account_id": row.mercadopago_finance_bank_account_id,
        "products": _mp_products_parse(row.mercadopago_products_json),
        "webhook_url": wh_url,
        "api_public_base_url": base_pub or None,
        "webhook_signature_configured": bool(row.mercadopago_webhook_signature_secret_encrypted),
        "webhook_signature_enforced": mercadopago_webhook_signature_enforced(gateway_sandbox=sandbox),
        "last_validated_at": row.last_validated_at,
        "last_validation_error": row.last_validation_error,
        "cached_balance": bal,
    }


def _stone_row_to_public(row: TenantFinanceGateway | None) -> dict:
    empty: dict = {
        "connected": False,
        "sandbox": False,
        "secret_key_hint": None,
        "public_key_hint": None,
        "public_key": None,
        "account_label": None,
        "finance_bank_account_id": None,
        "webhook_url": None,
        "last_validated_at": None,
        "last_validation_error": None,
    }
    if row is None or not row.stone_secret_key_encrypted:
        return empty
    hint = "****"
    try:
        plain = decrypt_platform_secret(row.stone_secret_key_encrypted)
        hint = _mask_api_key_hint(plain)
    except Exception:
        pass
    pk_hint = None
    plain_pk: str | None = None
    try:
        if row.stone_public_key_encrypted:
            plain_pk = decrypt_platform_secret(row.stone_public_key_encrypted)
            pk_hint = _mask_api_key_hint(plain_pk)
    except Exception:
        plain_pk = None
    wh_url = None
    base_pub = public_api_base_url()
    if row.stone_webhook_path_token and base_pub:
        wh_url = f"{base_pub}/api/v1/webhooks/stone/{row.stone_webhook_path_token}"
    return {
        "connected": True,
        "sandbox": bool(row.stone_sandbox),
        "secret_key_hint": hint,
        "public_key_hint": pk_hint,
        "public_key": plain_pk,
        "account_label": row.account_label,
        "finance_bank_account_id": row.stone_finance_bank_account_id,
        "webhook_url": wh_url,
        "last_validated_at": row.last_validated_at,
        "last_validation_error": row.last_validation_error,
    }


def _assert_finance_entry_eligible_for_stone_charge(entry: FinanceEntry) -> None:
    if entry.entry_type != FinanceEntryType.INCOME:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Somente receitas podem gerar cobrança.")
    if entry.status == FinanceEntryStatus.PAID:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lançamento já está pago.")
    if entry.gateway_payment_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Lançamento já vinculado a uma cobrança de gateway.")
    if entry.gateway_preference_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este lançamento possui checkout Mercado Pago pendente. Remova a preferência ou use outro lançamento para cobrar via Stone / Pagar.me.",
        )


def _stone_gateway_for_tenant_or_400(db: Session, tenant_id: int) -> TenantFinanceGateway:
    gw = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.STONE,
        )
    ).scalar_one_or_none()
    if gw is None or not gw.stone_secret_key_encrypted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stone / Pagar.me não conectado neste workspace. Configure em Contas e carteiras.",
        )
    return gw


def _finance_gateways_public_dict(db: Session, tenant_id: int) -> dict:
    rows = db.execute(select(TenantFinanceGateway).where(TenantFinanceGateway.tenant_id == tenant_id)).scalars().all()
    by_provider = {r.provider: r for r in rows}
    return {
        "asaas": _asaas_row_to_public(by_provider.get(FinanceGatewayProvider.ASAAS)),
        "mercadopago": _mercadopago_row_to_public(by_provider.get(FinanceGatewayProvider.MERCADOPAGO)),
        "stone": _stone_row_to_public(by_provider.get(FinanceGatewayProvider.STONE)),
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


def _entry_to_out(entry: FinanceEntry, *, linked_payer: dict[str, str | None] | None = None) -> dict:
    amount = float(entry.amount)
    fee_amount = float(entry.fee_amount or 0)
    net_amount = amount - fee_amount if entry.entry_type == FinanceEntryType.INCOME else amount + fee_amount
    d: dict[str, Any] = {
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
        "gateway_preference_id": entry.gateway_preference_id,
        "mercadopago_archived_preference_id": entry.mercadopago_archived_preference_id,
        "mercadopago_preapproval_id": entry.mercadopago_preapproval_id,
        "mp_reversal_at": entry.mp_reversal_at,
        "mp_reversal_status": entry.mp_reversal_status,
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
    if linked_payer:
        d["linked_payer_email"] = linked_payer.get("email")
        d["linked_payer_name"] = linked_payer.get("name")
        d["linked_payer_document"] = linked_payer.get("document")
    else:
        d["linked_payer_email"] = None
        d["linked_payer_name"] = None
        d["linked_payer_document"] = None
    return d


def _entry_to_out_with_client_hints(db: Session, tenant_id: int, entry: FinanceEntry) -> dict:
    hint = linked_payer_for_entry(db, tenant_id, entry)
    return _entry_to_out(entry, linked_payer=hint)


def _entry_rows_to_out_with_client_hints(db: Session, tenant_id: int, rows: list[FinanceEntry]) -> list[dict]:
    so_ids = {int(r.service_order_id) for r in rows if r.service_order_id is not None}
    hints_by_so = batch_linked_payers_by_service_order_ids(db, tenant_id=tenant_id, service_order_ids=so_ids)
    out: list[dict] = []
    for r in rows:
        h = hints_by_so.get(int(r.service_order_id)) if r.service_order_id is not None else None
        out.append(_entry_to_out(r, linked_payer=h))
    return out


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
    return JSONResponse(content=jsonable_encoder(_entry_rows_to_out_with_client_hints(db, current_user.tenant_id, list(rows))))


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
        return JSONResponse(content=jsonable_encoder(_entry_to_out_with_client_hints(db, current_user.tenant_id, created[0])))
    return JSONResponse(
        content=jsonable_encoder(
            {
                "status": "ok",
                "installment_group_id": group_id,
                "created_count": installments,
                "entries": _entry_rows_to_out_with_client_hints(db, current_user.tenant_id, list(created)),
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
    if scope != "single" and "gateway_preference_id" in payload.model_fields_set:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="gateway_preference_id só pode ser alterado em uma parcela.")

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
        if "gateway_preference_id" in payload.model_fields_set:
            raw_pref = payload.gateway_preference_id
            if raw_pref is None or (isinstance(raw_pref, str) and not raw_pref.strip()):
                old_pref = (row.gateway_preference_id or "").strip()
                if old_pref and (row.payment_provider or "").strip().lower() == "mercadopago":
                    if not (row.mercadopago_archived_preference_id or "").strip():
                        row.mercadopago_archived_preference_id = old_pref[:48]
                row.gateway_preference_id = None
            else:
                row.gateway_preference_id = str(raw_pref).strip()[:48] or None
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
        return JSONResponse(content=jsonable_encoder(_entry_to_out_with_client_hints(db, current_user.tenant_id, targets[0])))
    return JSONResponse(
        content=jsonable_encoder(
            {"status": "ok", "edit_scope": scope, "updated_count": len(targets), "entries": _entry_rows_to_out_with_client_hints(db, current_user.tenant_id, targets)}
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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Lançamento já vinculado a uma cobrança de gateway.")
    if entry.gateway_preference_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este lançamento possui checkout/link Mercado Pago pendente. Limpe a preferência no lançamento ou conclua o pagamento antes de emitir cobrança Asaas.",
        )

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
        "entry": _entry_to_out_with_client_hints(db, current_user.tenant_id, entry),
        "payment_id": payment_id,
        "invoice_url": invoice_url,
        "external_reference": external_ref,
        "sandbox": bool(gw.asaas_sandbox),
    }


@router.post(
    "/finance/entries/{entry_id}/mercadopago-charge",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def create_mercadopago_pix_charge_for_entry(
    request: Request,
    entry_id: int,
    payload: FinanceEntryMercadoPagoChargeCreate,
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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Lançamento já vinculado a uma cobrança de gateway.")
    if entry.gateway_preference_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este lançamento possui checkout/link Mercado Pago pendente. Limpe a preferência no lançamento ou use outro lançamento para emitir PIX.",
        )

    gw = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == current_user.tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.MERCADOPAGO,
        )
    ).scalar_one_or_none()
    if gw is None or not gw.mercadopago_access_token_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mercado Pago não conectado neste workspace.")
    products = _mp_products_parse(gw.mercadopago_products_json)
    if not products.get("pix"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ative “Recebimento via Pix” na configuração da conta Mercado Pago.",
        )

    api_token = decrypt_platform_secret(gw.mercadopago_access_token_encrypted)
    external_ref = f"{MERCADOPAGO_FINANCE_EXTERNAL_REF_PREFIX}{entry.id}"
    notif_url = None
    base_pub = public_api_base_url()
    if gw.mercadopago_webhook_path_token and base_pub:
        notif_url = f"{base_pub}/api/v1/webhooks/mercadopago/{gw.mercadopago_webhook_path_token}"

    ok, err, pay_data = create_mercadopago_pix_payment(
        access_token=api_token,
        transaction_amount=float(entry.amount),
        description=entry.description,
        external_reference=external_ref,
        payer_email=str(payload.payer_email),
        payer_first_name=payload.payer_first_name,
        payer_last_name=payload.payer_last_name,
        notification_url=notif_url,
        metadata_entry_id=entry.id,
    )
    if not ok or pay_data is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Falha ao criar cobrança PIX no Mercado Pago.")

    payment_id, ticket_url, qr_code = mercadopago_payment_pix_urls(pay_data)
    if not payment_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pagamento criado sem id no Mercado Pago.")

    entry.gateway_payment_id = payment_id[:48]
    entry.payment_method = "pix"
    entry.payment_provider = "mercadopago"
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "status": "ok",
        "entry": _entry_to_out_with_client_hints(db, current_user.tenant_id, entry),
        "payment_id": payment_id,
        "payment_status": str(pay_data.get("status") or ""),
        "ticket_url": ticket_url,
        "pix_copy_paste": qr_code,
        "external_reference": external_ref,
        "sandbox": bool(gw.mercadopago_sandbox),
    }


@router.post(
    "/finance/entries/{entry_id}/mercadopago-boleto-charge",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def create_mercadopago_boleto_charge_for_entry(
    request: Request,
    entry_id: int,
    payload: FinanceEntryMercadoPagoBoletoChargeCreate,
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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Lançamento já vinculado a uma cobrança de gateway.")
    if entry.gateway_preference_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este lançamento possui checkout/link Mercado Pago pendente. Limpe a preferência no lançamento ou use outro lançamento para emitir boleto.",
        )

    gw = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == current_user.tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.MERCADOPAGO,
        )
    ).scalar_one_or_none()
    if gw is None or not gw.mercadopago_access_token_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mercado Pago não conectado neste workspace.")
    products = _mp_products_parse(gw.mercadopago_products_json)
    if not products.get("boleto"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Ative "Boleto" na configuração da conta Mercado Pago.',
        )

    cpf_digits = "".join(c for c in str(payload.payer_cpf or "") if c.isdigit())
    if len(cpf_digits) != 11:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CPF do pagador inválido (use 11 dígitos).")

    today = date.today()
    due = entry.due_date
    exp_date = due if due >= today else today + timedelta(days=3)
    date_of_expiration = f"{exp_date.isoformat()}T23:59:59.000-03:00"

    api_token = decrypt_platform_secret(gw.mercadopago_access_token_encrypted)
    external_ref = f"{MERCADOPAGO_FINANCE_EXTERNAL_REF_PREFIX}{entry.id}"
    notif_url = None
    base_pub = public_api_base_url()
    if gw.mercadopago_webhook_path_token and base_pub:
        notif_url = f"{base_pub}/api/v1/webhooks/mercadopago/{gw.mercadopago_webhook_path_token}"

    ok, err, pay_data = create_mercadopago_boleto_payment(
        access_token=api_token,
        transaction_amount=float(entry.amount),
        description=entry.description,
        external_reference=external_ref,
        payer_email=str(payload.payer_email),
        payer_first_name=payload.payer_first_name,
        payer_last_name=payload.payer_last_name,
        payer_cpf_digits=cpf_digits,
        date_of_expiration=date_of_expiration,
        notification_url=notif_url,
        metadata_entry_id=entry.id,
    )
    if not ok or pay_data is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Falha ao criar boleto no Mercado Pago.")

    payment_id, ticket_url = mercadopago_payment_boleto_urls(pay_data)
    if not payment_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pagamento criado sem id no Mercado Pago.")

    entry.gateway_payment_id = payment_id[:48]
    entry.payment_method = "boleto"
    entry.payment_provider = "mercadopago"
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "status": "ok",
        "entry": _entry_to_out_with_client_hints(db, current_user.tenant_id, entry),
        "payment_id": payment_id,
        "payment_status": str(pay_data.get("status") or ""),
        "ticket_url": ticket_url,
        "external_reference": external_ref,
        "sandbox": bool(gw.mercadopago_sandbox),
    }


@router.post(
    "/finance/entries/{entry_id}/stone-charge",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def create_stone_pix_charge_for_entry(
    request: Request,
    entry_id: int,
    payload: FinanceEntryStoneChargeCreate,
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
    _assert_finance_entry_eligible_for_stone_charge(entry)
    gw = _stone_gateway_for_tenant_or_400(db, current_user.tenant_id)

    api_key = decrypt_platform_secret(gw.stone_secret_key_encrypted)
    order_code = f"{STONE_FINANCE_EXTERNAL_REF_PREFIX}{entry.id}"
    meta = {
        "climaris_finance_entry_id": str(entry.id),
        "climaris_tenant_id": str(current_user.tenant_id),
    }
    linked = linked_payer_for_entry(db, current_user.tenant_id, entry)
    email, cust_name, doc_merged = merge_stone_payer_contact(
        linked=linked,
        customer_email=str(payload.customer_email) if payload.customer_email else None,
        customer_name=payload.customer_name,
        payer_document=payload.payer_document,
    )
    ok, err, order = create_pagarme_pix_order(
        secret_key=api_key,
        amount_reais=float(entry.amount),
        description=entry.description,
        order_code=order_code,
        metadata=meta,
        customer_name=cust_name,
        customer_email=email,
        payer_document=doc_merged if doc_merged else None,
    )
    if not ok or order is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Falha ao criar cobrança PIX no Pagar.me.")

    order_id = extract_order_id(order)
    _charge_id, qr_copy, qr_url = extract_pix_from_order(order)
    if not order_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pedido criado sem id no Pagar.me.")

    entry.gateway_payment_id = order_id[:48]
    entry.payment_method = "pix"
    entry.payment_provider = "stone"
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "status": "ok",
        "entry": _entry_to_out_with_client_hints(db, current_user.tenant_id, entry),
        "order_id": order_id,
        "pix_copy_paste": qr_copy,
        "qr_code_url": qr_url,
        "order_code": order_code,
        "sandbox": bool(gw.stone_sandbox),
    }


@router.post(
    "/finance/entries/{entry_id}/stone-boleto-charge",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def create_stone_boleto_charge_for_entry(
    request: Request,
    entry_id: int,
    payload: FinanceEntryStoneBoletoChargeCreate,
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
    _assert_finance_entry_eligible_for_stone_charge(entry)
    gw = _stone_gateway_for_tenant_or_400(db, current_user.tenant_id)

    linked = linked_payer_for_entry(db, current_user.tenant_id, entry)
    email, nm, doc_merged = merge_stone_payer_contact(
        linked=linked,
        customer_email=str(payload.customer_email) if payload.customer_email else None,
        customer_name=payload.customer_name,
        payer_document=payload.payer_document,
    )
    ok_doc, doc_err, customer = customer_block_with_br_document(
        customer_name=nm,
        customer_email=email,
        payer_document=doc_merged,
    )
    if not ok_doc or customer is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=doc_err
            or "Informe CPF/CNPJ do pagador ou cadastre documento válido no cliente da ordem de serviço vinculada.",
        )

    api_key = decrypt_platform_secret(gw.stone_secret_key_encrypted)
    order_code = f"{STONE_FINANCE_EXTERNAL_REF_PREFIX}{entry.id}"
    meta = {
        "climaris_finance_entry_id": str(entry.id),
        "climaris_tenant_id": str(current_user.tenant_id),
    }
    due_at = boleto_due_at_iso_from_entry_due(entry_due=entry.due_date)
    ok, err, order = create_pagarme_boleto_order(
        secret_key=api_key,
        amount_reais=float(entry.amount),
        description=entry.description,
        order_code=order_code,
        metadata=meta,
        customer=customer,
        due_at_iso=due_at,
        instructions=payload.instructions,
    )
    if not ok or order is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Falha ao criar boleto no Pagar.me.")

    order_id = extract_order_id(order)
    _cid, pdf_url, line, barcode = extract_boleto_from_order(order)
    if not order_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pedido criado sem id no Pagar.me.")

    entry.gateway_payment_id = order_id[:48]
    entry.payment_method = "boleto"
    entry.payment_provider = "stone"
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "status": "ok",
        "entry": _entry_to_out_with_client_hints(db, current_user.tenant_id, entry),
        "order_id": order_id,
        "ticket_url": pdf_url,
        "digitable_line": line,
        "barcode": barcode,
        "order_code": order_code,
        "sandbox": bool(gw.stone_sandbox),
    }


@router.get(
    "/finance/entries/{entry_id}/stone-boleto-artifacts",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("120/minute")
def get_stone_boleto_artifacts_for_entry(
    request: Request,
    entry_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Consulta o Pagar.me e devolve PDF/linha digitável do boleto já vinculado ao lançamento."""
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
    oid = (entry.gateway_payment_id or "").strip()
    if not oid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não há boleto Stone vinculado. Use «Emitir boleto (Stone)» na lista de movimentações.",
        )
    if (entry.payment_provider or "").strip().lower() != "stone":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este lançamento não está registrado como cobrança Stone / Pagar.me.",
        )
    if (entry.payment_method or "").strip().lower() != "boleto":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O meio do lançamento não é boleto.",
        )
    gw = _stone_gateway_for_tenant_or_400(db, current_user.tenant_id)
    api_key = decrypt_platform_secret(gw.stone_secret_key_encrypted)
    ok, err, order = fetch_pagarme_order(secret_key=api_key, order_id=oid)
    if not ok or order is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Não foi possível consultar o pedido no Pagar.me.")
    order_id = extract_order_id(order) or oid
    _cid, pdf_url, line, barcode = extract_boleto_from_order(order)
    return {
        "order_id": order_id,
        "ticket_url": pdf_url,
        "digitable_line": line,
        "barcode": barcode,
        "sandbox": bool(gw.stone_sandbox),
    }


@router.post(
    "/finance/entries/{entry_id}/stone-card-charge",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def create_stone_credit_card_charge_for_entry(
    request: Request,
    entry_id: int,
    payload: FinanceEntryStoneCardChargeCreate,
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
    _assert_finance_entry_eligible_for_stone_charge(entry)
    gw = _stone_gateway_for_tenant_or_400(db, current_user.tenant_id)

    linked = linked_payer_for_entry(db, current_user.tenant_id, entry)
    email, nm, doc_merged = merge_stone_payer_contact(
        linked=linked,
        customer_email=str(payload.customer_email) if payload.customer_email else None,
        customer_name=payload.customer_name,
        payer_document=payload.payer_document,
    )
    ok_doc, doc_err, customer = customer_block_with_br_document(
        customer_name=nm,
        customer_email=email,
        payer_document=doc_merged,
    )
    if not ok_doc or customer is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=doc_err
            or "Informe CPF/CNPJ do pagador ou cadastre documento válido no cliente da ordem de serviço vinculada.",
        )

    api_key = decrypt_platform_secret(gw.stone_secret_key_encrypted)
    order_code = f"{STONE_FINANCE_EXTERNAL_REF_PREFIX}{entry.id}"
    meta = {
        "climaris_finance_entry_id": str(entry.id),
        "climaris_tenant_id": str(current_user.tenant_id),
    }
    ok, err, order = create_pagarme_credit_card_order(
        secret_key=api_key,
        amount_reais=float(entry.amount),
        description=entry.description,
        order_code=order_code,
        metadata=meta,
        customer=customer,
        card_token=payload.card_token.strip(),
        installments=payload.installments,
    )
    if not ok or order is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Falha ao criar cobrança no Pagar.me.")

    declined = credit_card_charge_declined_message(order)
    if declined:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=declined)

    order_id = extract_order_id(order)
    if not order_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pedido criado sem id no Pagar.me.")

    entry.gateway_payment_id = order_id[:48]
    entry.payment_method = "credit_card"
    entry.payment_provider = "stone"
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "status": "ok",
        "entry": _entry_to_out_with_client_hints(db, current_user.tenant_id, entry),
        "order_id": order_id,
        "order_code": order_code,
        "sandbox": bool(gw.stone_sandbox),
    }


@router.post(
    "/finance/entries/{entry_id}/mercadopago-preference",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def create_mercadopago_checkout_preference_for_entry(
    request: Request,
    entry_id: int,
    payload: FinanceEntryMercadoPagoPreferenceCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    entry = db.execute(
        select(FinanceEntry)
        .options(selectinload(FinanceEntry.category))
        .where(
            FinanceEntry.id == entry_id,
            FinanceEntry.tenant_id == current_user.tenant_id,
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento não encontrado.")
    if entry.entry_type != FinanceEntryType.INCOME:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Somente receitas podem gerar checkout.")
    if entry.status == FinanceEntryStatus.PAID:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lançamento já está pago.")
    if entry.gateway_payment_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este lançamento já está vinculado a uma cobrança de gateway. Use outro lançamento ou aguarde a baixa para gerar checkout.",
        )

    gw = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == current_user.tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.MERCADOPAGO,
        )
    ).scalar_one_or_none()
    if gw is None or not gw.mercadopago_access_token_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mercado Pago não conectado neste workspace.")
    products = _mp_products_parse(gw.mercadopago_products_json)
    if payload.mode == "checkout_pro" and not products.get("checkout_pro"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Ative "Checkout Pro / Transparente" na configuração da conta Mercado Pago.',
        )
    if payload.mode == "payment_link" and not products.get("payment_link"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Ative "Link de Pagamento" na configuração da conta Mercado Pago.',
        )
    if payload.mode == "subscription" and not products.get("subscriptions"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Ative "Assinaturas (recorrência)" na configuração da conta Mercado Pago.',
        )
    if payload.mode == "subscription":
        if not payload.payer_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assinatura: informe o e-mail do pagador (obrigatório no checkout).",
            )

    api_token = decrypt_platform_secret(gw.mercadopago_access_token_encrypted)
    external_ref = f"{MERCADOPAGO_FINANCE_EXTERNAL_REF_PREFIX}{entry.id}"
    notif_url = None
    base_pub = public_api_base_url()
    if gw.mercadopago_webhook_path_token and base_pub:
        notif_url = f"{base_pub}/api/v1/webhooks/mercadopago/{gw.mercadopago_webhook_path_token}"

    meta = {
        "climaris_finance_entry_id": str(entry.id),
        "climaris_checkout_mode": payload.mode,
    }
    auto_rec: dict[str, Any] | None = None
    if payload.mode == "subscription":
        start_dt = datetime.now(timezone.utc)
        start_str = start_dt.strftime("%Y-%m-%dT%H:%M:%S.000+00:00")
        auto_rec = {
            "frequency": int(payload.subscription_frequency),
            "frequency_type": payload.subscription_frequency_type,
            "transaction_amount": round(float(entry.amount), 2),
            "currency_id": "BRL",
            "start_date": start_str,
        }
    ok, err, pref = create_mercadopago_checkout_preference(
        access_token=api_token,
        title=entry.description,
        unit_price=float(entry.amount),
        external_reference=external_ref,
        notification_url=notif_url,
        payer_email=str(payload.payer_email) if payload.payer_email else None,
        success_url=payload.success_url,
        failure_url=payload.failure_url,
        pending_url=payload.pending_url,
        metadata=meta,
        auto_recurring=auto_rec,
    )
    if not ok or pref is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Falha ao criar preferência no Mercado Pago.")

    urls = mercadopago_preference_checkout_urls(pref)
    pref_id = urls.get("preference_id")
    init_point = urls.get("init_point")
    sandbox_point = urls.get("sandbox_init_point")
    if not pref_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Preferência criada sem id no Mercado Pago.")
    checkout_url = sandbox_point if bool(gw.mercadopago_sandbox) and sandbox_point else init_point
    if not checkout_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mercado Pago não retornou URL de checkout (init_point).",
        )

    pref_trim = str(pref_id).strip()
    if len(pref_trim) > 48:
        pref_trim = pref_trim[:48]
    entry.gateway_preference_id = pref_trim or None
    entry.payment_provider = "mercadopago"
    db.add(entry)
    db.commit()
    db.refresh(entry)

    return {
        "status": "ok",
        "mode": payload.mode,
        "preference_id": pref_id,
        "init_point": init_point,
        "sandbox_init_point": sandbox_point,
        "checkout_url": checkout_url,
        "external_reference": external_ref,
        "sandbox": bool(gw.mercadopago_sandbox),
        "entry": _entry_to_out_with_client_hints(db, current_user.tenant_id, entry),
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


_BANK_CATALOG_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{12,80}$")


def _finance_bank_catalog_logo_url(row: FinanceBankCatalog) -> str | None:
    ext = (row.logo_external_url or "").strip()
    if ext:
        return ext
    if row.logo_file_token:
        return f"/api/v1/finance/bank-catalog-assets/{row.logo_file_token}"
    return None


@router.get("/finance/bank-catalog-assets/{token}")
def get_finance_bank_catalog_asset(
    token: str,
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    if not _BANK_CATALOG_TOKEN_RE.match(token):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Não encontrado.")
    row = db.execute(
        select(FinanceBankCatalog).where(FinanceBankCatalog.logo_file_token == token)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Não encontrado.")
    path = logo_file_path(token)
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Não encontrado.")
    return FileResponse(path, media_type=row.logo_mime or "image/webp")


@router.get(
    "/finance/bank-catalog",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
    response_model=list[FinanceBankCatalogPublicOut],
)
def list_finance_bank_catalog_for_tenant(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[FinanceBankCatalogPublicOut]:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    rows = (
        db.execute(
            select(FinanceBankCatalog)
            .where(FinanceBankCatalog.is_active.is_(True))
            .order_by(FinanceBankCatalog.sort_order.asc(), FinanceBankCatalog.id.asc())
        )
        .scalars()
        .all()
    )
    return [
        FinanceBankCatalogPublicOut(
            id=r.id,
            slug=r.slug,
            bank_name=r.bank_name,
            display_label=r.display_label,
            sort_order=r.sort_order,
            logo_url=_finance_bank_catalog_logo_url(r),
        )
        for r in rows
    ]


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
    mp_gw = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == current_user.tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.MERCADOPAGO,
            TenantFinanceGateway.mercadopago_finance_bank_account_id == account_id,
        )
    ).scalar_one_or_none()
    if mp_gw is not None:
        db.delete(mp_gw)
    stone_gw = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == current_user.tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.STONE,
            TenantFinanceGateway.stone_finance_bank_account_id == account_id,
        )
    ).scalar_one_or_none()
    if stone_gw is not None:
        db.delete(stone_gw)
    db.delete(row)
    db.commit()
    return None


_MAX_OFX_LINES = 500
_MAX_OFX_SUGGESTIONS_LINES = 150


def _ofx_line_suggestions_payload(
    db: Session,
    *,
    tenant_id: int,
    bank_account: FinanceBankAccount,
    line: FinanceOfxStatementLine,
    compute_suggestions: bool,
) -> dict[str, Any]:
    if not compute_suggestions:
        return {"suggestions": []}
    dec = Decimal(str(line.amount))
    hits = suggest_finance_entries_for_ofx_line(
        db,
        tenant_id=tenant_id,
        bank_account=bank_account,
        amount=dec,
        posted_at=line.posted_at,
    )
    return {
        "suggestions": [
            {
                "id": e.id,
                "description": e.description,
                "amount": float(e.amount),
                "due_date": e.due_date.isoformat(),
                "entry_type": e.entry_type.value if hasattr(e.entry_type, "value") else str(e.entry_type),
                "status": e.status.value if hasattr(e.status, "value") else str(e.status),
            }
            for e in hits
        ]
    }


@router.post(
    "/finance/accounts/{account_id}/ofx-imports",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("20/minute")
async def upload_finance_ofx_import(
    request: Request,
    account_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    acc = _get_finance_bank_account_or_404(db, current_user.tenant_id, account_id)
    raw_name = (file.filename or "extrato.ofx").strip() or "extrato.ofx"
    if not raw_name.lower().endswith(".ofx"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Envie um arquivo .ofx.")
    body = await file.read()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo vazio.")
    txs, err = parse_ofx_statement_transactions(body)
    if err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)
    total_parsed = len(txs)
    if len(txs) > _MAX_OFX_LINES:
        txs = txs[:_MAX_OFX_LINES]
    imp = FinanceOfxImport(
        tenant_id=current_user.tenant_id,
        finance_bank_account_id=acc.id,
        filename=raw_name[:250],
    )
    db.add(imp)
    db.flush()
    lines_out: list[dict[str, Any]] = []
    for idx, tx in enumerate(txs):
        row = FinanceOfxStatementLine(
            import_id=imp.id,
            fit_id=tx.fit_id,
            amount=float(tx.amount),
            posted_at=tx.posted_at,
            trn_type=tx.trn_type,
            payee=tx.payee,
            memo=tx.memo,
        )
        db.add(row)
        db.flush()
        compute = idx < _MAX_OFX_SUGGESTIONS_LINES
        lines_out.append(
            {
                "id": row.id,
                "fit_id": row.fit_id,
                "amount": float(row.amount),
                "posted_at": row.posted_at.isoformat(),
                "trn_type": row.trn_type,
                "payee": row.payee,
                "memo": row.memo,
                "matched_finance_entry_id": None,
                **_ofx_line_suggestions_payload(
                    db,
                    tenant_id=current_user.tenant_id,
                    bank_account=acc,
                    line=row,
                    compute_suggestions=compute,
                ),
            }
        )
    db.commit()
    db.refresh(imp)
    return {
        "import_id": imp.id,
        "filename": imp.filename,
        "finance_bank_account_id": acc.id,
        "lines_count": len(lines_out),
        "truncated": total_parsed > _MAX_OFX_LINES,
        "lines": lines_out,
    }


@router.get(
    "/finance/accounts/{account_id}/ofx-imports/{import_id}",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def get_finance_ofx_import(
    account_id: int,
    import_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    acc = _get_finance_bank_account_or_404(db, current_user.tenant_id, account_id)
    imp = db.execute(
        select(FinanceOfxImport).where(
            FinanceOfxImport.id == import_id,
            FinanceOfxImport.tenant_id == current_user.tenant_id,
            FinanceOfxImport.finance_bank_account_id == acc.id,
        )
    ).scalar_one_or_none()
    if imp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Importação OFX não encontrada.")
    lines = db.execute(
        select(FinanceOfxStatementLine)
        .where(FinanceOfxStatementLine.import_id == imp.id)
        .order_by(FinanceOfxStatementLine.posted_at.asc(), FinanceOfxStatementLine.id.asc())
    ).scalars().all()
    out_lines = []
    for idx, line in enumerate(lines):
        compute = idx < _MAX_OFX_SUGGESTIONS_LINES and line.matched_finance_entry_id is None
        out_lines.append(
            {
                "id": line.id,
                "fit_id": line.fit_id,
                "amount": float(line.amount),
                "posted_at": line.posted_at.isoformat(),
                "trn_type": line.trn_type,
                "payee": line.payee,
                "memo": line.memo,
                "matched_finance_entry_id": line.matched_finance_entry_id,
                **_ofx_line_suggestions_payload(
                    db,
                    tenant_id=current_user.tenant_id,
                    bank_account=acc,
                    line=line,
                    compute_suggestions=compute,
                ),
            }
        )
    return {
        "import_id": imp.id,
        "filename": imp.filename,
        "created_at": imp.created_at,
        "lines": out_lines,
    }


@router.post(
    "/finance/accounts/{account_id}/ofx-imports/{import_id}/apply-matches",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("60/minute")
def apply_finance_ofx_matches(
    request: Request,
    account_id: int,
    import_id: int,
    payload: FinanceOfxApplyMatches,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    acc = _get_finance_bank_account_or_404(db, current_user.tenant_id, account_id)
    imp = db.execute(
        select(FinanceOfxImport).where(
            FinanceOfxImport.id == import_id,
            FinanceOfxImport.tenant_id == current_user.tenant_id,
            FinanceOfxImport.finance_bank_account_id == acc.id,
        )
    ).scalar_one_or_none()
    if imp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Importação OFX não encontrada.")

    applied: list[dict[str, Any]] = []
    for m in payload.matches:
        line = db.execute(
            select(FinanceOfxStatementLine).where(
                FinanceOfxStatementLine.id == m.line_id,
                FinanceOfxStatementLine.import_id == imp.id,
            )
        ).scalar_one_or_none()
        if line is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Linha OFX {m.line_id} inválida.")
        if line.matched_finance_entry_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Linha OFX {m.line_id} já conciliada.",
            )
        entry = db.execute(
            select(FinanceEntry)
            .options(selectinload(FinanceEntry.category))
            .where(
                FinanceEntry.id == m.finance_entry_id,
                FinanceEntry.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if entry is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lançamento {m.finance_entry_id} não encontrado.")
        if entry.status not in (FinanceEntryStatus.PENDING, FinanceEntryStatus.OVERDUE):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Lançamento {entry.id} não está pendente/vencido.",
            )
        if not finance_entry_matches_bank_account_for_ofx(entry, acc):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Lançamento {entry.id} não pertence a esta conta para conciliação OFX.",
            )
        amt = Decimal(str(line.amount))
        if not amount_matches_ofx_line(entry, amt):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Valor do lançamento {entry.id} não confere com a linha OFX.",
            )
        paid_at = datetime.combine(line.posted_at, time(12, 0), tzinfo=timezone.utc)
        entry.status = FinanceEntryStatus.PAID
        entry.paid_at = paid_at
        if entry.finance_account_id is None:
            entry.finance_account_id = acc.id
        note_extra = f"Conciliado OFX import {imp.id} FITID {line.fit_id}."
        if entry.notes and entry.notes.strip():
            entry.notes = f"{entry.notes.strip()}\n{note_extra}"
        else:
            entry.notes = note_extra
        line.matched_finance_entry_id = entry.id
        line.matched_at = datetime.now(timezone.utc)
        db.add(entry)
        db.add(line)
        applied.append({"line_id": line.id, "finance_entry_id": entry.id})
    db.commit()
    for item in applied:
        ent = db.execute(select(FinanceEntry).where(FinanceEntry.id == item["finance_entry_id"])).scalar_one()
        db.refresh(ent)
        _safe_send_whatsapp_for_finance_status(db, current_user, ent)
    return {"status": "ok", "applied": applied}


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
    return {"effective_mode": effective, **_finance_gateways_public_dict(db, current_user.tenant_id)}


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
    return {"status": "ok", **_finance_gateways_public_dict(db, current_user.tenant_id)}


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


def _get_finance_bank_account_or_404(db: Session, tenant_id: int, account_id: int) -> FinanceBankAccount:
    acc = db.execute(
        select(FinanceBankAccount).where(
            FinanceBankAccount.id == account_id,
            FinanceBankAccount.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if acc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta bancária não encontrada.")
    return acc


@router.post(
    "/finance/gateways/mercadopago/test",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("30/minute")
def test_finance_gateway_mercadopago(
    request: Request,
    payload: FinanceGatewayMercadoPagoTest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    ok, err, data = test_mercadopago_access_token(payload.access_token.strip())
    label = account_label_from_mp_user(data or {}) if ok else None
    mp_uid = mp_user_id_str(data or {}) if ok else None
    return {
        "ok": ok,
        "error": err,
        "account_label": label,
        "mp_user_id": mp_uid,
    }


@router.put(
    "/finance/gateways/mercadopago",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("30/minute")
def upsert_finance_gateway_mercadopago(
    request: Request,
    payload: FinanceGatewayMercadoPagoUpsert,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    _get_finance_bank_account_or_404(db, current_user.tenant_id, payload.finance_bank_account_id)
    ok, err, data = test_mercadopago_access_token(payload.access_token.strip())
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Access Token inválido.")
    label = account_label_from_mp_user(data or {})
    mp_uid = mp_user_id_str(data or {})

    row = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == current_user.tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.MERCADOPAGO,
        )
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if row is None:
        row = TenantFinanceGateway(
            tenant_id=current_user.tenant_id,
            provider=FinanceGatewayProvider.MERCADOPAGO,
        )
        db.add(row)
    ensure_mercadopago_webhook_secrets(row)
    row.mercadopago_access_token_encrypted = encrypt_platform_secret(payload.access_token.strip())
    row.mercadopago_public_key_encrypted = encrypt_platform_secret(payload.public_key.strip())
    row.mercadopago_sandbox = payload.sandbox
    row.mercadopago_finance_bank_account_id = payload.finance_bank_account_id
    row.mercadopago_mp_user_id = mp_uid
    row.last_validated_at = now
    row.last_validation_error = None
    row.account_label = label
    if payload.products is not None:
        row.mercadopago_products_json = _mp_products_dump(payload.products.model_dump())
    elif not row.mercadopago_products_json:
        row.mercadopago_products_json = _mp_products_dump(_mp_products_default())
    db.add(row)
    db.commit()
    db.refresh(row)
    try:
        sync_mercadopago_balance_snapshot(db, row)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
    return {"status": "ok", **_finance_gateways_public_dict(db, current_user.tenant_id)}


@router.patch(
    "/finance/gateways/mercadopago/products",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("60/minute")
def patch_finance_gateway_mercadopago_products(
    request: Request,
    payload: FinanceGatewayMercadoPagoProductsUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    row = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == current_user.tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.MERCADOPAGO,
        )
    ).scalar_one_or_none()
    if row is None or not row.mercadopago_access_token_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mercado Pago não está conectado.")
    row.mercadopago_products_json = _mp_products_dump(payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "ok", **_finance_gateways_public_dict(db, current_user.tenant_id)}


@router.patch(
    "/finance/gateways/mercadopago/webhook-signature",
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("30/minute")
def patch_finance_gateway_mercadopago_webhook_signature(
    request: Request,
    payload: FinanceGatewayMercadoPagoWebhookSignatureUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    row = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == current_user.tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.MERCADOPAGO,
        )
    ).scalar_one_or_none()
    if row is None or not row.mercadopago_access_token_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mercado Pago não está conectado.")
    if payload.clear_webhook_signature_secret and mercadopago_webhook_signature_enforced(
        gateway_sandbox=bool(row.mercadopago_sandbox)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é permitido remover o segredo de assinatura: este servidor exige webhook assinado para contas de produção.",
        )
    if not payload.clear_webhook_signature_secret and payload.webhook_signature_secret is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe webhook_signature_secret ou clear_webhook_signature_secret.",
        )
    if payload.clear_webhook_signature_secret:
        row.mercadopago_webhook_signature_secret_encrypted = None
    elif payload.webhook_signature_secret is not None:
        s = payload.webhook_signature_secret.strip()
        if not s:
            row.mercadopago_webhook_signature_secret_encrypted = None
        else:
            row.mercadopago_webhook_signature_secret_encrypted = encrypt_platform_secret(s)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "ok", **_finance_gateways_public_dict(db, current_user.tenant_id)}


@router.delete(
    "/finance/gateways/mercadopago",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
@limiter.limit("30/minute")
def delete_finance_gateway_mercadopago(
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
            TenantFinanceGateway.provider == FinanceGatewayProvider.MERCADOPAGO,
        )
    ).scalar_one_or_none()
    if row is not None:
        db.delete(row)
        db.commit()
    return None


@router.post(
    "/finance/gateways/stone/test",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("30/minute")
def test_finance_gateway_stone(
    request: Request,
    payload: FinanceGatewayStoneTest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    ok, err, data = test_pagarme_secret_key(payload.secret_key.strip())
    label = account_label_from_pagarme_orders_payload(data or {}) if ok else None
    if ok and not label:
        label = "Pagar.me (Stone)"
    return {"ok": ok, "error": err, "account_label": label}


@router.put(
    "/finance/gateways/stone",
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("30/minute")
def upsert_finance_gateway_stone(
    request: Request,
    payload: FinanceGatewayStoneUpsert,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    del request
    tenant = _get_tenant_or_404(db, current_user.tenant_id)
    _require_finance_enabled(db, tenant)
    _get_finance_bank_account_or_404(db, current_user.tenant_id, payload.finance_bank_account_id)
    row = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.tenant_id == current_user.tenant_id,
            TenantFinanceGateway.provider == FinanceGatewayProvider.STONE,
        )
    ).scalar_one_or_none()
    sk_in = (payload.secret_key or "").strip()
    label = "Pagar.me (Stone)"
    if sk_in:
        if len(sk_in) < 16:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chave secreta inválida.")
        ok, err, data = test_pagarme_secret_key(sk_in)
        if not ok:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Chave secreta inválida.")
        label = account_label_from_pagarme_orders_payload(data or {}) or "Pagar.me (Stone)"
    else:
        if row is None or not row.stone_secret_key_encrypted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe a chave secreta (sk_…) para conectar.")
        label = row.account_label or "Pagar.me (Stone)"

    now = datetime.now(timezone.utc)
    if row is None:
        row = TenantFinanceGateway(
            tenant_id=current_user.tenant_id,
            provider=FinanceGatewayProvider.STONE,
        )
        db.add(row)
    ensure_stone_webhook_secrets(row)
    if sk_in:
        row.stone_secret_key_encrypted = encrypt_platform_secret(sk_in)
    row.stone_sandbox = payload.sandbox
    row.stone_finance_bank_account_id = payload.finance_bank_account_id
    pk_raw = (payload.public_key or "").strip()
    if pk_raw:
        if not (pk_raw.startswith("pk_test_") or pk_raw.startswith("pk_live_")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Chave pública inválida (use pk_test_… ou pk_live_…, mesma conta da sk_…).",
            )
        row.stone_public_key_encrypted = encrypt_platform_secret(pk_raw)
    else:
        row.stone_public_key_encrypted = None
    row.last_validated_at = now
    row.last_validation_error = None
    row.account_label = label
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "ok", **_finance_gateways_public_dict(db, current_user.tenant_id)}


@router.delete(
    "/finance/gateways/stone",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
@limiter.limit("30/minute")
def delete_finance_gateway_stone(
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
            TenantFinanceGateway.provider == FinanceGatewayProvider.STONE,
        )
    ).scalar_one_or_none()
    if row is not None:
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
