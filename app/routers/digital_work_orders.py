"""Router da OS digital — medições, evidências e validação de compliance."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.domains.work_orders.digital_os_service import DigitalWorkOrderService
from app.digital_work_order_media import upload_digital_work_order_evidence_file
from app.domains.work_orders.schemas import (
    DigitalWorkOrderDetailOut,
    DigitalWorkOrderEvidencesBatchIn,
    DigitalWorkOrderEvidencesBatchOut,
    DigitalWorkOrderEvidenceOut,
    DigitalWorkOrderEvidenceUploadOut,
    DigitalWorkOrderMeasurementsBatchIn,
    DigitalWorkOrderMeasurementsBatchOut,
    DigitalWorkOrderMeasurementOut,
    DigitalWorkOrderOut,
    DigitalWorkOrderValidateOut,
    MissingRequirementOut,
)
from app.service_order_ops import technician_can_access_order
from app.service_order_closure import resolve_technician_id_for_compliance
from models import DigitalWorkOrder, Schedule, ServiceOrder, User, UserRole

router = APIRouter(prefix="/digital-os", tags=["digital-work-orders"])

_ALLOWED_ROLES = (UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN)


def _get_service(db: Session, current_user: User) -> DigitalWorkOrderService:
    return DigitalWorkOrderService(db, tenant_id=current_user.tenant_id)


def _load_digital_work_order(
    service: DigitalWorkOrderService,
    digital_id: UUID,
) -> DigitalWorkOrder:
    digital = service.get_by_id(digital_id)
    if digital is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OS digital não encontrada.")
    return digital


def _ensure_order_access(order: ServiceOrder, current_user: User) -> None:
    if not technician_can_access_order(order, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para acessar esta ordem de serviço.",
        )


def _resolve_technician_id_for_validation(order: ServiceOrder, current_user: User) -> int | None:
    return resolve_technician_id_for_compliance(order, current_user)


def _get_accessible_digital(
    digital_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> tuple[DigitalWorkOrder, DigitalWorkOrderService]:
    service = _get_service(db, current_user)
    digital = _load_digital_work_order(service, digital_id)
    order = digital.service_order
    if order is None or order.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de serviço não encontrada.")
    _ensure_order_access(order, current_user)
    return digital, service


@router.get(
    "/by-service-order/{service_order_id}",
    response_model=DigitalWorkOrderDetailOut,
    dependencies=[Depends(require_roles(*_ALLOWED_ROLES))],
)
def get_digital_work_order_by_service_order(
    service_order_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> DigitalWorkOrderDetailOut:
    order = db.execute(
        select(ServiceOrder)
        .where(
            ServiceOrder.id == service_order_id,
            ServiceOrder.tenant_id == current_user.tenant_id,
        )
        .options(
            selectinload(ServiceOrder.technicians),
            selectinload(ServiceOrder.schedules).selectinload(Schedule.technicians),
        )
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de serviço não encontrada.")
    _ensure_order_access(order, current_user)

    service = _get_service(db, current_user)
    digital = service.get_by_service_order_id(order.id)
    if digital is None:
        digital = service.ensure_for_service_order(order)
        db.commit()
    digital = service.get_by_id(digital.id) or digital
    return DigitalWorkOrderDetailOut.model_validate(digital)


def _sync_response_status(conflict_detected: bool) -> int:
    return 209 if conflict_detected else status.HTTP_200_OK


@router.post(
    "/{digital_id}/evidences/upload",
    response_model=DigitalWorkOrderEvidenceUploadOut,
    dependencies=[Depends(require_roles(*_ALLOWED_ROLES))],
)
async def upload_digital_work_order_evidence_file_endpoint(
    digital_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    evidence_key: Annotated[str, Form()],
    latitude: Annotated[float, Form()],
    longitude: Annotated[float, Form()],
    file: UploadFile = File(...),
    accuracy_meters: Annotated[float | None, Form()] = None,
    captured_offline: Annotated[bool, Form()] = False,
    is_required: Annotated[bool, Form()] = False,
    last_version: Annotated[int | None, Form()] = None,
) -> JSONResponse:
    digital, service = _get_accessible_digital(digital_id, db, current_user)
    raw = await file.read()
    try:
        uploaded = upload_digital_work_order_evidence_file(
            tenant_id=current_user.tenant_id,
            digital_work_order_id=digital.id,
            evidence_key=evidence_key,
            file_bytes=raw,
            source_filename=file.filename,
            source_content_type=file.content_type,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    sync_result = service.apply_evidence_sync(
        digital,
        evidence_key=evidence_key.strip(),
        last_version=last_version,
        actor_user_id=current_user.id,
        evidence_type="photo",
        storage_key=uploaded.storage_key,
        mime_type=uploaded.mime_type,
        is_required=is_required,
        latitude=latitude,
        longitude=longitude,
        accuracy_meters=accuracy_meters,
        captured_offline=captured_offline,
    )
    db.commit()
    db.refresh(sync_result.evidence)
    payload = DigitalWorkOrderEvidenceUploadOut(
        evidence=DigitalWorkOrderEvidenceOut.model_validate(sync_result.evidence),
        conflict_detected=sync_result.mutation.conflict_detected,
        version=sync_result.mutation.version,
    )
    return JSONResponse(
        status_code=_sync_response_status(sync_result.mutation.conflict_detected),
        content=payload.model_dump(mode="json"),
    )


@router.post(
    "/{digital_id}/measurements",
    response_model=DigitalWorkOrderMeasurementsBatchOut,
    dependencies=[Depends(require_roles(*_ALLOWED_ROLES))],
)
def post_digital_work_order_measurements(
    digital_id: UUID,
    payload: DigitalWorkOrderMeasurementsBatchIn,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> JSONResponse:
    digital, service = _get_accessible_digital(digital_id, db, current_user)

    measurement_payloads = [
        {
            "metric_key": item.metric_key,
            "value_numeric": item.value_numeric,
            "value_text": item.value_text,
            "unit": item.unit,
            "is_required": item.is_required,
            "recorded_offline": item.recorded_offline,
        }
        for item in payload.measurements
    ]
    sync_result = service.apply_measurements_sync(
        digital,
        measurements=measurement_payloads,
        last_version=payload.last_version,
        actor_user_id=current_user.id,
    )

    saved: list[DigitalWorkOrderMeasurementOut] = []
    db.refresh(digital, attribute_names=["measurements"])
    saved_keys = {item["metric_key"] for item in measurement_payloads}
    for row in digital.measurements:
        if row.metric_key in saved_keys:
            saved.append(DigitalWorkOrderMeasurementOut.model_validate(row))

    db.commit()
    body = DigitalWorkOrderMeasurementsBatchOut(
        measurements=saved,
        conflict_detected=sync_result.conflict_detected,
        version=sync_result.version,
    )
    return JSONResponse(
        status_code=_sync_response_status(sync_result.conflict_detected),
        content=body.model_dump(mode="json"),
    )


@router.post(
    "/{digital_id}/evidences",
    response_model=DigitalWorkOrderEvidencesBatchOut,
    dependencies=[Depends(require_roles(*_ALLOWED_ROLES))],
)
def post_digital_work_order_evidences(
    digital_id: UUID,
    payload: DigitalWorkOrderEvidencesBatchIn,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> JSONResponse:
    digital, service = _get_accessible_digital(digital_id, db, current_user)

    conflict_detected = False
    saved: list[DigitalWorkOrderEvidenceOut] = []
    evidence_payloads = [
        {
            "evidence_key": item.evidence_key,
            "evidence_type": item.evidence_type,
            "storage_key": item.storage_key,
            "mime_type": item.mime_type,
            "is_required": item.is_required,
            "latitude": item.latitude,
            "longitude": item.longitude,
            "accuracy_meters": item.accuracy_meters,
            "captured_offline": item.captured_offline,
        }
        for item in payload.evidences
    ]
    sync_result, rows = service.apply_evidences_batch_sync(
        digital,
        evidences=evidence_payloads,
        last_version=payload.last_version,
        actor_user_id=current_user.id,
    )
    saved = [DigitalWorkOrderEvidenceOut.model_validate(row) for row in rows]

    db.commit()
    body = DigitalWorkOrderEvidencesBatchOut(
        evidences=saved,
        conflict_detected=sync_result.conflict_detected,
        version=sync_result.version,
    )
    return JSONResponse(
        status_code=_sync_response_status(sync_result.conflict_detected),
        content=body.model_dump(mode="json"),
    )


@router.get(
    "/{digital_id}/validate",
    response_model=DigitalWorkOrderValidateOut,
    dependencies=[Depends(require_roles(*_ALLOWED_ROLES))],
)
def get_digital_work_order_validate(
    digital_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> DigitalWorkOrderValidateOut:
    digital, service = _get_accessible_digital(digital_id, db, current_user)
    order = digital.service_order
    technician_id = _resolve_technician_id_for_validation(order, current_user)

    can_finalize, result = service.evaluate_finalize(digital, technician_id=technician_id)
    db.commit()

    missing = [
        MissingRequirementOut(
            code=err.code,
            message=err.message,
            field=err.field,
            blocking=err.blocking,
        )
        for err in result.errors
    ]
    return DigitalWorkOrderValidateOut(can_finalize=can_finalize, missing_requirements=missing)
