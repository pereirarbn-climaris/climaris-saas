"""Tenant garantia settings API."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.tenant_garantia_settings import get_tenant_garantia_settings, patch_tenant_garantia_settings
from models import User, UserRole

router = APIRouter(tags=["garantia-settings"])


class TenantGarantiaSettingsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    default_meses_garantia: int = Field(alias="defaultMesesGarantia")
    prazo_garantia_servico: str = Field(alias="prazoGarantiaServico")
    nota_garantia_fabrica: str = Field(alias="notaGarantiaFabrica")
    termos_garantia: str = Field(alias="termosGarantia")
    servicos_cobertos: str = Field(alias="servicosCobertos")
    condicoes_exclusoes: str = Field(alias="condicoesExclusoes")


class TenantGarantiaSettingsPatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    default_meses_garantia: int | None = Field(default=None, alias="defaultMesesGarantia", ge=1, le=120)
    prazo_garantia_servico: str | None = Field(default=None, alias="prazoGarantiaServico", max_length=8000)
    nota_garantia_fabrica: str | None = Field(default=None, alias="notaGarantiaFabrica", max_length=8000)
    termos_garantia: str | None = Field(default=None, alias="termosGarantia", max_length=16000)
    servicos_cobertos: str | None = Field(default=None, alias="servicosCobertos", max_length=16000)
    condicoes_exclusoes: str | None = Field(default=None, alias="condicoesExclusoes", max_length=16000)


@router.get(
    "/tenant/garantia-settings",
    response_model=TenantGarantiaSettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN))],
)
def get_garantia_settings_route(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TenantGarantiaSettingsOut:
    data = get_tenant_garantia_settings(db, tenant_id=current_user.tenant_id)
    return TenantGarantiaSettingsOut.model_validate(data)


@router.patch(
    "/tenant/garantia-settings",
    response_model=TenantGarantiaSettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def patch_garantia_settings_route(
    payload: TenantGarantiaSettingsPatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TenantGarantiaSettingsOut:
    raw = payload.model_dump(by_alias=False, exclude_unset=True)
    data = patch_tenant_garantia_settings(db, tenant_id=current_user.tenant_id, payload=raw)
    return TenantGarantiaSettingsOut.model_validate(data)
