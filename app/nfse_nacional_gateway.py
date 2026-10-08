"""Envio opcional da NFS-e nacional via gateway HTTP (homologação / integração própria).

Defina NFSE_NACIONAL_GATEWAY_URL com a URL base que aceita POST JSON (corpo = payload interno da emissão).
Se a resposta JSON incluir `"authorized": true` e opcionalmente `nfse_number`, `verification_code`, o emissor marca como emitida.

Sem variável de ambiente, a emissão permanece em Pendente envio (fila interna).
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)


def try_submit_via_gateway(request_payload: dict[str, Any]) -> tuple[bool, dict[str, Any], str | None]:
    """POST JSON para NFSE_NACIONAL_GATEWAY_URL. Retorna (sucesso_autorização, response_body, erro)."""
    url = (os.getenv("NFSE_NACIONAL_GATEWAY_URL") or "").strip()
    if not url:
        return False, {}, None
    body = json.dumps(request_payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        logger.warning("Gateway NFS-e nacional HTTP %s: %s", exc.code, err_body[:500])
        return False, {"http_status": exc.code, "body": err_body}, err_body or str(exc)
    except Exception as exc:
        logger.exception("Falha ao chamar gateway NFS-e nacional")
        return False, {}, str(exc)

    ok = bool(isinstance(data, dict) and data.get("authorized") is True)
    return ok, data if isinstance(data, dict) else {"raw": data}, None
