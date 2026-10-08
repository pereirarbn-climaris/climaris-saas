"""HTTP para Sefin Nacional (emissão) e ADN (consultas) — Sistema Nacional NFS-e.

Referências úteis (evento técnico / POC): Swagger restrito de contribuintes ISSQN
https://www.producaorestrita.nfse.gov.br/swagger/contribuintesissqn/
e repositório de exemplo https://github.com/nfe/poc-nfse-nacional (endpoints alinhados ao manual).

- **Emissão DPS (POST):** host **Sefin** + ``/SefinNacional/nfse`` com JSON ``dpsXmlGZipB64``
  (referência: ``pedrocasado/nfse-php``). Não usar o host ``adn.*`` para POST — costuma retornar 404.
- **Consulta DPS / polling (GET):** host **ADN** + ``NFSE_SEFIN_DPS_PATH`` (padrão ``/dps/{id}``).
- Ambientes: produção restrita vs produção — variáveis ``NFSE_EMIT_*`` e ``NFSE_ADN_*`` (ou legado ``NFSE_SEFIN_BASE_URL*`` só para ADN).
"""

from __future__ import annotations

import base64
import gzip
import json
import logging
import os
import socket
import ssl
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import quote, urlparse

logger = logging.getLogger(__name__)

# Sefin Nacional — envio da DPS (POST JSON). Espelha nfse-php ENDPOINT_* .
DEFAULT_EMIT_HOMOLOG = "https://sefin.producaorestrita.nfse.gov.br"
DEFAULT_EMIT_PROD = "https://sefin.nfse.gov.br"

# ADN — consulta GET da DPS / distribuição (não é o mesmo host do POST de emissão).
DEFAULT_ADN_HOMOLOG = "https://adn.producaorestrita.nfse.gov.br"
DEFAULT_ADN_PROD = "https://adn.nfse.gov.br"


def emit_base_url(mei_environment: str) -> str:
    """Base HTTPS do **Sefin Nacional** para POST da DPS (emitir NFS-e)."""

    if mei_environment == "producao":
        return (os.getenv("NFSE_EMIT_BASE_URL_PROD") or os.getenv("NFSE_SEFIN_EMIT_BASE_URL") or DEFAULT_EMIT_PROD).rstrip(
            "/"
        )
    return (
        os.getenv("NFSE_EMIT_BASE_URL_HOMOLOG") or os.getenv("NFSE_SEFIN_EMIT_BASE_URL_HOMOLOG") or DEFAULT_EMIT_HOMOLOG
    ).rstrip("/")


def adn_base_url(mei_environment: str) -> str:
    """Base HTTPS do **ADN** para GET de DPS / consultas (não para POST de emissão)."""

    if mei_environment == "producao":
        return (os.getenv("NFSE_ADN_BASE_URL_PROD") or os.getenv("NFSE_SEFIN_BASE_URL") or DEFAULT_ADN_PROD).rstrip("/")
    return (
        os.getenv("NFSE_ADN_BASE_URL_HOMOLOG") or os.getenv("NFSE_SEFIN_BASE_URL_HOMOLOG") or DEFAULT_ADN_HOMOLOG
    ).rstrip("/")


def sefin_base_url(mei_environment: str) -> str:
    """Compatibilidade: retorna a base do **ADN** (o código antigo usava um único host).

    Prefira ``adn_base_url`` / ``emit_base_url`` explicitamente.
    """

    return adn_base_url(mei_environment)


def emit_dps_url(base_url: str) -> str:
    """URL completa para POST de envio da DPS no Sefin Nacional."""

    path = (os.getenv("NFSE_SEFIN_EMIT_PATH") or "/SefinNacional/nfse").strip()
    if not path.startswith("/"):
        path = "/" + path
    return f"{base_url.rstrip('/')}{path}"


def dps_resource_url(base_url: str, dps_id: str) -> str:
    """GET DPS no ADN — id URL-encoded (atributo Id de infDPS)."""

    prefix = (os.getenv("NFSE_SEFIN_DPS_PATH") or "/dps").strip()
    if not prefix.startswith("/"):
        prefix = "/" + prefix
    enc = quote(dps_id.strip(), safe="")
    return f"{base_url.rstrip('/')}{prefix}/{enc}"


def nfse_by_chave_url(base_url: str, chave_acesso: str) -> str:
    """Monta URL para consulta da NFS-e pela chave de acesso.

    NFSE_SEFIN_STATUS_PATH pode ser um template, ex.: /nfse/{chaveAcesso}
    """

    chave = "".join(c for c in chave_acesso if c.isdigit()) or chave_acesso.strip()
    template = (os.getenv("NFSE_SEFIN_STATUS_PATH") or "/nfse/v1/nfse/{chaveAcesso}").strip()
    if "{chaveAcesso}" in template:
        path = template.replace("{chaveAcesso}", quote(chave, safe=""))
    else:
        path = f"{template.rstrip('/')}/{quote(chave, safe='')}"
    if path.startswith("http"):
        return path
    if not path.startswith("/"):
        path = "/" + path
    return f"{base_url.rstrip('/')}{path}"


def ping_sefin_mtls(ssl_ctx: ssl.SSLContext, base_url: str, *, timeout: float = 30.0) -> tuple[bool, str]:
    """Handshake TLS com certificado cliente no host da URL base (sem emitir DPS)."""

    parsed = urlparse(base_url if "://" in base_url else f"https://{base_url}")
    host = parsed.hostname
    if not host:
        return False, "URL base do ADN/Sefin inválida."
    port = parsed.port or 443
    raw_sock: socket.socket | None = None
    tls_sock: ssl.SSLSocket | None = None
    try:
        raw_sock = socket.create_connection((host, port), timeout=timeout)
        tls_sock = ssl_ctx.wrap_socket(raw_sock, server_hostname=host)
        ver = tls_sock.version() or "TLS"
        cipher = tls_sock.cipher()
        cipher_txt = f"{cipher[0]}" if cipher else ""
        return True, f"Conexão mTLS OK com {host}:{port} ({ver}{', ' + cipher_txt if cipher_txt else ''})."
    except ssl.SSLError as exc:
        return False, f"Falha TLS/mTLS: {exc}"
    except OSError as exc:
        return False, f"Rede ou timeout: {exc}"
    finally:
        try:
            if tls_sock:
                tls_sock.close()
            elif raw_sock:
                raw_sock.close()
        except OSError:
            pass


def _tp_amb_header(mei_environment: str) -> str:
    return "1" if mei_environment == "producao" else "2"


def get_dps_resource(
    ssl_ctx: ssl.SSLContext,
    base_url: str,
    dps_id: str,
    *,
    mei_environment: str,
    timeout: float = 90.0,
) -> tuple[int, dict[str, Any] | str]:
    """GET recurso da DPS (processamento assíncrono — usar para polling)."""

    url = dps_resource_url(base_url, dps_id)
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "tpAmb": _tp_amb_header(mei_environment),
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            code = resp.getcode()
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        logger.warning("ADN GET DPS HTTP %s: %s", exc.code, raw[:800])
        try:
            return exc.code, json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            return exc.code, raw
    except Exception as exc:
        logger.exception("Falha de rede no GET /dps/{id}")
        return 0, str(exc)

    try:
        return code, json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return code, raw


def get_nfse_by_chave_accesso(
    ssl_ctx: ssl.SSLContext,
    base_url: str,
    chave_acesso: str,
    *,
    mei_environment: str,
    timeout: float = 90.0,
) -> tuple[int, dict[str, Any] | str]:
    """GET NFS-e pela chave de acesso (path definido por NFSE_SEFIN_STATUS_PATH)."""

    url = nfse_by_chave_url(base_url, chave_acesso)
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "tpAmb": _tp_amb_header(mei_environment),
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            code = resp.getcode()
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        logger.warning("ADN GET NFS-e por chave HTTP %s: %s", exc.code, raw[:800])
        try:
            return exc.code, json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            return exc.code, raw
    except Exception as exc:
        logger.exception("Falha de rede na consulta NFS-e por chave")
        return 0, str(exc)

    try:
        return code, json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return code, raw


def post_dps_nfse(
    signed_xml: str,
    ssl_ctx: ssl.SSLContext,
    base_url: str,
    mei_environment: str,
) -> tuple[int, dict[str, Any] | str]:
    """POST envio da DPS (corpo JSON com dpsXmlGZipB64 — alinhado ao padrão nacional compactado)."""

    if not (signed_xml or "").strip():
        logger.error("Sefin POST DPS abortado: XML assinado vazio.")
        return 0, "XML assinado vazio (assinatura não gerou conteúdo)."

    payload = {"dpsXmlGZipB64": base64.b64encode(gzip.compress(signed_xml.encode("utf-8"))).decode("ascii")}
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    url = emit_dps_url(base_url)
    hdrs = {
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
        "tpAmb": _tp_amb_header(mei_environment),
    }
    if os.getenv("NFSE_SEFIN_DEBUG", "").strip().lower() in ("1", "true", "yes", "on"):
        logger.info(
            "Sefin Nacional POST pré-envio: url=%s headers=%s json_body_bytes=%s",
            url,
            hdrs,
            len(body),
        )
    req = urllib.request.Request(url, data=body, headers=hdrs, method="POST")
    try:
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=120) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            code = resp.getcode()
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        logger.warning("Sefin POST DPS HTTP %s url=%s: %s", exc.code, url, raw[:800])
        try:
            return exc.code, json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            return exc.code, raw
    except Exception as exc:
        logger.exception("Falha de rede ao enviar DPS ao Sefin Nacional")
        return 0, str(exc)

    try:
        return code, json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return code, raw
