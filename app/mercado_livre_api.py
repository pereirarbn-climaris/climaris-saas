"""Cliente Mercado Libre (OAuth + API REST) — Brasil site MLB."""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


ML_API_ORIGIN = "https://api.mercadolibre.com"
ML_AUTH_BR = "https://auth.mercadolibre.com.br"


def mercado_livre_client_id() -> str:
    return os.getenv("MERCADO_LIVRE_CLIENT_ID", "").strip()


def mercado_livre_client_secret() -> str:
    return os.getenv("MERCADO_LIVRE_CLIENT_SECRET", "").strip()


def mercado_livre_redirect_uri() -> str:
    """Redirect OAuth (deve coincidir com o app cadastrado no Mercado Livre)."""
    raw = os.getenv("MERCADO_LIVRE_REDIRECT_URI", "").strip()
    if raw:
        return raw
    base = os.getenv("APP_PUBLIC_URL", "http://127.0.0.1:5173").strip().rstrip("/")
    return f"{base}/app/integrations/mercado-livre/callback"


def oauth_app_configured() -> bool:
    return bool(mercado_livre_client_id() and mercado_livre_client_secret())


def build_authorization_url(*, state: str | None = None) -> str:
    cid = mercado_livre_client_id()
    if not cid:
        raise RuntimeError("MERCADO_LIVRE_CLIENT_ID não configurado.")
    qs = urllib.parse.urlencode(
        {
            "response_type": "code",
            "client_id": cid,
            "redirect_uri": mercado_livre_redirect_uri(),
            **({"state": state} if state else {}),
        }
    )
    return f"{ML_AUTH_BR}/authorization?{qs}"


def _http_form_post(url: str, form: dict[str, str]) -> dict[str, Any]:
    data = urllib.parse.urlencode(form).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Erro OAuth Mercado Livre ({exc.code}): {err_body[:500]}") from exc
    try:
        out = json.loads(raw)
    except json.JSONDecodeError:
        raise RuntimeError("Resposta OAuth inválida.") from None
    if not isinstance(out, dict):
        raise RuntimeError("Resposta OAuth inválida (não é objeto).")
    return out


def exchange_authorization_code(code: str) -> dict[str, Any]:
    cid = mercado_livre_client_id()
    sec = mercado_livre_client_secret()
    if not cid or not sec:
        raise RuntimeError("Credenciais Mercado Livre não configuradas no servidor.")
    return _http_form_post(
        f"{ML_API_ORIGIN}/oauth/token",
        {
            "grant_type": "authorization_code",
            "client_id": cid,
            "client_secret": sec,
            "code": code.strip(),
            "redirect_uri": mercado_livre_redirect_uri(),
        },
    )


def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    cid = mercado_livre_client_id()
    sec = mercado_livre_client_secret()
    if not cid or not sec:
        raise RuntimeError("Credenciais Mercado Livre não configuradas no servidor.")
    return _http_form_post(
        f"{ML_API_ORIGIN}/oauth/token",
        {
            "grant_type": "refresh_token",
            "client_id": cid,
            "client_secret": sec,
            "refresh_token": refresh_token.strip(),
        },
    )


def _json_request(method: str, path: str, *, token: str | None = None, body: Any | None = None) -> Any:
    url = f"{ML_API_ORIGIN}{path}" if path.startswith("/") else f"{ML_API_ORIGIN}/{path}"
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload: bytes | None = None
    if body is not None and method.upper() != "GET":
        headers["Content-Type"] = "application/json"
        payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers, method=method.upper())
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=45, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API Mercado Livre ({exc.code}): {err_body[:800]}") from exc
    if not raw.strip():
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def api_get_my_user(access_token: str) -> dict[str, Any]:
    raw = _json_request("GET", "/users/me", token=access_token)
    if not isinstance(raw, dict):
        raise RuntimeError("Resposta inválida em /users/me.")
    return raw


def api_domain_discovery(site_id: str, q: str, limit: int = 12) -> list[dict[str, Any]]:
    qs = urllib.parse.urlencode({"q": q.strip(), "limit": str(limit)})
    raw = _json_request("GET", f"/sites/{site_id}/domain_discovery/search?{qs}", token=None)
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, dict):
        inner = raw.get("results") or raw.get("domains") or raw.get("items")
        if isinstance(inner, list):
            return [x for x in inner if isinstance(x, dict)]
    return []


def api_create_item(access_token: str, payload: dict[str, Any]) -> dict[str, Any]:
    raw = _json_request("POST", "/items", token=access_token, body=payload)
    if not isinstance(raw, dict):
        raise RuntimeError("Resposta inválida ao criar anúncio.")
    return raw


def api_get_item(access_token: str, item_id: str) -> dict[str, Any]:
    raw = _json_request("GET", f"/items/{urllib.parse.quote(item_id)}", token=access_token)
    if not isinstance(raw, dict):
        raise RuntimeError("Resposta inválida ao ler anúncio.")
    return raw


def api_put_item(access_token: str, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    raw = _json_request("PUT", f"/items/{urllib.parse.quote(item_id)}", token=access_token, body=payload)
    if not isinstance(raw, dict):
        raise RuntimeError("Resposta inválida ao atualizar anúncio.")
    return raw
