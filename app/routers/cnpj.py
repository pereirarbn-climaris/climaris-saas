from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cnpja_client import (
    CnpjaHttpError,
    brasilapi_json_to_lookup,
    fetch_brasilapi_cnpj,
    fetch_office_commercial,
    fetch_office_open,
    normalize_cnpj_digits,
    office_payload_to_lookup,
)
from app.platform_credentials import resolve_cnpja_api_key
from app.database import get_db
from app.dependencies import require_roles
from app.limiter import limiter
from app.schemas import CnpjCommercialLookupOut, CnpjLookupOut, CnpjRegisterLookupOut
from app.tax_id import normalize_and_validate_tax_document
from models import Tenant, User, UserRole

router = APIRouter(prefix="/cnpj", tags=["cnpj"])

_LOOKUP_HINT = (
    "Não foi possível buscar a razão social automaticamente. Preencha o campo manualmente ou tente mais tarde."
)


def _normalize_lookup_tax_id(out: CnpjLookupOut, digits: str) -> CnpjLookupOut:
    if out.tax_id != digits:
        return out.model_copy(update={"tax_id": digits})
    return out


def _lookup_cnpj_best_effort(digits: str, db: Session) -> CnpjLookupOut | None:
    """Comercial (se houver chave) → open → BrasilAPI. Não levanta exceção."""
    api_key = resolve_cnpja_api_key(db)
    if api_key:
        try:
            raw = fetch_office_commercial(digits, api_key)
            out = office_payload_to_lookup(raw, "commercial")
            if out.company_name.strip():
                return _normalize_lookup_tax_id(out, digits)
        except (CnpjaHttpError, OSError):
            pass

    try:
        raw = fetch_office_open(digits)
        out = office_payload_to_lookup(raw, "open")
        if out.company_name.strip():
            return _normalize_lookup_tax_id(out, digits)
    except (CnpjaHttpError, OSError):
        pass

    try:
        br = fetch_brasilapi_cnpj(digits)
        out = brasilapi_json_to_lookup(br, digits)
        if out.company_name.strip():
            return _normalize_lookup_tax_id(out, digits)
    except Exception:
        pass

    return None


def _http_error_from_cnpja(exc: CnpjaHttpError) -> HTTPException:
    code = exc.status_code
    if code == 0:
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.body or "Não foi possível conectar ao serviço CNPJá.",
        )
    if code == 404:
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CNPJ não encontrado na Receita.")
    if code == 429:
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Limite de consultas CNPJá atingido. Aguarde um momento ou use a API comercial.",
        )
    if code == 401:
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha de autenticação na API CNPJá. Verifique a chave em Credenciais da plataforma (CNPJá) ou CNPJA_API_KEY.",
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Falha ao consultar CNPJá.",
    )


def _run_register_lookup(tax_id: str, db: Session) -> CnpjRegisterLookupOut:
    """Valida CNPJ, verifica tenant; tenta CNPJá (open → comercial) e fallback BrasilAPI; nunca retorna 404 ao front do cadastro."""
    try:
        digits = normalize_and_validate_tax_document(tax_id, "cnpj")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    existing = db.execute(select(Tenant).where(Tenant.cnpj == digits)).scalar_one_or_none()
    if existing is not None:
        return CnpjRegisterLookupOut(
            already_registered=True,
            registered_tenant_name=existing.name,
            lookup=None,
        )

    out: CnpjLookupOut | None = _lookup_cnpj_best_effort(digits, db)

    if out is not None:
        return CnpjRegisterLookupOut(
            already_registered=False,
            registered_tenant_name=None,
            lookup=out,
        )

    return CnpjRegisterLookupOut(
        already_registered=False,
        registered_tenant_name=None,
        lookup=None,
        external_unavailable=True,
        lookup_hint=_LOOKUP_HINT,
    )


@router.get("/register-lookup", response_model=CnpjRegisterLookupOut)
@limiter.limit("30/minute")
def register_lookup_cnpj_query(
    request: Request,
    tax_id: str = Query(..., min_length=14, max_length=22, description="CNPJ (14 dígitos)"),
    db: Annotated[Session, Depends(get_db)] = ...,
) -> CnpjRegisterLookupOut:
    """Mesmo que `/register-lookup/{tax_id}`, via query string (útil se o proxy tiver problema com path)."""
    return _run_register_lookup(tax_id, db)


@router.get("/register-lookup/{tax_id}", response_model=CnpjRegisterLookupOut)
@limiter.limit("30/minute")
def register_lookup_cnpj_path(
    request: Request,
    tax_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> CnpjRegisterLookupOut:
    return _run_register_lookup(tax_id, db)


@router.get("/open/{tax_id}", response_model=CnpjLookupOut)
@limiter.limit("20/minute")
def lookup_cnpj_open(
    request: Request,
    tax_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> CnpjLookupOut:
    """Consulta Open; se falhar ou vier incompleta, usa comercial (chave CNPJá) e depois BrasilAPI."""
    try:
        digits = normalize_cnpj_digits(tax_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    out = _lookup_cnpj_best_effort(digits, db)
    if out is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="CNPJ não encontrado ou serviços de consulta indisponíveis no momento.",
        )
    return out


@router.get("/commercial/{tax_id}", response_model=CnpjCommercialLookupOut)
@limiter.limit("60/minute")
def lookup_cnpj_commercial(
    request: Request,
    tax_id: str,
    db: Annotated[Session, Depends(get_db)],
    _current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    full: Annotated[
        bool,
        Query(
            description="Se true, inclui o JSON completo da CNPJá (útil para NF e integrações).",
        ),
    ] = False,
) -> CnpjCommercialLookupOut:
    """Consulta comercial (api.cnpja.com) — Receita Federal + Cadastro de Contribuintes (registrations=ORIGIN)."""
    api_key = resolve_cnpja_api_key(db)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API CNPJá comercial não configurada. Cadastre a chave em Credenciais da plataforma (CNPJá) ou defina CNPJA_API_KEY.",
        )
    try:
        digits = normalize_cnpj_digits(tax_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    try:
        raw = fetch_office_commercial(digits, api_key)
    except CnpjaHttpError as exc:
        raise _http_error_from_cnpja(exc) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível contatar o serviço CNPJá.",
        ) from exc

    base = office_payload_to_lookup(raw, "commercial")
    if not base.company_name:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="CNPJ sem razão social na resposta da CNPJá.",
        )
    if base.tax_id != digits:
        base = base.model_copy(update={"tax_id": digits})
    return CnpjCommercialLookupOut(**base.model_dump(), full=raw if full else None)
