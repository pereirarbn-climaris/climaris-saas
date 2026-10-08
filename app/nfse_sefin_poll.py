"""Polling GET /dps/{id} no ADN após POST /dps quando o processamento ainda não retornou NFS-e autorizada."""

from __future__ import annotations

import os
import ssl
import time
from typing import Any

from app.nfse_sefin_client import get_dps_resource
from app.nfse_sefin_response import SefinDpsInterpretation, interpret_sefin_dps_response


def poll_nfse_dps_processing(
    ssl_ctx: ssl.SSLContext,
    base_url: str,
    *,
    dps_id: str,
    mei_environment: str,
) -> tuple[SefinDpsInterpretation, list[dict[str, Any]], dict[str, Any] | None]:
    """GET repetidos em `/dps/{id}` até autorização, rejeição clara ou esgotar tentativas.

    O `dps_id` é o atributo Id de ``infDPS`` (espelha o manual nacional).
    """

    max_attempts = max(1, int(os.getenv("NFSE_SEFIN_POLL_MAX_ATTEMPTS", "15")))
    delay_sec = max(0.3, float(os.getenv("NFSE_SEFIN_POLL_DELAY_SEC", "2")))
    # Primeiros GET podem retornar 404 até o ADN indexar a DPS (comum em homologação).
    max_soft_404 = max(0, min(max_attempts, int(os.getenv("NFSE_SEFIN_POLL_404_SOFT_MAX", "10"))))
    trace: list[dict[str, Any]] = []
    last_json: dict[str, Any] | None = None
    consec_404 = 0

    pending_fallback = SefinDpsInterpretation(
        success=False,
        pending_protocol_only=True,
        error_message=None,
        nfse_number=None,
        verification_code=None,
        access_key=None,
        municipal_code=None,
    )

    for attempt in range(max_attempts):
        http_code, body = get_dps_resource(
            ssl_ctx,
            base_url,
            dps_id,
            mei_environment=mei_environment,
        )
        if isinstance(body, dict):
            last_json = body
            inter = interpret_sefin_dps_response(http_code, body)
        else:
            inter = interpret_sefin_dps_response(http_code, body)

        if http_code == 404:
            consec_404 += 1
        else:
            consec_404 = 0

        trace.append(
            {
                "attempt": attempt + 1,
                "http_status": http_code,
                "pending": inter.pending_protocol_only,
                "success": inter.success,
                "error": inter.error_message,
                "consecutive_404": consec_404,
            }
        )

        if inter.success:
            return inter, trace, last_json

        # Não falhar no primeiro 404: pode ser atraso do ADN após o POST /dps.
        if (
            http_code == 404
            and consec_404 <= max_soft_404
            and attempt < max_attempts - 1
        ):
            trace[-1]["retry_after_404"] = True
            time.sleep(delay_sec)
            continue

        if not inter.pending_protocol_only:
            return inter, trace, last_json if isinstance(body, dict) else None

        if attempt < max_attempts - 1:
            time.sleep(delay_sec)

    return pending_fallback, trace, last_json
