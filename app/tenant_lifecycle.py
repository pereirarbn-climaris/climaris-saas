"""Reset operacional e exclusão de conta do workspace (tenant)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.tenant_logo import delete_tenant_logo_if_exists
from models import Base, LoginRefreshToken, Tenant, User

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

_SKIP_RESET_MODELS = {Tenant, User}


def _iter_tenant_scoped_models() -> list[type]:
    models: list[type] = []
    for mapper in Base.registry.mappers:
        model = mapper.class_
        if model in _SKIP_RESET_MODELS:
            continue
        if "tenant_id" in mapper.columns:
            models.append(model)
    return models


def _delete_tenant_scoped_rows(db: Session, tenant_id: int) -> dict[str, int]:
    counts: dict[str, int] = {}
    models = _iter_tenant_scoped_models()
    max_passes = len(models) + 8
    for _ in range(max_passes):
        progress = False
        for model in models:
            result = db.execute(delete(model).where(model.tenant_id == tenant_id))
            deleted = int(result.rowcount or 0)
            if deleted <= 0:
                continue
            table = str(getattr(model, "__tablename__", model.__name__))
            counts[table] = counts.get(table, 0) + deleted
            progress = True
        if not progress:
            break
    else:
        raise RuntimeError("Não foi possível remover todos os dados operacionais do workspace.")
    return counts


def _reset_tenant_integration_fields(tenant: Tenant) -> None:
    tenant.whatsapp_instance_name = None
    tenant.whatsapp_connection_status = None
    tenant.whatsapp_connected_at = None
    tenant.whatsapp_appointment_template = None
    tenant.whatsapp_appointment_confirm_keyword = None
    tenant.whatsapp_appointment_reschedule_keyword = None
    tenant.whatsapp_appointment_confirm_reply = None
    tenant.whatsapp_appointment_reschedule_reply = None
    tenant.whatsapp_appointment_cancel_reply = None
    tenant.whatsapp_reminder_offsets_json = None
    tenant.whatsapp_reminder_custom_minutes = None
    tenant.whatsapp_agenda_dispatch_scheduled_at = None
    tenant.whatsapp_automation_enabled = False
    tenant.preventive_promo_image_enabled = False
    tenant.preventive_auto_whatsapp_enabled = False
    tenant.preventive_auto_whatsapp_mode = "days_before"
    tenant.preventive_auto_schedule_enabled = False
    tenant.preventive_action_buttons_enabled = False
    tenant.preventive_button_schedule_enabled = True
    tenant.preventive_button_custom_enabled = True
    tenant.preventive_button_custom_result = "lead"
    tenant.preventive_button_custom_reply_text = None
    tenant.preventive_button_custom_url = None
    tenant.preventive_message_template = None
    tenant.preventive_message_template_first = None
    tenant.preventive_default_template_kind = "returning"
    tenant.preventive_technical_problem_hint = None


def reset_tenant_operational_data(db: Session, tenant: Tenant) -> dict[str, int]:
    """Remove dados operacionais do workspace, preservando cadastro da empresa e usuários."""
    tenant_id = tenant.id
    promo_key = tenant.preventive_promo_image_s3_key
    tenant.preventive_promo_image_s3_key = None
    tenant.preventive_promo_image_url = None
    tenant.preventive_promo_image_mimetype = None

    deleted = _delete_tenant_scoped_rows(db, tenant_id)
    _reset_tenant_integration_fields(tenant)
    db.add(tenant)
    db.flush()

    if promo_key:
        delete_tenant_logo_if_exists(promo_key, db=db)

    return deleted


def delete_tenant_account(db: Session, tenant: Tenant) -> None:
    """Exclui o workspace inteiro (cascata no banco + relacionamentos ORM)."""
    tenant_id = tenant.id
    logo_key = tenant.logo_s3_key
    promo_key = tenant.preventive_promo_image_s3_key

    user_ids = list(db.scalars(select(User.id).where(User.tenant_id == tenant_id)).all())
    if user_ids:
        db.execute(delete(LoginRefreshToken).where(LoginRefreshToken.user_id.in_(user_ids)))

    db.delete(tenant)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError(
            "Não foi possível excluir a conta porque existem registros vinculados que bloqueiam a remoção."
        ) from exc

    if logo_key:
        delete_tenant_logo_if_exists(logo_key, db=db)
    if promo_key and promo_key != logo_key:
        delete_tenant_logo_if_exists(promo_key, db=db)
