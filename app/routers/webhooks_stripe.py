"""Endpoint público para webhooks Stripe (POST sem JWT)."""

from __future__ import annotations

import logging
from typing import Annotated

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.stripe_credentials import resolve_stripe_credentials
from app.stripe_webhook import process_stripe_webhook_event

logger = logging.getLogger("erp.webhooks.stripe")

router = APIRouter(prefix="/webhooks/stripe", tags=["webhooks-stripe"])


@router.post("")
async def receive_stripe_webhook(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    creds = resolve_stripe_credentials(db)
    if creds is None or not creds.webhook_secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Webhook Stripe não configurado.")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cabeçalho stripe-signature ausente.")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, creds.webhook_secret)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload inválido.")
    except stripe.error.SignatureVerificationError:
        logger.warning("Webhook Stripe assinatura inválida")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Assinatura inválida.")

    try:
        event_data = event.to_dict() if hasattr(event, "to_dict") else event
        return process_stripe_webhook_event(db, event_data)
    except Exception:
        logger.exception("Erro ao processar webhook Stripe")
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Processamento falhou.")
