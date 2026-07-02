"""Regra: técnico deve possuir certificação ativa para o equipamento da OS."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, object_session

from app.domains.compliance.schemas import ComplianceContext, ValidationErrorItem
from models import (
    EquipmentAsset,
    TechnicianCertification,
    TechnicianCertificationModel,
    TechnicianCertificationStatus,
)


class TechnicianCertificationRule:
    code = "technician_certification"
    description = "Técnico deve possuir certificação ativa para o equipamento."
    blocking = True

    def evaluate(self, digital_work_order: object, ctx: ComplianceContext) -> list[ValidationErrorItem]:
        if ctx.technician_id is None:
            return [
                ValidationErrorItem(
                    code="technician_not_assigned",
                    message="Nenhum técnico atribuído para validar certificação.",
                    field="technician_id",
                    blocking=True,
                )
            ]

        equipment_asset_id = ctx.equipment_asset_id or getattr(digital_work_order, "equipment_asset_id", None)
        if equipment_asset_id is None:
            return []

        db: Session | None = object_session(digital_work_order)  # type: ignore[arg-type]
        if db is None:
            return []

        asset = db.get(EquipmentAsset, equipment_asset_id)
        if asset is None or asset.manufacturer_partner_id is None:
            return []

        today = date.today()
        cert = db.execute(
            select(TechnicianCertification).where(
                TechnicianCertification.tenant_id == ctx.tenant_id,
                TechnicianCertification.technician_id == ctx.technician_id,
                TechnicianCertification.manufacturer_partner_id == asset.manufacturer_partner_id,
                TechnicianCertification.status == TechnicianCertificationStatus.ACTIVE,
            )
        ).scalar_one_or_none()

        if cert is None:
            return [
                ValidationErrorItem(
                    code="certification_missing",
                    message="Técnico sem certificação ativa para o fabricante do equipamento.",
                    field="technician_certification",
                    blocking=True,
                )
            ]

        if cert.expires_at is not None and cert.expires_at < today:
            return [
                ValidationErrorItem(
                    code="certification_expired",
                    message="Certificação do técnico está expirada.",
                    field="technician_certification",
                    blocking=True,
                )
            ]

        homologated = db.execute(
            select(TechnicianCertificationModel).where(
                TechnicianCertificationModel.certification_id == cert.id
            )
        ).scalars().all()

        if not homologated:
            return []

        model_code = (asset.model_code or "").strip().lower()
        catalog_id = asset.equipment_catalog_id

        for row in homologated:
            if catalog_id is not None and row.equipment_catalog_id == catalog_id:
                return []
            if (row.model_code or "").strip().lower() == model_code:
                return []

        return [
            ValidationErrorItem(
                code="certification_model_mismatch",
                message="Certificação do técnico não cobre o modelo do equipamento.",
                field="technician_certification",
                blocking=True,
            )
        ]
