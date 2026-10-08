"""Endpoint público para webhooks do Asaas (POST sem JWT)."""

from __future__ import annotations

import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.finance_asaas_webhook import process_asaas_webhook_payload
from app.security import decrypt_platform_secret
from models import FinanceGatewayProvider, TenantFinanceGateway

logger = logging.getLogger("erp.webhooks.asaas")

router = APIRouter(prefix="/webhooks/asaas", tags=["webhooks-asaas"])


def _compare_tokens(header_val: str | None, expected: str) -> bool:
    if not header_val or not expected:
        return False
    try:
        return secrets.compare_digest(header_val.strip(), expected.strip())
    except Exception:
        return False


@router.post("/{path_token}")
async def receive_asaas_webhook(
    path_token: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    token = (path_token or "").strip()
    if len(token) < 8:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")

    row = db.execute(
        select(TenantFinanceGateway).where(
            TenantFinanceGateway.provider == FinanceGatewayProvider.ASAAS,
            TenantFinanceGateway.asaas_webhook_path_token == token,
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")

    if not row.asaas_webhook_auth_encrypted:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Webhook não configurado.")

    try:
        expected_auth = decrypt_platform_secret(row.asaas_webhook_auth_encrypted)
    except Exception:
        logger.exception("Falha ao decifrar auth webhook tenant=%s", row.tenant_id)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Configuração inválida.")

    header_raw = request.headers.get("asaas-access-token") or request.headers.get("Asaas-Access-Token")
    if not _compare_tokens(header_raw, expected_auth):
        logger.warning("Webhook Asaas header inválido tenant=%s", row.tenant_id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON inválido.")

    if not isinstance(body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload inválido.")

    try:
        out = process_asaas_webhook_payload(db, row.tenant_id, body)
    except Exception:
        logger.exception("Erro ao processar webhook Asaas tenant=%s", row.tenant_id)
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Processamento falhou.")

    return out
