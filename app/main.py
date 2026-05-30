import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from typing import Annotated

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.responses import Response
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.exc import OperationalError, ProgrammingError, SQLAlchemyError

from app.config import (
    AI_ASSISTANT_V2_ENABLED,
    CORS_ORIGINS,
    MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE,
    PUBLIC_REGISTER_ENABLED,
    public_api_base_url,
)
from app.limiter import limiter
from app.middleware import MaxBodySizeMiddleware, RequestContextMiddleware
from app.routers.auth import router as auth_router
from app.routers.client_catalog_equipments import router as client_catalog_equipments_router
from app.routers.clients import router as clients_router
from app.routers.equipment_catalog import router as equipment_catalog_router
from app.routers.operacao_manuals import router as operacao_manuals_router
from app.routers.operacao_categories import router as operacao_categories_router
from app.routers.dashboard import router as dashboard_router
from app.routers.cep import router as cep_router
from app.routers.cnpj import router as cnpj_router
from app.routers.budgets import router as budgets_router
from app.routers.integrations_mercado_livre import router as integrations_mercado_livre_router
from app.routers.product_images import router as product_images_router
from app.routers.products import router as products_router
from app.routers.equipment_documents import router as equipment_documents_router
from app.routers.pmoc import router as pmoc_router
from app.routers.api_keys import router as api_keys_router
from app.routers.platform import router as platform_router
from app.routers.platform_finance_bank_catalog import router as platform_finance_bank_catalog_router
from app.routers.public_portal import equipment_token_router, router as public_portal_router
from app.routers.reports import router as reports_router
from app.routers.service_orders import router as service_orders_router
from app.routers.finance import router as finance_router
from app.routers.webhooks_asaas import router as webhooks_asaas_router
from app.routers.webhooks_mercadopago import router as webhooks_mercadopago_router
from app.routers.webhooks_stone import router as webhooks_stone_router
from app.routers.inventory import router as inventory_router
from app.routers.marketplace import router as marketplace_router
from app.routers.platform_marketplace import router as platform_marketplace_router
from app.routers.whatsapp import router as whatsapp_router
from app.routers.ai_settings import router as ai_settings_router
from app.routers.nfse import router as nfse_router
from app.routers.preventive_maintenance import router as preventive_maintenance_router
from app.routers.system import router as system_router
from app.routers.qrcodes import router as qrcodes_router
from app.routers.whatsapp_bot import router as whatsapp_bot_router
from app.routers.whatsapp_broadcast_campaigns import router as whatsapp_broadcast_campaigns_router
from app.routers.whatsapp_campaigns import router as whatsapp_campaigns_router
from app.campaign_scheduler import start_campaign_scheduler_worker, stop_campaign_scheduler_worker
from app.finance_recurring_scheduler import (
    start_finance_recurring_scheduler_worker,
    stop_finance_recurring_scheduler_worker,
)
from app.whatsapp_scheduler import start_whatsapp_reminder_worker, stop_whatsapp_reminder_worker

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", "").strip()

API_V1_PREFIX = "/api/v1"
# Limite de corpo HTTP (uploads multipart). Nginx também precisa client_max_body_size ≥ este valor.
MAX_HTTP_BODY_BYTES = int(os.getenv("MAX_HTTP_BODY_BYTES", str(100 * 1024 * 1024)))

app = FastAPI(title="ERP SaaS API", version="0.1.0")
app.state.limiter = limiter
if CORS_ORIGINS or CORS_ORIGIN_REGEX:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_origin_regex=CORS_ORIGIN_REGEX or None,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(MaxBodySizeMiddleware, max_body_size=MAX_HTTP_BODY_BYTES)
app.add_middleware(RequestContextMiddleware)

web_dir = Path(__file__).resolve().parent / "web"
app.mount("/web", StaticFiles(directory=web_dir), name="web")


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", None) or str(uuid4())


def _json_safe(value: object) -> object:
    """Converte estruturas arbitrárias para tipos serializáveis em JSON."""
    return json.loads(json.dumps(value, default=str))


@app.get("/health", tags=["health"])
def healthcheck(
    extended: Annotated[
        bool,
        Query(
            description="Se true, inclui campos extras (ex.: public_register_enabled, política MP). "
            "O formato padrão permanece só status + public_register_minimal (compatível com clientes antigos)."
        ),
    ] = False,
) -> dict[str, str | bool]:
    """Contrato estável: `status` + `public_register_minimal`. Use `?extended=true` para flags adicionais."""
    body: dict[str, str | bool] = {"status": "ok", "public_register_minimal": True}
    if extended:
        body["public_register_enabled"] = PUBLIC_REGISTER_ENABLED
        body["ai_assistant_v2_enabled"] = AI_ASSISTANT_V2_ENABLED
        body["api_public_base_url_configured"] = bool(public_api_base_url())
        body["mercadopago_webhook_signature_required"] = bool(MERCADOPAGO_WEBHOOK_REQUIRE_SIGNATURE)
    return body


@app.head("/health", tags=["health"], include_in_schema=False)
def healthcheck_head() -> Response:
    """Permite `curl -I` e monitors HEAD sem 405."""
    return Response(status_code=200)


@app.get("/healths.com.br/health", include_in_schema=False)
def health_typo_redirect() -> RedirectResponse:
    """Redireciona URL colada errada (domínio no meio do caminho) para `/health`."""
    return RedirectResponse(url="/health", status_code=308)


@app.get("/", include_in_schema=False)
def root_info() -> dict[str, str]:
    """SPA é servida pelo Nginx em produção; aqui só identificação da API (útil em :8000 direto)."""
    return {
        "service": "Climaris API",
        "health": "/health",
        "docs": "/docs",
        "api": "/api/v1",
    }


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    error_id = str(uuid4())
    rid = _request_id(request)
    err_logger = logging.getLogger("erp.errors")
    detail = exc.detail
    err_logger.warning(
        json.dumps(
            {
                "event": "http_exception",
                "request_id": rid,
                "error_id": error_id,
                "status_code": exc.status_code,
                "path": str(request.url.path),
                "message": detail if isinstance(detail, str) else str(detail),
            },
            default=str,
        )
    )
    message = detail if isinstance(detail, str) else str(detail)
    if exc.status_code == 413 and (
        not message
        or message == "Request Entity Too Large"
        or "entity too large" in message.lower()
    ):
        max_mb = MAX_HTTP_BODY_BYTES // (1024 * 1024)
        message = (
            f"Arquivo ou requisição excede o limite de {max_mb} MB. "
            "Reduza o PDF ou peça ao administrador para ajustar o Nginx (client_max_body_size)."
        )

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "id": error_id,
                "request_id": rid,
                "status_code": exc.status_code,
                "message": message,
                "path": str(request.url.path),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    error_id = str(uuid4())
    rid = _request_id(request)
    err_logger = logging.getLogger("erp.errors")
    field_errors = exc.errors()
    log_payload = {
        "event": "validation_error",
        "request_id": rid,
        "error_id": error_id,
        "path": str(request.url.path),
        "fields": field_errors,
    }
    if "/equipment-catalog" in str(request.url.path):
        err_logger.error(json.dumps(log_payload, default=str))
    else:
        err_logger.warning(json.dumps(log_payload, default=str))
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "id": error_id,
                "request_id": rid,
                "status_code": 422,
                "message": "Validation error.",
                "details": _json_safe(exc.errors()),
                "path": str(request.url.path),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        },
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    error_id = str(uuid4())
    rid = _request_id(request)
    err_logger = logging.getLogger("erp.errors")
    err_logger.warning(
        json.dumps(
            {
                "event": "rate_limited",
                "request_id": rid,
                "error_id": error_id,
                "path": str(request.url.path),
                "detail": exc.detail,
            },
            default=str,
        )
    )
    headers = dict(exc.headers) if exc.headers else {}
    return JSONResponse(
        status_code=429,
        headers=headers,
        content={
            "error": {
                "id": error_id,
                "request_id": rid,
                "status_code": 429,
                "message": "Rate limit exceeded.",
                "path": str(request.url.path),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        },
    )


@app.exception_handler(OperationalError)
async def db_operational_error_handler(request: Request, exc: OperationalError) -> JSONResponse:
    """Conexão com PostgreSQL indisponível ou recusada."""
    error_id = str(uuid4())
    rid = _request_id(request)
    logging.getLogger("erp.errors").exception(
        json.dumps(
            {
                "event": "db_operational",
                "request_id": rid,
                "error_id": error_id,
                "path": str(request.url.path),
            },
            default=str,
        ),
        exc_info=exc,
    )
    return JSONResponse(
        status_code=503,
        content={
            "error": {
                "id": error_id,
                "request_id": rid,
                "status_code": 503,
                "message": "Não foi possível conectar ao banco de dados. Verifique DATABASE_URL e se o PostgreSQL está no ar.",
                "path": str(request.url.path),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        },
    )


@app.exception_handler(ProgrammingError)
async def db_programming_error_handler(request: Request, exc: ProgrammingError) -> JSONResponse:
    """Esquema incompatível (ex.: migrações não aplicadas)."""
    error_id = str(uuid4())
    rid = _request_id(request)
    logging.getLogger("erp.errors").exception(
        json.dumps(
            {
                "event": "db_programming",
                "request_id": rid,
                "error_id": error_id,
                "path": str(request.url.path),
            },
            default=str,
        ),
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "id": error_id,
                "request_id": rid,
                "status_code": 500,
                "message": (
                    "Erro de esquema no banco (tabela/coluna ausente ou incompatível). "
                    "Na API, execute: alembic upgrade heads"
                ),
                "path": str(request.url.path),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        },
    )


@app.exception_handler(SQLAlchemyError)
async def db_sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    """Outros erros de persistência (ex.: IntegrityError). Operational/Programming já têm handlers específicos."""
    error_id = str(uuid4())
    rid = _request_id(request)
    logging.getLogger("erp.errors").exception(
        json.dumps(
            {
                "event": "db_sqlalchemy",
                "request_id": rid,
                "error_id": error_id,
                "path": str(request.url.path),
            },
            default=str,
        ),
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "id": error_id,
                "request_id": rid,
                "status_code": 500,
                "message": "Erro ao acessar o banco de dados.",
                "path": str(request.url.path),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Fallback: evita corpo só `detail: Internal Server Error` sem JSON útil para o front."""
    error_id = str(uuid4())
    rid = _request_id(request)
    logging.getLogger("erp.errors").exception(
        json.dumps(
            {
                "event": "unhandled_exception",
                "request_id": rid,
                "error_id": error_id,
                "path": str(request.url.path),
                "exc_type": type(exc).__name__,
            },
            default=str,
        ),
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "id": error_id,
                "request_id": rid,
                "status_code": 500,
                "message": (
                    "Erro interno inesperado no servidor. Tente de novo em instantes. "
                    "Se repetir, avise o suporte com o request_id desta resposta. "
                    "Em ambiente próprio, confira `docker compose logs api` e rode `alembic upgrade heads`."
                ),
                "path": str(request.url.path),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        },
    )


app.include_router(public_portal_router, prefix=API_V1_PREFIX)
app.include_router(auth_router, prefix=API_V1_PREFIX)
app.include_router(platform_router, prefix=API_V1_PREFIX)
app.include_router(platform_finance_bank_catalog_router, prefix=API_V1_PREFIX)
app.include_router(api_keys_router, prefix=API_V1_PREFIX)
app.include_router(cep_router, prefix=API_V1_PREFIX)
app.include_router(cnpj_router, prefix=API_V1_PREFIX)
app.include_router(clients_router, prefix=API_V1_PREFIX)
app.include_router(client_catalog_equipments_router, prefix=API_V1_PREFIX)
app.include_router(equipment_catalog_router, prefix=API_V1_PREFIX)
app.include_router(operacao_manuals_router, prefix=API_V1_PREFIX)
app.include_router(operacao_categories_router, prefix=API_V1_PREFIX)
app.include_router(dashboard_router, prefix=API_V1_PREFIX)
app.include_router(product_images_router, prefix=API_V1_PREFIX)
app.include_router(products_router, prefix=API_V1_PREFIX)
app.include_router(equipment_documents_router, prefix=API_V1_PREFIX)
app.include_router(pmoc_router, prefix=API_V1_PREFIX)
app.include_router(integrations_mercado_livre_router, prefix=API_V1_PREFIX)
app.include_router(service_orders_router, prefix=API_V1_PREFIX)
app.include_router(reports_router, prefix=API_V1_PREFIX)
app.include_router(equipment_token_router, prefix=API_V1_PREFIX)
app.include_router(budgets_router, prefix=API_V1_PREFIX)
app.include_router(finance_router, prefix=API_V1_PREFIX)
app.include_router(webhooks_asaas_router, prefix=API_V1_PREFIX)
app.include_router(webhooks_mercadopago_router, prefix=API_V1_PREFIX)
app.include_router(webhooks_stone_router, prefix=API_V1_PREFIX)
app.include_router(inventory_router, prefix=API_V1_PREFIX)
app.include_router(marketplace_router, prefix=API_V1_PREFIX)
app.include_router(platform_marketplace_router, prefix=API_V1_PREFIX)
app.include_router(whatsapp_router, prefix=API_V1_PREFIX)
app.include_router(ai_settings_router, prefix=API_V1_PREFIX)
app.include_router(nfse_router, prefix=API_V1_PREFIX)
app.include_router(preventive_maintenance_router, prefix=API_V1_PREFIX)
app.include_router(whatsapp_bot_router, prefix=API_V1_PREFIX)
app.include_router(whatsapp_broadcast_campaigns_router, prefix=API_V1_PREFIX)
app.include_router(whatsapp_campaigns_router, prefix=API_V1_PREFIX)
app.include_router(system_router, prefix=API_V1_PREFIX)
app.include_router(qrcodes_router, prefix=API_V1_PREFIX)


@app.on_event("startup")
def _startup_workers() -> None:
    start_whatsapp_reminder_worker()
    start_campaign_scheduler_worker()
    start_finance_recurring_scheduler_worker()
    try:
        from app.database import SessionLocal
        from app.finance_recurring_service import process_due_recurring_transactions
        from app.storage_integrity import run_startup_storage_validation

        db = SessionLocal()
        try:
            run_startup_storage_validation(db)
            process_due_recurring_transactions(db)
        finally:
            db.close()
    except Exception:
        logging.getLogger(__name__).exception("finance/storage startup hook failed")


@app.on_event("shutdown")
def _shutdown_workers() -> None:
    stop_whatsapp_reminder_worker()
    stop_campaign_scheduler_worker()
    stop_finance_recurring_scheduler_worker()
