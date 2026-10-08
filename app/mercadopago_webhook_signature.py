"""Validação de x-signature nas notificações webhook do Mercado Pago (HMAC-SHA256)."""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import Any

logger = logging.getLogger("erp.finance.mp_webhook_sig")

# Tolerância de relógio para o campo `ts` do header (segundos).
_TS_SKEW_SEC = 3600


def parse_mercadopago_x_signature_header(x_signature: str | None) -> tuple[str | None, str | None]:
    """Extrai ts e v1 do header `ts=...,v1=...` (partes separadas por vírgula)."""
    if not x_signature or not str(x_signature).strip():
        return None, None
    ts_val: str | None = None
    v1_val: str | None = None
    for part in str(x_signature).split(","):
        kv = part.split("=", 1)
        if len(kv) != 2:
            continue
        key, value = kv[0].strip(), kv[1].strip()
        if key == "ts":
            ts_val = value
        elif key == "v1":
            v1_val = value
    return ts_val, v1_val


def _ts_within_skew(ts_raw: str | None) -> bool:
    if not ts_raw:
        return False
    try:
        ts_num = int(float(ts_raw.strip()))
    except (TypeError, ValueError):
        return True
    if ts_num > 10_000_000_000:
        ts_num = ts_num // 1000
    now = int(time.time())
    return abs(now - ts_num) <= _TS_SKEW_SEC


def mercadopago_webhook_manifest(*, data_id: str, x_request_id: str | None, ts: str | None) -> str:
    """Template oficial: id:{dataID};request-id:{xRequestId};ts:{ts};"""
    rid = (x_request_id or "").strip()
    tid = (ts or "").strip()
    did = (data_id or "").strip()
    return f"id:{did};request-id:{rid};ts:{tid};"


def verify_mercadopago_webhook_x_signature(
    *,
    secret: str,
    x_signature: str | None,
    x_request_id: str | None,
    data_id: str,
) -> bool:
    """
    Confere HMAC-SHA256 do manifest com o valor `v1` do header.
    `data_id` deve ser o mesmo usado pelo MP (query `data.id` ou corpo `data.id`).
    """
    ts, v1 = parse_mercadopago_x_signature_header(x_signature)
    if not ts or not v1:
        logger.info("MP x-signature: header incompleto")
        return False
    if not _ts_within_skew(ts):
        logger.info("MP x-signature: ts fora da tolerância")
        return False
    manifest = mercadopago_webhook_manifest(data_id=data_id, x_request_id=x_request_id, ts=ts)
    key = (secret or "").encode("utf-8")
    expected = hmac.new(key, msg=manifest.encode("utf-8"), digestmod=hashlib.sha256).hexdigest()
    try:
        return hmac.compare_digest(expected, v1.strip().lower())
    except (TypeError, ValueError):
        return False


def extract_notification_data_id(*, query_params: Any, body: dict[str, Any] | None) -> str:
    """Prioriza query `data.id` (documentação MP); fallback em body.data.id."""
    qid: str | None = None
    try:
        if hasattr(query_params, "get"):
            raw = query_params.get("data.id")
            if raw is not None and str(raw).strip():
                qid = str(raw).strip()
    except Exception:
        qid = None
    if qid:
        return qid
    if isinstance(body, dict):
        data = body.get("data")
        if isinstance(data, dict) and data.get("id") is not None:
            return str(data.get("id")).strip()
    return ""
