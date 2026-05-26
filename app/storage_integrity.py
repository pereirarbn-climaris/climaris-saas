"""Sanity check e reindexação de arquivos S3 (etiquetas QR e orçamentos)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.budget_pdf import build_budget_pdf
from app.config import public_app_base_url
from app.qrcode_storage import regenerate_qr_label_files, s3_object_exists, upload_qr_label_bytes
from app.services.qrcode_labels import _max_sequence, build_qrcode_public_url, format_code_id
from app.tenant_logo import _build_public_url, _resolve_s3_runtime_config, s3_bucket_for
from models import (
    Budget,
    BudgetProductItem,
    BudgetServiceItem,
    BudgetStatus,
    Client,
    Equipment,
    QrCode,
    QrCodeStatus,
    Tenant,
)

logger = logging.getLogger(__name__)

# Cache local de verificação S3 (limpo em POST /system/reindex).
_s3_existence_cache: dict[str, bool] = {}
_startup_alerts_by_tenant: dict[int, list[str]] = {}

_BUDGET_STATUS_ALIASES: dict[str, BudgetStatus] = {
    "draft": BudgetStatus.DRAFT,
    "rascunho": BudgetStatus.DRAFT,
    "sent": BudgetStatus.SENT,
    "enviado": BudgetStatus.SENT,
    "approved": BudgetStatus.APPROVED,
    "aprovado": BudgetStatus.APPROVED,
    "rejected": BudgetStatus.REJECTED,
    "reprovado": BudgetStatus.REJECTED,
    "rejected_client": BudgetStatus.REJECTED,
    "expired": BudgetStatus.EXPIRED,
    "expirado": BudgetStatus.EXPIRED,
    "visualizado": BudgetStatus.SENT,
    "viewed": BudgetStatus.SENT,
}


@dataclass
class StorageIntegrityReport:
    tenant_id: int | None
    qrcodes_checked: int = 0
    qrcodes_invalid: int = 0
    qrcodes_regenerated: int = 0
    qrcodes_links_cleared: int = 0
    qrcodes_synced_from_equipment: int = 0
    budgets_checked: int = 0
    budgets_status_repaired: int = 0
    budgets_tracking_repaired: int = 0
    budgets_pdf_missing: int = 0
    budgets_pdf_uploaded: int = 0
    alerts: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "qrcodes_checked": self.qrcodes_checked,
            "qrcodes_invalid": self.qrcodes_invalid,
            "qrcodes_regenerated": self.qrcodes_regenerated,
            "qrcodes_links_cleared": self.qrcodes_links_cleared,
            "qrcodes_synced_from_equipment": self.qrcodes_synced_from_equipment,
            "budgets_checked": self.budgets_checked,
            "budgets_status_repaired": self.budgets_status_repaired,
            "budgets_tracking_repaired": self.budgets_tracking_repaired,
            "budgets_pdf_missing": self.budgets_pdf_missing,
            "budgets_pdf_uploaded": self.budgets_pdf_uploaded,
            "alerts": self.alerts,
            "errors": self.errors,
        }


def clear_storage_caches() -> None:
    _s3_existence_cache.clear()
    _startup_alerts_by_tenant.clear()


def get_storage_alerts(tenant_id: int) -> list[str]:
    return list(_startup_alerts_by_tenant.get(tenant_id, []))


def _cache_key(bucket: str, key: str) -> str:
    return f"{bucket}:{key}"


def cached_s3_exists(s3_key: str | None, *, db: Session | None = None, purpose: str = "imagens") -> bool:
    if not s3_key or not str(s3_key).strip():
        return False
    cfg = _resolve_s3_runtime_config(db)
    bucket = s3_bucket_for(cfg, purpose)  # type: ignore[arg-type]
    if not bucket:
        return False
    ck = _cache_key(bucket, s3_key.strip())
    if ck in _s3_existence_cache:
        return _s3_existence_cache[ck]
    exists = s3_object_exists(s3_key, db=db, purpose=purpose)
    _s3_existence_cache[ck] = exists
    return exists


def normalize_budget_status(raw: object) -> BudgetStatus | None:
    if raw is None:
        return None
    if isinstance(raw, BudgetStatus):
        return raw
    if hasattr(raw, "value"):
        raw = raw.value
    key = str(raw).strip().lower()
    if not key:
        return None
    return _BUDGET_STATUS_ALIASES.get(key)


def repair_budget_statuses(db: Session, *, tenant_id: int | None = None) -> int:
    """Corrige status nulo ou corrompido; padrão Enviado (sent)."""
    query = select(Budget)
    if tenant_id is not None:
        query = query.where(Budget.tenant_id == tenant_id)
    repaired = 0
    for budget in db.execute(query).scalars().all():
        normalized = normalize_budget_status(budget.status)
        if normalized is None:
            budget.status = BudgetStatus.SENT
            repaired += 1
        elif normalized != budget.status:
            budget.status = normalized
            repaired += 1
    if repaired:
        db.commit()
    return repaired


def _resolve_budget_tracking_url(budget: Budget, db: Session) -> str:
    if budget.tracking_url and budget.tracking_url.strip():
        return budget.tracking_url.strip()
    if budget.pdf_s3_key:
        cfg = _resolve_s3_runtime_config(db)
        bucket = s3_bucket_for(cfg, "imagens")
        region = cfg.region or "us-east-1"
        public_base = cfg.public_base_url or ""
        if public_base:
            return f"{public_base.rstrip('/')}/{budget.pdf_s3_key}"
        return _build_public_url(bucket, region, cfg.endpoint_url, budget.pdf_s3_key)
    return f"{public_app_base_url()}/app/budgets/{budget.id}"


def upload_budget_pdf_to_s3(budget: Budget, tenant: Tenant, db: Session) -> str:
    from app.tenant_logo import generate_tenant_logo_presigned_url

    logo_url: str | None = getattr(tenant, "logo_url", None)
    logo_s3_key = getattr(tenant, "logo_s3_key", None)
    if logo_s3_key:
        try:
            logo_url = generate_tenant_logo_presigned_url(logo_s3_key, db=db, expires_seconds=600)
        except Exception:
            pass
    pdf_bytes = build_budget_pdf(budget, tenant, logo_url=logo_url)
    result = upload_qr_label_bytes(
        tenant_id=budget.tenant_id,
        qrcode_id=budget.id,
        file_bytes=pdf_bytes,
        extension="pdf",
        content_type="application/pdf",
        db=db,
    )
    return result.s3_key


def sync_qrcodes_from_equipments(db: Session, *, tenant_id: int | None = None) -> int:
    """Cria registros qrcodes para equipamentos com token que ainda não possuem etiqueta."""
    query = (
        select(Equipment, Client.tenant_id)
        .join(Client, Client.id == Equipment.client_id)
        .outerjoin(QrCode, QrCode.linked_to_equipment_id == Equipment.id)
        .where(QrCode.id.is_(None))
    )
    if tenant_id is not None:
        query = query.where(Client.tenant_id == tenant_id)
    created = 0
    for equipment, tid in db.execute(query).all():
        seq = _max_sequence(db, tid) + created + 1
        code_id = format_code_id(seq)
        row = QrCode(
            tenant_id=tid,
            code_id=code_id,
            linked_to_equipment_id=equipment.id,
            public_token=equipment.public_token,
            tracking_url=build_qrcode_public_url(code_id),
            status=QrCodeStatus.LINKED,
        )
        db.add(row)
        created += 1
    if created:
        db.flush()
    return created


def sanity_check_qrcode_row(row: QrCode, db: Session, *, regenerate: bool = False) -> bool:
    """Retorna True se válido após verificação (e opcional regeneração)."""
    pdf_ok = cached_s3_exists(row.pdf_s3_key, db=db)
    img_ok = cached_s3_exists(row.image_s3_key, db=db)
    if pdf_ok and img_ok:
        if row.linked_to_equipment_id is not None:
            row.status = QrCodeStatus.LINKED
        else:
            row.status = QrCodeStatus.AVAILABLE
        return True

    if row.linked_to_equipment_id is not None:
        row.status = QrCodeStatus.LINKED
    else:
        row.status = QrCodeStatus.AVAILABLE
    if regenerate and row.public_token:
        try:
            img_key, pdf_key, tracking = regenerate_qr_label_files(
                tenant_id=row.tenant_id,
                qrcode_id=row.id,
                public_token=row.public_token,
                db=db,
            )
            row.image_s3_key = img_key
            row.pdf_s3_key = pdf_key
            row.tracking_url = tracking
            row.status = QrCodeStatus.LINKED if row.linked_to_equipment_id else QrCodeStatus.AVAILABLE
            row.updated_at = datetime.now(timezone.utc)
            return True
        except Exception as exc:
            logger.warning("Falha ao regenerar etiqueta QR %s: %s", row.id, exc)
    return False


def repair_broken_qrcode_equipment_links(db: Session, *, tenant_id: int | None = None) -> int:
    query = select(QrCode).where(QrCode.linked_to_equipment_id.is_not(None))
    if tenant_id is not None:
        query = query.where(QrCode.tenant_id == tenant_id)
    cleared = 0
    for row in db.execute(query).scalars().all():
        equipment = db.get(Equipment, row.linked_to_equipment_id)
        if equipment is None:
            row.linked_to_equipment_id = None
            row.status = QrCodeStatus.AVAILABLE
            cleared += 1
    if cleared:
        db.commit()
    return cleared


def verify_budget_storage(budget: Budget, db: Session, *, reupload_missing: bool = False) -> str | None:
    """
    Verifica PDF no S3. Retorna mensagem de alerta ou None se OK.
    Atualiza budget.pdf_file_missing e tracking_url.
    """
    budget.tracking_url = _resolve_budget_tracking_url(budget, db)
    if not budget.pdf_s3_key:
        budget.pdf_file_missing = True
        if reupload_missing:
            tenant = db.get(Tenant, budget.tenant_id)
            if tenant:
                try:
                    budget.pdf_s3_key = upload_budget_pdf_to_s3(budget, tenant, db)
                    budget.pdf_file_missing = False
                    budget.tracking_url = _resolve_budget_tracking_url(budget, db)
                    return None
                except Exception as exc:
                    return f"Orçamento {budget.id} indisponível: falha ao gerar PDF ({exc})"
        return f"Orçamento {budget.id} indisponível: arquivo não encontrado"

    if cached_s3_exists(budget.pdf_s3_key, db=db):
        budget.pdf_file_missing = False
        return None

    budget.pdf_file_missing = True
    if reupload_missing:
        tenant = db.get(Tenant, budget.tenant_id)
        if tenant:
            try:
                budget.pdf_s3_key = upload_budget_pdf_to_s3(budget, tenant, db)
                budget.pdf_file_missing = False
                budget.tracking_url = _resolve_budget_tracking_url(budget, db)
                return None
            except Exception as exc:
                return f"Orçamento {budget.id} indisponível: falha ao reenviar PDF ({exc})"
    return f"Orçamento {budget.id} indisponível: arquivo não encontrado"


def run_storage_reindex(
    db: Session,
    *,
    tenant_id: int | None = None,
    regenerate_invalid_qr: bool = True,
    reupload_missing_budget_pdfs: bool = False,
) -> StorageIntegrityReport:
    clear_storage_caches()
    report = StorageIntegrityReport(tenant_id=tenant_id)

    try:
        report.budgets_status_repaired = repair_budget_statuses(db, tenant_id=tenant_id)
    except Exception as exc:
        report.errors.append(f"repair_budget_statuses: {exc}")

    try:
        report.qrcodes_links_cleared = repair_broken_qrcode_equipment_links(db, tenant_id=tenant_id)
    except Exception as exc:
        report.errors.append(f"repair_qrcode_links: {exc}")

    try:
        report.qrcodes_synced_from_equipment = sync_qrcodes_from_equipments(db, tenant_id=tenant_id)
        if report.qrcodes_synced_from_equipment:
            db.commit()
    except Exception as exc:
        report.errors.append(f"sync_qrcodes: {exc}")
        db.rollback()

    q_query = select(QrCode)
    if tenant_id is not None:
        q_query = q_query.where(QrCode.tenant_id == tenant_id)
    for row in db.execute(q_query).scalars().all():
        report.qrcodes_checked += 1
        if row.code_id and row.tracking_url != build_qrcode_public_url(row.code_id):
            row.tracking_url = build_qrcode_public_url(row.code_id)
        was_invalid = row.status == QrCodeStatus.AVAILABLE and not cached_s3_exists(row.pdf_s3_key, db=db)
        valid = sanity_check_qrcode_row(row, db, regenerate=regenerate_invalid_qr)
        if not valid:
            report.qrcodes_invalid += 1
        elif was_invalid and valid:
            report.qrcodes_regenerated += 1

    b_query = select(Budget).options(
        selectinload(Budget.client),
        selectinload(Budget.service_items).selectinload(BudgetServiceItem.service),
        selectinload(Budget.product_items).selectinload(BudgetProductItem.product),
    )
    if tenant_id is not None:
        b_query = b_query.where(Budget.tenant_id == tenant_id)
    for budget in db.execute(b_query).scalars().all():
        report.budgets_checked += 1
        old_tracking = budget.tracking_url
        alert = verify_budget_storage(budget, db, reupload_missing=reupload_missing_budget_pdfs)
        if budget.tracking_url != old_tracking and old_tracking:
            report.budgets_tracking_repaired += 1
        if alert:
            report.budgets_pdf_missing += 1
            report.alerts.append(alert)
        elif reupload_missing_budget_pdfs and budget.pdf_s3_key:
            report.budgets_pdf_uploaded += 1

    db.commit()

    if tenant_id is not None:
        _startup_alerts_by_tenant[tenant_id] = report.alerts[:50]
    else:
        by_tenant: dict[int, list[str]] = {}
        for msg in report.alerts:
            for tid in _startup_alerts_by_tenant:
                by_tenant.setdefault(tid, []).append(msg)
        _startup_alerts_by_tenant.update(by_tenant)

    return report


def run_startup_storage_validation(db: Session) -> None:
    """Na inicialização: verifica S3 e registra alertas (não remove linhas do painel)."""
    clear_storage_caches()
    try:
        for budget in db.execute(select(Budget)).scalars().all():
            alert = verify_budget_storage(budget, db, reupload_missing=False)
            if alert:
                logger.error("storage_integrity: %s (tenant_id=%s)", alert, budget.tenant_id)
                _startup_alerts_by_tenant.setdefault(budget.tenant_id, []).append(alert)
        for row in db.execute(select(QrCode)).scalars().all():
            if not sanity_check_qrcode_row(row, db, regenerate=False):
                msg = f"Etiqueta QR {row.id} inválida: arquivo ausente no S3"
                logger.error("storage_integrity: %s (tenant_id=%s)", msg, row.tenant_id)
                _startup_alerts_by_tenant.setdefault(row.tenant_id, []).append(msg)
        db.commit()
    except Exception as exc:
        logger.exception("storage_integrity startup validation failed: %s", exc)
        db.rollback()
