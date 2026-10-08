"""Webhook público Mercado Pago (POST sem JWT)."""

from __future__ import annotations

import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import mercadopago_webhook_signature_enforced
from app.database import get_db
from app.finance_mercadopago_webhook import process_mercadopago_webhook_payload, resolve_mercadopago_gateway_by_path_token
from app.mercadopago_webhook_signature import extract_notification_data_id, verify_mercadopago_webhook_x_signature
from app.security import decrypt_platform_secret

logger = logging.getLogger("erp.webhooks.mercadopago")

router = APIRouter(prefix="/webhooks/mercadopago", tags=["webhooks-mercadopago"])


@router.post("/{path_token}")
async def receive_mercadopago_webhook(
    path_token: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    row = resolve_mercadopago_gateway_by_path_token(db, path_token)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")

    if mercadopago_webhook_signature_enforced(gateway_sandbox=bool(row.mercadopago_sandbox)) and not (
        row.mercadopago_webhook_signature_secret_encrypted or ""
    ).strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Webhook Mercado Pago: assinatura obrigatória neste servidor, mas o segredo não está configurado "
                "no workspace. Em Contas e carteiras → Mercado Pago, salve o segredo de assinatura do painel do MP."
            ),
        )

    raw = await request.body()
    try:
        body = json.loads(raw.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON inválido.")

    if not isinstance(body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload inválido.")

    sec_enc = row.mercadopago_webhook_signature_secret_encrypted
    if sec_enc:
        try:
            secret_plain = decrypt_platform_secret(sec_enc)
        except Exception:
            logger.exception("MP webhook: falha ao decifrar segredo de assinatura tenant=%s", row.tenant_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Configuração de webhook inválida.",
            )
        data_id = extract_notification_data_id(query_params=request.query_params, body=body)
        x_sig = request.headers.get("x-signature")
        x_rid = request.headers.get("x-request-id")
        if not verify_mercadopago_webhook_x_signature(
            secret=secret_plain,
            x_signature=x_sig,
            x_request_id=x_rid,
            data_id=data_id,
        ):
            logger.warning(
                "MP webhook assinatura rejeitada tenant=%s data_id=%s has_sig=%s",
                row.tenant_id,
                data_id[:32] if data_id else "",
                bool(x_sig),
            )
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Assinatura inválida.")

    try:
        out = process_mercadopago_webhook_payload(db, row, body)
    except Exception:
        logger.exception("Erro ao processar webhook MP tenant=%s", row.tenant_id)
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Processamento falhou.")

    return out
