"""Serviço de certificação técnica — homologação por fabricante e modelo."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from models import (
    TechnicianCertification,
    TechnicianCertificationModel,
    TechnicianCertificationStatus,
)


class TechnicianCertificationService:
    def __init__(self, db: Session, *, tenant_id: int) -> None:
        self.db = db
        self.tenant_id = tenant_id

    def get_by_id(self, certification_id: UUID) -> TechnicianCertification | None:
        return self.db.execute(
            select(TechnicianCertification)
            .where(
                TechnicianCertification.id == certification_id,
                TechnicianCertification.tenant_id == self.tenant_id,
            )
            .options(selectinload(TechnicianCertification.homologated_models))
        ).scalar_one_or_none()

    def create_certification(
        self,
        *,
        technician_id: int,
        manufacturer_partner_id: UUID,
        certification_code: str | None = None,
        issued_at: date | None = None,
        expires_at: date | None = None,
        homologated_models: list[dict] | None = None,
        status: TechnicianCertificationStatus = TechnicianCertificationStatus.PENDING,
    ) -> TechnicianCertification:
        cert = TechnicianCertification(
            tenant_id=self.tenant_id,
            technician_id=technician_id,
            manufacturer_partner_id=manufacturer_partner_id,
            certification_code=(certification_code or "").strip() or None,
            issued_at=issued_at,
            expires_at=expires_at,
            status=status,
        )
        self.db.add(cert)
        self.db.flush()

        for spec in homologated_models or []:
            self.add_homologated_model(
                cert,
                equipment_catalog_id=spec.get("equipment_catalog_id"),
                brand=spec.get("brand"),
                model_code=spec["model_code"],
            )

        return cert

    def add_homologated_model(
        self,
        cert: TechnicianCertification,
        *,
        equipment_catalog_id: UUID | None = None,
        brand: str | None = None,
        model_code: str,
    ) -> TechnicianCertificationModel:
        row = TechnicianCertificationModel(
            certification_id=cert.id,
            equipment_catalog_id=equipment_catalog_id,
            brand=(brand or "").strip() or None,
            model_code=model_code.strip(),
        )
        self.db.add(row)
        self.db.flush()
        return row

    def is_technician_certified_for(
        self,
        *,
        technician_id: int,
        manufacturer_partner_id: UUID,
        model_code: str | None = None,
        equipment_catalog_id: UUID | None = None,
        on_date: date | None = None,
    ) -> bool:
        today = on_date or date.today()
        cert = self.db.execute(
            select(TechnicianCertification).where(
                TechnicianCertification.tenant_id == self.tenant_id,
                TechnicianCertification.technician_id == technician_id,
                TechnicianCertification.manufacturer_partner_id == manufacturer_partner_id,
                TechnicianCertification.status == TechnicianCertificationStatus.ACTIVE,
            )
        ).scalar_one_or_none()

        if cert is None:
            return False
        if cert.expires_at is not None and cert.expires_at < today:
            return False

        models = self.db.execute(
            select(TechnicianCertificationModel).where(
                TechnicianCertificationModel.certification_id == cert.id
            )
        ).scalars().all()

        if not models:
            return True

        model_norm = (model_code or "").strip().lower()
        for row in models:
            if equipment_catalog_id is not None and row.equipment_catalog_id == equipment_catalog_id:
                return True
            if model_norm and (row.model_code or "").strip().lower() == model_norm:
                return True

        return False
