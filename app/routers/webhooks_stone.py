"""Webhook público Pagar.me / Stone (POST sem JWT)."""

from __future__ import annotations

import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.finance_stone_webhook import process_stone_webhook_payload, resolve_stone_gateway_by_path_token

logger = logging.getLogger("erp.webhooks.stone")

router = APIRouter(prefix="/webhooks/stone", tags=["webhooks-stone"])


@router.post("/{path_token}")
async def receive_stone_webhook(
    path_token: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    row = resolve_stone_gateway_by_path_token(db, path_token)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")

    raw = await request.body()
    try:
        body = json.loads(raw.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON inválido.")

    if not isinstance(body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload inválido.")

    try:
        return process_stone_webhook_payload(db, row, body)
    except Exception:
        logger.exception("Stone webhook erro tenant=%s", row.tenant_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao processar.")
