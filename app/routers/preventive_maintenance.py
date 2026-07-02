from __future__ import annotations

from secrets import compare_digest
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, File, Header, HTTPException, Path, Query, Response, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import PREVENTIVE_CRON_SECRET
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.whatsapp_entitlements import require_whatsapp_module
from app.equipment_service_preventive import (
    delete_manual_preventive_reminder,
    get_manual_preventive_reminder,
    list_equipment_service_preventive_schedules,
    list_preventive_items_by_equipment_month,
    reset_equipment_service_preventive_override,
    update_manual_preventive_reminder,
    upsert_equipment_service_preventive_override,
)
from app.equipment_preventive_rules import (
    delete_equipment_preventive_rule,
    get_equipment_preventive_rule,
    rule_to_dict,
    update_equipment_preventive_rule,
    upsert_equipment_preventive_rule,
)
from app.preventive_promo_image import clear_preventive_promo_image, upload_preventive_promo_image
from app.preventive_maintenance import (
    build_grouped_preview,
    build_preventive_grouped_send_bundle,
    create_historico,
    create_historicos_from_service_order,
    dispatch_preventive_due_today,
    dispatch_preventive_reminders_bulk,
    find_preventive_group_for_item,
    get_preventive_settings,
    group_preventive_items_by_client_and_due_month,
    list_interest_leads,
    list_preventive_items,
    list_preventive_items_grouped,
    patch_preventive_settings,
    register_manual_preventive_entry,
    spawn_preventive_reminder_send_thread,
    spawn_preventive_reminders_bulk_thread,
    _preventive_item_due_month_key,
)
from app.security import JWT_ALGORITHM, JWT_SECRET_KEY
from app.schemas_whatsapp import WhatsappMessageJobOut
from app.schemas_preventive import (
    HistoricoServicoCreate,
    HistoricoServicoOut,
    PreventiveBulkSendOut,
    PreventiveBulkSendRequest,
    PreventiveHistoricoFromOsCreate,
    PreventiveItemOut,
    PreventiveClientGroupOut,
    PreventiveItemsListOut,
    PreventiveLeadOut,
    PreventiveManualReminderOut,
    PreventiveManualReminderUpdate,
    PreventivePreviewOut,
    PreventiveRegisterEntryCreate,
    PreventiveRegisterEntryOut,
    PreventiveSendReminderOut,
    PreventiveSendRequest,
    PreventiveSettingsOut,
    PreventiveSettingsPatch,
    EquipmentPreventiveRuleCreate,
    EquipmentPreventiveRuleOut,
    EquipmentPreventiveRuleUpdate,
    EquipmentServicePreventiveOverrideUpsert,
    EquipmentServicePreventiveScheduleListOut,
    EquipmentServicePreventiveScheduleOut,
)
from models import Tenant, User, UserRole

router = APIRouter(prefix="/preventive-maintenance", tags=["preventive-maintenance"])

_optional_bearer = HTTPBearer(auto_error=False)


def _admin_user_from_token(db: Session, token: str) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_error
    except jwt.InvalidTokenError as exc:
        raise credentials_error from exc

    user = db.execute(select(User).where(User.id == int(user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_error
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions.")
    return user


def _require_whatsapp_module(db: Session, tenant_id: int) -> None:
    require_whatsapp_module(db, tenant_id)


@router.get("/settings", response_model=PreventiveSettingsOut)
def get_settings(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    return get_preventive_settings(db, current_user.tenant_id)


@router.patch("/settings", response_model=PreventiveSettingsOut)
def patch_settings(
    payload: PreventiveSettingsPatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    if not payload.model_fields_set:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nada para atualizar.")
    return patch_preventive_settings(db, current_user.tenant_id, payload)


@router.post(
    "/banner-image",
    response_model=PreventiveSettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
async def upload_preventive_banner_image(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
    model_id: str | None = Query(default=None, max_length=32),
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    raw = await file.read()
    try:
        upload_preventive_promo_image(
            db,
            tenant_id=current_user.tenant_id,
            file_bytes=raw,
            source_filename=file.filename,
            model_id=model_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao enviar banner: {exc}",
        ) from exc
    return get_preventive_settings(db, current_user.tenant_id)


@router.delete(
    "/banner-image",
    response_model=PreventiveSettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def delete_preventive_banner_image(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    model_id: str | None = Query(default=None, max_length=32),
) -> dict:
    _require_whatsapp_module(db, current_user.tenant_id)
    try:
        clear_preventive_promo_image(db, tenant_id=current_user.tenant_id, model_id=model_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return get_preventive_settings(db, current_user.tenant_id)


@router.get("/banner-image/file")
def get_preventive_banner_image_file(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    model_id: str | None = Query(default=None, max_length=32),
) -> Response:
    """Proxy same-origin do banner preventivo (prévia no painel)."""
    from app.preventive_promo_image import preventive_model_banner_s3_key
    from app.tenant_logo import fetch_s3_image_bytes

    _require_whatsapp_module(db, current_user.tenant_id)
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    s3_key = preventive_model_banner_s3_key(tenant, model_id) or ""
    if not s3_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner não cadastrado.")
    try:
        data, content_type = fetch_s3_image_bytes(s3_key, db=db)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "private, max-age=300"})


def _rule_out(rule) -> EquipmentPreventiveRuleOut:
    return EquipmentPreventiveRuleOut.model_validate(rule_to_dict(rule))


@router.post(
    "/rules",
    response_model=EquipmentPreventiveRuleOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def upsert_preventive_rule(
    payload: EquipmentPreventiveRuleCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentPreventiveRuleOut:
    """Cria ou atualiza a regra preventiva do equipamento (uma regra por equipamento)."""
    rule = upsert_equipment_preventive_rule(
        db,
        tenant_id=current_user.tenant_id,
        equipment_id=payload.equipment_id,
        interval_value=payload.interval_value,
        interval_type=payload.interval_type,
        is_active=payload.is_active,
    )
    return _rule_out(rule)


@router.get(
    "/rules/equipment/{equipment_id}",
    response_model=EquipmentPreventiveRuleOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def get_preventive_rule_by_equipment(
    equipment_id: Annotated[int, Path(ge=1)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentPreventiveRuleOut:
    rule = get_equipment_preventive_rule(
        db,
        tenant_id=current_user.tenant_id,
        equipment_id=equipment_id,
    )
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regra preventiva não configurada.")
    return _rule_out(rule)


@router.get(
    "/equipment/{equipment_id}/service-schedules",
    response_model=EquipmentServicePreventiveScheduleListOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def get_equipment_service_preventive_schedules(
    equipment_id: Annotated[int, Path(ge=1)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentServicePreventiveScheduleListOut:
    rows = list_equipment_service_preventive_schedules(
        db,
        tenant_id=current_user.tenant_id,
        equipment_id=equipment_id,
    )
    return EquipmentServicePreventiveScheduleListOut(
        items=[EquipmentServicePreventiveScheduleOut.model_validate(row) for row in rows]
    )


@router.put(
    "/equipment/{equipment_id}/service-schedules/{service_id}",
    response_model=EquipmentServicePreventiveScheduleOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def put_equipment_service_preventive_schedule(
    equipment_id: Annotated[int, Path(ge=1)],
    service_id: Annotated[int, Path(ge=1)],
    payload: EquipmentServicePreventiveOverrideUpsert,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentServicePreventiveScheduleOut:
    row = upsert_equipment_service_preventive_override(
        db,
        tenant_id=current_user.tenant_id,
        equipment_id=equipment_id,
        service_id=service_id,
        interval_value=payload.interval_value,
        interval_type=payload.interval_type,
    )
    return EquipmentServicePreventiveScheduleOut.model_validate(row)


@router.delete(
    "/equipment/{equipment_id}/service-schedules/{service_id}",
    response_model=EquipmentServicePreventiveScheduleOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def delete_equipment_service_preventive_schedule_override(
    equipment_id: Annotated[int, Path(ge=1)],
    service_id: Annotated[int, Path(ge=1)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentServicePreventiveScheduleOut:
    row = reset_equipment_service_preventive_override(
        db,
        tenant_id=current_user.tenant_id,
        equipment_id=equipment_id,
        service_id=service_id,
    )
    return EquipmentServicePreventiveScheduleOut.model_validate(row)


@router.put(
    "/rules/{rule_id}",
    response_model=EquipmentPreventiveRuleOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def put_preventive_rule(
    rule_id: Annotated[int, Path(ge=1)],
    payload: EquipmentPreventiveRuleUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EquipmentPreventiveRuleOut:
    if not payload.model_fields_set:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nada para atualizar.")
    rule = update_equipment_preventive_rule(
        db,
        tenant_id=current_user.tenant_id,
        rule_id=rule_id,
        interval_value=payload.interval_value,
        interval_type=payload.interval_type,
        is_active=payload.is_active,
    )
    return _rule_out(rule)


@router.delete(
    "/rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def delete_preventive_rule(
    rule_id: Annotated[int, Path(ge=1)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    delete_equipment_preventive_rule(db, tenant_id=current_user.tenant_id, rule_id=rule_id)


@router.get("/items", response_model=PreventiveItemsListOut)
def list_items(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    days: Annotated[int | None, Query(ge=1, le=400)] = None,
) -> PreventiveItemsListOut:
    if year is not None or month is not None:
        if year is None or month is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Informe year e month juntos.",
            )
        payload = list_preventive_items_by_equipment_month(
            db,
            tenant_id=current_user.tenant_id,
            year=year,
            month=month,
        )
    else:
        _require_whatsapp_module(db, current_user.tenant_id)
        window_days = days if days is not None else 30
        payload = list_preventive_items_grouped(db, tenant_id=current_user.tenant_id, window_days=window_days)

    clients = [
        PreventiveClientGroupOut(
            client_id=int(g["client_id"]),
            client_name=str(g["client_name"]),
            whatsapp_valido=bool(g.get("whatsapp_valido")),
            whatsapp_destino=g.get("whatsapp_destino"),
            equipments=[PreventiveItemOut.model_validate(eq) for eq in g.get("equipments", [])],
        )
        for g in payload.get("clients", [])
    ]
    items = [PreventiveItemOut.model_validate(r) for r in payload.get("items", [])]
    return PreventiveItemsListOut(
        window_days=payload.get("window_days"),
        year=payload.get("year"),
        month=payload.get("month"),
        clients=clients,
        items=items,
    )


@router.get("/preview", response_model=PreventivePreviewOut)
def preview_message(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    historico_servico_id: Annotated[int | None, Query(ge=1)] = None,
    rule_id: Annotated[int | None, Query(ge=1)] = None,
    window_days: Annotated[int, Query(ge=1, le=400)] = 365,
    technical_problem_hint: Annotated[str | None, Query()] = None,
) -> PreventivePreviewOut:
    _require_whatsapp_module(db, current_user.tenant_id)
    if (historico_servico_id is None) == (rule_id is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe historico_servico_id ou rule_id.",
        )
    return build_grouped_preview(
        db,
        tenant_id=current_user.tenant_id,
        window_days=window_days,
        historico_servico_id=historico_servico_id,
        rule_id=rule_id,
        override_problem=technical_problem_hint,
    )


@router.post("/historico", response_model=HistoricoServicoOut, status_code=status.HTTP_201_CREATED)
def post_historico(
    payload: HistoricoServicoCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Cadastro de histórico (vencimento preventivo); não exige módulo WhatsApp — só envio de campanha exige."""
    row = create_historico(
        db,
        tenant_id=current_user.tenant_id,
        client_id=payload.client_id,
        service_id=payload.service_id,
        data_realizacao=payload.data_realizacao,
        service_order_id=payload.service_order_id,
        notes=payload.notes,
    )
    return row


@router.post(
    "/historico/from-service-order/{service_order_id}",
    response_model=list[HistoricoServicoOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def post_historico_from_service_order(
    service_order_id: Annotated[int, Path(ge=1)],
    payload: PreventiveHistoricoFromOsCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Registra histórico preventivo a partir da OS; não exige módulo WhatsApp."""
    rows = create_historicos_from_service_order(
        db,
        tenant_id=current_user.tenant_id,
        service_order_id=service_order_id,
        data_realizacao=payload.data_realizacao,
        notes=payload.notes,
    )
    return rows


@router.post(
    "/send-reminder",
    response_model=PreventiveSendReminderOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def send_reminder(
    payload: PreventiveSendRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PreventiveSendReminderOut:
    _require_whatsapp_module(db, current_user.tenant_id)
    window_days = int(payload.window_days or 365)
    if payload.client_id is not None and payload.year is not None and payload.month is not None:
        from app.equipment_service_preventive import find_preventive_group_for_client_month

        group = find_preventive_group_for_client_month(
            db,
            tenant_id=current_user.tenant_id,
            client_id=payload.client_id,
            year=payload.year,
            month=payload.month,
        )
    else:
        group = find_preventive_group_for_item(
            db,
            tenant_id=current_user.tenant_id,
            window_days=window_days,
            historico_servico_id=payload.historico_servico_id,
            rule_id=payload.rule_id,
        )
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Item não encontrado na janela de preventivas ou sem WhatsApp válido.",
        )
    build_preventive_grouped_send_bundle(
        db,
        tenant_id=current_user.tenant_id,
        items=group["items"],
        promo_image_url=payload.promo_image_url,
        promo_image_base64=payload.promo_image_base64,
        promo_image_mimetype=payload.promo_image_mimetype,
        technical_problem_hint=payload.technical_problem_hint,
    )
    spawn_preventive_reminder_send_thread(
        current_user.tenant_id,
        current_user.id,
        payload.historico_servico_id,
        payload.rule_id,
        window_days,
        payload.promo_image_url,
        payload.promo_image_base64,
        payload.promo_image_mimetype,
        payload.technical_problem_hint,
        payload.client_id,
        payload.year,
        payload.month,
        payload.message_template_kind,
    )
    return PreventiveSendReminderOut(processing_in_background=True, whatsapp_job=None)


@router.post(
    "/register-entry",
    response_model=PreventiveRegisterEntryOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def post_register_entry(
    payload: PreventiveRegisterEntryCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PreventiveRegisterEntryOut:
    """Registra última realização + opcionalmente envia ou agenda lembrete WhatsApp."""
    if payload.reminder_send != "none":
        _require_whatsapp_module(db, current_user.tenant_id)
    hist, job = register_manual_preventive_entry(
        db,
        tenant_id=current_user.tenant_id,
        created_by_user=current_user,
        client_id=payload.client_id,
        new_client=payload.new_client,
        equipment_id=payload.equipment_id,
        equipment_label=payload.equipment_label,
        entry_mode=payload.entry_mode,
        service_id=payload.service_id,
        data_realizacao=payload.data_realizacao,
        notes=payload.notes,
        reminder_send=payload.reminder_send,
        reminder_local_date=payload.reminder_local_date,
        reminder_local_time=payload.reminder_local_time,
        promo_image_url=payload.promo_image_url,
        promo_image_base64=payload.promo_image_base64,
        promo_image_mimetype=payload.promo_image_mimetype,
        technical_problem_hint=payload.technical_problem_hint,
        message_template_kind=payload.message_template_kind,
    )
    return PreventiveRegisterEntryOut(
        historico=HistoricoServicoOut.model_validate(hist),
        whatsapp_job=WhatsappMessageJobOut.model_validate(job) if job is not None else None,
    )


@router.get(
    "/manual-reminders/{schedule_id}",
    response_model=PreventiveManualReminderOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def get_manual_reminder(
    schedule_id: Annotated[int, Path(ge=1)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PreventiveManualReminderOut:
    data = get_manual_preventive_reminder(db, tenant_id=current_user.tenant_id, schedule_id=schedule_id)
    return PreventiveManualReminderOut.model_validate(data)


@router.patch(
    "/manual-reminders/{schedule_id}",
    response_model=PreventiveManualReminderOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def patch_manual_reminder(
    schedule_id: Annotated[int, Path(ge=1)],
    payload: PreventiveManualReminderUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PreventiveManualReminderOut:
    update_manual_preventive_reminder(
        db,
        tenant_id=current_user.tenant_id,
        schedule_id=schedule_id,
        service_id=payload.service_id,
        data_realizacao=payload.data_realizacao,
        equipment_label=payload.equipment_label,
        notes=payload.notes,
        message_template_kind=payload.message_template_kind,
    )
    data = get_manual_preventive_reminder(db, tenant_id=current_user.tenant_id, schedule_id=schedule_id)
    return PreventiveManualReminderOut.model_validate(data)


@router.delete(
    "/manual-reminders/{schedule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def remove_manual_reminder(
    schedule_id: Annotated[int, Path(ge=1)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Response:
    delete_manual_preventive_reminder(db, tenant_id=current_user.tenant_id, schedule_id=schedule_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/leads", response_model=list[PreventiveLeadOut])
def list_leads(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[PreventiveLeadOut]:
    _require_whatsapp_module(db, current_user.tenant_id)
    rows = list_interest_leads(db, tenant_id=current_user.tenant_id, limit=limit)
    out: list[PreventiveLeadOut] = []
    for row in rows:
        base = PreventiveLeadOut.model_validate(row)
        client_name = row.client.name if row.client is not None else None
        out.append(base.model_copy(update={"client_name": client_name}))
    return out


@router.post(
    "/send-reminders-bulk",
    response_model=PreventiveBulkSendOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def send_reminders_bulk(
    payload: PreventiveBulkSendRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PreventiveBulkSendOut:
    _require_whatsapp_module(db, current_user.tenant_id)
    ids = list(payload.historico_servico_ids)
    wd = int(payload.window_days_if_empty or 7)
    rows = list_preventive_items(db, tenant_id=current_user.tenant_id, window_days=wd)
    eligible = [r for r in rows if r.get("whatsapp_valido")]
    groups = group_preventive_items_by_client_and_due_month(eligible)
    if ids:
        id_set = {int(h) for h in ids if int(h) > 0}
        target_keys = {
            _preventive_item_due_month_key(r)
            for r in eligible
            if int(r.get("historico_servico_id") or 0) in id_set
        }
        groups = [g for g in groups if _preventive_item_due_month_key(g["items"][0]) in target_keys]
    group_count = len(groups)
    if group_count >= 2:
        spawn_preventive_reminders_bulk_thread(
            current_user.tenant_id,
            current_user.id,
            ids,
            payload.promo_image_url,
            wd,
        )
        return PreventiveBulkSendOut(
            attempted=group_count,
            sent=0,
            failed=0,
            errors=[],
            processing_in_background=True,
        )
    result = dispatch_preventive_reminders_bulk(
        db,
        tenant_id=current_user.tenant_id,
        created_by_user=current_user,
        historico_servico_ids=ids,
        promo_image_url=payload.promo_image_url,
        window_days=wd,
    )
    return PreventiveBulkSendOut.model_validate(result)


@router.post("/run-due-cron")
def run_due_cron(
    db: Annotated[Session, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_optional_bearer)] = None,
    x_preventive_cron_secret: Annotated[str | None, Header(alias="X-Preventive-Cron-Secret")] = None,
) -> dict:
    """Lembretes automáticos (vencimento + antecipados). Use JWT admin ou `X-Preventive-Cron-Secret` se configurado."""
    cfg = (PREVENTIVE_CRON_SECRET or "").strip()
    hdr = (x_preventive_cron_secret or "").strip()
    if cfg and compare_digest(hdr, cfg):
        return dispatch_preventive_due_today()
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Informe Bearer de administrador ou X-Preventive-Cron-Secret.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    _admin_user_from_token(db, credentials.credentials)
    return dispatch_preventive_due_today()
