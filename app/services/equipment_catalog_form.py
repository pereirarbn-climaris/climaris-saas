from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from fastapi import HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field, ValidationError, field_validator
from starlette.datastructures import FormData

logger = logging.getLogger(__name__)

_OPTIONAL_TEXT_KEYS = (
    "manual_title",
    "model",
    "model_evaporator",
    "model_condenser",
    "capacity",
    "fluid_type",
    "voltage",
    "technical_data",
)


def _form_text(form: FormData, key: str) -> str | None:
    raw = form.get(key)
    if raw is None:
        return None
    if isinstance(raw, UploadFile):
        return None
    text = str(raw).strip()
    return text if text else None


def _build_multipart_payload(form: FormData) -> dict[str, Any]:
    return {
        "category_id": _form_text(form, "category_id"),
        "brand": _form_text(form, "brand"),
        **{key: _form_text(form, key) for key in _OPTIONAL_TEXT_KEYS},
    }


class EquipmentCatalogMultipartForm(BaseModel):
    """Validação explícita do POST multipart /equipment-catalog (após leitura do form)."""

    category_id: uuid.UUID
    brand: str = Field(..., min_length=1, max_length=120)
    manual_title: str | None = Field(default=None, max_length=200)
    model: str | None = Field(default=None, max_length=120)
    model_evaporator: str | None = Field(default=None, max_length=120)
    model_condenser: str | None = Field(default=None, max_length=120)
    capacity: str | None = Field(default=None, max_length=80)
    fluid_type: str | None = Field(default=None, max_length=40)
    voltage: str | None = Field(default=None, max_length=40)
    technical_data: str | None = Field(default=None)

    @field_validator("category_id", mode="before")
    @classmethod
    def _validate_category_uuid(cls, value: object) -> object:
        if value is None:
            raise ValueError("category_id é obrigatório (UUID da categoria, não o nome).")
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"", "undefined", "null"}:
                raise ValueError("category_id inválido; selecione a categoria novamente no formulário.")
            return value.strip()
        return value

    @field_validator("brand", mode="before")
    @classmethod
    def _validate_brand(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                raise ValueError("Marca é obrigatória.")
            return stripped
        return value

    @field_validator(*_OPTIONAL_TEXT_KEYS, mode="before")
    @classmethod
    def _empty_optional_strings(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    def parsed_technical_data(self) -> dict[str, Any] | None:
        raw = self.technical_data
        if raw is None or not str(raw).strip():
            return None
        try:
            parsed = json.loads(str(raw))
        except json.JSONDecodeError as exc:
            raise ValueError("technical_data deve ser um JSON válido.") from exc
        if not isinstance(parsed, dict):
            raise ValueError("technical_data deve ser um objeto JSON.")
        return parsed


# Alias legado / documentação
CatalogEquipmentCreate = EquipmentCatalogMultipartForm


class EquipmentCatalogExistingManualForm(BaseModel):
    category_id: uuid.UUID
    brand: str = Field(..., min_length=1, max_length=120)
    manual_id: uuid.UUID
    model: str | None = Field(default=None, max_length=120)
    model_evaporator: str | None = Field(default=None, max_length=120)
    model_condenser: str | None = Field(default=None, max_length=120)
    capacity: str | None = Field(default=None, max_length=80)
    fluid_type: str | None = Field(default=None, max_length=40)
    voltage: str | None = Field(default=None, max_length=40)
    technical_data: str | None = Field(default=None)

    @field_validator("category_id", "manual_id", mode="before")
    @classmethod
    def _validate_uuids(cls, value: object) -> object:
        if isinstance(value, str):
            s = value.strip()
            if not s or s.lower() in {"undefined", "null"}:
                raise ValueError("Identificador inválido (esperado UUID).")
            return s
        return value

    @field_validator("brand", mode="before")
    @classmethod
    def _validate_brand(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                raise ValueError("Marca é obrigatória.")
            return stripped
        return value

    @field_validator(
        "model",
        "model_evaporator",
        "model_condenser",
        "capacity",
        "fluid_type",
        "voltage",
        "technical_data",
        mode="before",
    )
    @classmethod
    def _empty_optional_strings(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    def parsed_technical_data(self) -> dict[str, Any] | None:
        raw = self.technical_data
        if raw is None or not str(raw).strip():
            return None
        try:
            parsed = json.loads(str(raw))
        except json.JSONDecodeError as exc:
            raise ValueError("technical_data deve ser um JSON válido.") from exc
        if not isinstance(parsed, dict):
            raise ValueError("technical_data deve ser um objeto JSON.")
        return parsed


def _validation_http_exception(exc: ValidationError, *, path: str) -> HTTPException:
    errors = exc.errors()
    logger.error(
        "equipment-catalog multipart validation failed path=%s errors=%s",
        path,
        errors,
    )
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={
            "message": "Erro de validação no formulário do catálogo.",
            "fields": errors,
        },
    )


_PDF_CONTENT_TYPES = frozenset(
    {
        "application/pdf",
        "application/x-pdf",
        "application/acrobat",
        "application/vnd.pdf",
    }
)


def has_manual_pdf_upload(file: UploadFile | None) -> bool:
    """True se o multipart trouxe um PDF (nome ou content-type)."""
    if file is None:
        return False
    if (file.filename or "").strip():
        return True
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    return content_type in _PDF_CONTENT_TYPES


def _extract_optional_pdf_upload(form: FormData) -> UploadFile | None:
    raw = form.get("manual_pdf")
    if not isinstance(raw, UploadFile):
        return None
    if has_manual_pdf_upload(raw):
        return raw
    return None


def _extract_named_pdf_uploads(form: FormData, keys: tuple[str, ...]) -> dict[str, UploadFile]:
    out: dict[str, UploadFile] = {}
    for key in keys:
        raw = form.get(key)
        if isinstance(raw, UploadFile) and has_manual_pdf_upload(raw):
            out[key] = raw
    return out


async def read_catalog_create_multipart(
    request: Request,
) -> tuple[EquipmentCatalogMultipartForm, UploadFile | None, dict[str, UploadFile]]:
    """Lê multipart completo; PDF principal + PDFs extras (usuario/servico/instalacao)."""
    try:
        form = await request.form()
    except Exception as exc:
        logger.exception("Falha ao ler multipart em %s", request.url.path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível processar o formulário enviado. Verifique o tamanho do arquivo e tente novamente.",
        ) from exc

    manual_pdf = _extract_optional_pdf_upload(form)
    extra_pdfs = _extract_named_pdf_uploads(
        form,
        ("manual_usuario_pdf", "manual_instalacao_pdf", "manual_servico_pdf"),
    )

    try:
        parsed = EquipmentCatalogMultipartForm.model_validate(_build_multipart_payload(form))
    except ValidationError as exc:
        raise _validation_http_exception(exc, path=str(request.url.path)) from exc

    return parsed, manual_pdf, extra_pdfs


async def read_catalog_existing_manual_multipart(
    request: Request,
) -> EquipmentCatalogExistingManualForm:
    try:
        form = await request.form()
    except Exception as exc:
        logger.exception("Falha ao ler multipart em %s", request.url.path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível processar o formulário enviado.",
        ) from exc

    payload = {
        "category_id": _form_text(form, "category_id"),
        "brand": _form_text(form, "brand"),
        "manual_id": _form_text(form, "manual_id"),
        "model": _form_text(form, "model"),
        "model_evaporator": _form_text(form, "model_evaporator"),
        "model_condenser": _form_text(form, "model_condenser"),
        "capacity": _form_text(form, "capacity"),
        "fluid_type": _form_text(form, "fluid_type"),
        "voltage": _form_text(form, "voltage"),
    }

    try:
        return EquipmentCatalogExistingManualForm.model_validate(payload)
    except ValidationError as exc:
        raise _validation_http_exception(exc, path=str(request.url.path)) from exc
