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
    get_cnpja_api_key,
    normalize_cnpj_digits,
    office_payload_to_lookup,
)
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


def _fetch_office_open_with_commercial_fallback(digits: str) -> tuple[dict, str]:
    """Tenta API pública; se falhar e houver CNPJA_API_KEY, tenta a comercial."""
    try:
        return fetch_office_open(digits), "open"
    except (CnpjaHttpError, OSError) as first:
        key = get_cnpja_api_key()
        if not key:
            raise first
        try:
            return fetch_office_commercial(digits, key), "commercial"
        except (CnpjaHttpError, OSError):
            raise first


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
            detail="Falha de autenticação na API CNPJá (verifique CNPJA_API_KEY).",
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

    out: CnpjLookupOut | None = None
    try:
        raw, src = _fetch_office_open_with_commercial_fallback(digits)
        out = office_payload_to_lookup(raw, src)  # type: ignore[arg-type]
    except (CnpjaHttpError, OSError):
        out = None

    if out is not None and out.company_name.strip():
        if out.tax_id != digits:
            out = out.model_copy(update={"tax_id": digits})
        return CnpjRegisterLookupOut(
            already_registered=False,
            registered_tenant_name=None,
            lookup=out,
        )

    try:
        br = fetch_brasilapi_cnpj(digits)
        out_b = brasilapi_json_to_lookup(br, digits)
        if out_b.company_name.strip():
            if out_b.tax_id != digits:
                out_b = out_b.model_copy(update={"tax_id": digits})
            return CnpjRegisterLookupOut(
                already_registered=False,
                registered_tenant_name=None,
                lookup=out_b,
            )
    except Exception:
        pass

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
def lookup_cnpj_open(request: Request, tax_id: str) -> CnpjLookupOut:
    """Consulta pública (open.cnpja.com), sem chave — ideal no cadastro. Limite agregado por IP do servidor."""
    try:
        digits = normalize_cnpj_digits(tax_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    try:
        raw = fetch_office_open(digits)
    except CnpjaHttpError as exc:
        raise _http_error_from_cnpja(exc) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível contatar o serviço CNPJá.",
        ) from exc

    out = office_payload_to_lookup(raw, "open")
    if not out.company_name:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="CNPJ sem razão social na resposta da CNPJá.",
        )
    if out.tax_id != digits:
        out = out.model_copy(update={"tax_id": digits})
    return out


@router.get("/commercial/{tax_id}", response_model=CnpjCommercialLookupOut)
@limiter.limit("60/minute")
def lookup_cnpj_commercial(
    request: Request,
    tax_id: str,
    _current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    full: Annotated[
        bool,
        Query(
            description="Se true, inclui o JSON completo da CNPJá (útil para NF e integrações).",
        ),
    ] = False,
) -> CnpjCommercialLookupOut:
    """Consulta comercial (api.cnpja.com) com CNPJA_API_KEY — dados mais completos / atualizados."""
    api_key = get_cnpja_api_key()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API CNPJá comercial não configurada. Defina CNPJA_API_KEY no ambiente do servidor.",
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
