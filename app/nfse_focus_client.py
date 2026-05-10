"""Cliente HTTP para NFSe **Nacional** via API Focus NFe (POST/GET ``/v2/nfsen``).

Documentação: `Focus NFe — NFSe <https://doc.focusnfe.com.br/reference/nfse>`_ e
`NFSe Nacional (campos) <https://campos.focusnfe.com.br/nfse_nacional/EmissaoDPSXml.html>`_.

Autenticação: HTTP Basic com usuário = token da empresa e senha vazia (mesmo padrão da documentação oficial).
"""

from __future__ import annotations

import base64
import json
import ssl
import time
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import quote, urlencode

FOCUS_HOMOLOG_BASE = "https://homologacao.focusnfe.com.br"
FOCUS_PROD_BASE = "https://api.focusnfe.com.br"


def focus_api_base(environment: str) -> str:
    """``homolog`` → homologação Focus; caso contrário produção."""

    env = (environment or "homolog").strip().lower()
    if env in ("homolog", "homologacao", "sandbox", "test"):
        return FOCUS_HOMOLOG_BASE
    return FOCUS_PROD_BASE


def _basic_auth_header(token: str) -> dict[str, str]:
    raw = f"{token.strip()}:".encode("utf-8")
    return {"Authorization": "Basic " + base64.b64encode(raw).decode("ascii")}


def _json_load(raw: str) -> dict[str, Any] | list[Any] | str:
    raw = raw.strip()
    if not raw:
        return {}
    try:
        out = json.loads(raw)
        return out if isinstance(out, (dict, list)) else {"raw": out}
    except json.JSONDecodeError:
        return {"raw_text": raw[:8000]}


def focus_request_json(
    *,
    method: str,
    url: str,
    token: str,
    body_dict: dict[str, Any] | None = None,
    timeout_sec: float = 120.0,
) -> tuple[int, dict[str, Any] | list[Any] | str]:
    """Executa requisição JSON na API Focus (HTTPS, sem certificado cliente)."""

    headers = {
        **_basic_auth_header(token),
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
    }
    data = None
    if body_dict is not None and method.upper() == "POST":
        data = json.dumps(body_dict, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout_sec) as resp:
            payload = resp.read().decode("utf-8", errors="replace")
            return resp.getcode(), _json_load(payload)
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        return exc.code, _json_load(payload)


def focus_post_nfsen(
    base_url: str,
    token: str,
    ref: str,
    payload: dict[str, Any],
    *,
    timeout_sec: float = 120.0,
) -> tuple[int, dict[str, Any] | list[Any] | str]:
    """POST ``/v2/nfsen?ref=...``."""

    q = urlencode({"ref": ref})
    url = f"{base_url.rstrip('/')}/v2/nfsen?{q}"
    return focus_request_json(method="POST", url=url, token=token, body_dict=payload, timeout_sec=timeout_sec)


def focus_get_nfsen(
    base_url: str,
    token: str,
    ref: str,
    *,
    completa: int = 1,
    timeout_sec: float = 60.0,
) -> tuple[int, dict[str, Any] | list[Any] | str]:
    """GET ``/v2/nfsen/{ref}``."""

    safe_ref = quote(ref, safe="")
    q = urlencode({"completa": completa})
    url = f"{base_url.rstrip('/')}/v2/nfsen/{safe_ref}?{q}"
    return focus_request_json(method="GET", url=url, token=token, body_dict=None, timeout_sec=timeout_sec)


def focus_top_status(body: Any) -> str:
    """Campo ``status`` típico das respostas Focus (autorizado, processando_autorizacao, …)."""

    if isinstance(body, dict):
        s = body.get("status")
        if s is not None:
            return str(s).strip().lower()
    return ""


def focus_error_summary(body: Any) -> str:
    """Monta mensagem legível a partir de JSON de erro Focus."""

    if isinstance(body, dict):
        msg = body.get("mensagem") or body.get("message")
        codigo = body.get("codigo") or body.get("status")
        if msg:
            return str(msg)[:1500]
        if codigo:
            return str(codigo)[:500]
        # erros em lista
        errs = body.get("erros")
        if isinstance(errs, list) and errs:
            parts = []
            for it in errs[:12]:
                if isinstance(it, dict):
                    parts.append(str(it.get("mensagem") or it.get("campo") or it))
                else:
                    parts.append(str(it))
            return "; ".join(parts)[:1500]
    return str(body)[:1500]


def focus_extract_authorized(body: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """Extrai número da NFS-e, código de verificação e chave quando ``status`` = autorizado."""

    def _pick(*keys: str) -> str | None:
        for k in keys:
            v = body.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
        return None

    num = _pick(
        "numero_nfse",
        "numero",
        "nNFSe",
        "numero_nfs",
        "nfse_numero",
    )
    ver = _pick(
        "codigo_verificacao",
        "codigo_verificacao_nfse",
        "cod_verificacao",
        "cVerif",
    )
    chave = _pick("chave_nfse", "chave_acesso", "chaveAcesso", "chNFSe")
    return num, ver, chave


def poll_nfsen_until_terminal(
    base_url: str,
    token: str,
    ref: str,
    *,
    initial_body: dict[str, Any] | None,
    max_attempts: int = 18,
    delay_sec: float = 2.0,
) -> tuple[int, dict[str, Any] | list[Any] | str]:
    """Após POST, consulta GET até status terminal ou esgotar tentativas."""

    last_code = 200
    last_body: dict[str, Any] | list[Any] | str = initial_body or {}

    if isinstance(initial_body, dict):
        st = focus_top_status(initial_body)
        if st in ("autorizado", "erro_autorizacao", "cancelado", "denegado"):
            return last_code, initial_body

    for attempt in range(max_attempts):
        code, body = focus_get_nfsen(base_url, token, ref)
        last_code = code
        last_body = body
        if isinstance(body, dict):
            st = focus_top_status(body)
            if st in ("autorizado", "erro_autorizacao", "cancelado", "denegado"):
                break
            if st not in ("processando_autorizacao", "em_processamento", "processando"):
                if attempt >= 3 and st in ("", "submitted"):
                    break
        time.sleep(delay_sec)

    return last_code, last_body
