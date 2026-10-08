"""Cliente HTTP mínimo para Asaas (sem httpx): conta, webhooks e cobranças futuras."""

from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.request
from typing import Any


def _base_url(*, sandbox: bool) -> str:
    return "https://sandbox.asaas.com/v3" if sandbox else "https://api.asaas.com/v3"


def asaas_api_json(
    method: str,
    path: str,
    *,
    api_key: str,
    sandbox: bool,
    json_body: dict[str, Any] | None = None,
    timeout: float = 35.0,
) -> tuple[bool, str | None, dict[str, Any] | list[Any] | None]:
    """
    Chama a API v3 Asaas. path começa com / (ex. /myAccount).
    Retorna (ok, erro_ou_none, body_json_dict_ou_list).
    """
    key = (api_key or "").strip()
    if not key:
        return False, "Chave de API ausente.", None

    url = f"{_base_url(sandbox=sandbox)}{path if path.startswith('/') else '/' + path}"
    data = None
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
    req = urllib.request.Request(url, method=method.upper(), data=data)
    req.add_header("access_token", key)
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")

    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
            if not raw.strip():
                return True, None, {}
            parsed: Any = json.loads(raw)
            return True, None, parsed
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8")
            err_json = json.loads(body) if body.strip() else {}
            errs = err_json.get("errors")
            if isinstance(errs, list) and errs:
                first = errs[0]
                if isinstance(first, dict) and first.get("description"):
                    return False, str(first["description"])[:500], None
        except Exception:
            pass
        return False, f"Asaas HTTP {e.code}.", None
    except urllib.error.URLError as e:
        return False, f"Rede Asaas: {e.reason!r}"[:500], None
    except TimeoutError:
        return False, "Tempo esgotado ao contatar o Asaas.", None
    except json.JSONDecodeError:
        return False, "Resposta JSON inválida do Asaas.", None


def test_asaas_api_key(api_key: str, *, sandbox: bool, timeout: float = 18.0) -> tuple[bool, str | None, dict[str, Any]]:
    ok, err, data = asaas_api_json("GET", "/myAccount", api_key=api_key, sandbox=sandbox, timeout=timeout)
    if not ok or data is None:
        return False, err or "Falha.", {}
    if not isinstance(data, dict):
        return False, "Resposta inválida do Asaas.", {}
    return True, None, data


def create_asaas_payment_webhook(
    *,
    api_key: str,
    sandbox: bool,
    url: str,
    auth_token: str,
    name: str = "Climaris ERP",
) -> tuple[bool, str | None, str | None]:
    """
    POST /webhooks. Retorna (ok, erro, webhook_id remoto).
    """
    body = {
        "name": name,
        "url": url,
        "enabled": True,
        "interrupted": False,
        "apiVersion": 3,
        "authToken": auth_token,
        "sendType": "NON_SEQUENTIALLY",
        "events": [
            "PAYMENT_RECEIVED",
            "PAYMENT_CONFIRMED",
            "PAYMENT_OVERDUE",
        ],
    }
    ok, err, data = asaas_api_json("POST", "/webhooks", api_key=api_key, sandbox=sandbox, json_body=body)
    if not ok or data is None:
        return False, err, None
    if isinstance(data, dict):
        wid = data.get("id")
        if wid:
            return True, None, str(wid)
    return False, "Resposta de webhook sem id.", None


def create_asaas_payment(
    *,
    api_key: str,
    sandbox: bool,
    customer_id: str,
    billing_type: str,
    value: float,
    due_date_iso: str,
    description: str,
    external_reference: str,
) -> tuple[bool, str | None, str | None, str | None]:
    """
    POST /payments.
    Retorna (ok, erro, payment_id, invoice_url|pix_qr_url).
    """
    body = {
        "customer": customer_id.strip(),
        "billingType": billing_type.strip().upper(),
        "value": float(value),
        "dueDate": due_date_iso,
        "description": description[:500],
        "externalReference": external_reference[:100],
    }
    ok, err, data = asaas_api_json("POST", "/payments", api_key=api_key, sandbox=sandbox, json_body=body)
    if not ok or data is None:
        return False, err, None, None
    if not isinstance(data, dict):
        return False, "Resposta inválida ao criar cobrança.", None, None
    pay_id = str(data.get("id") or "").strip() or None
    invoice_url = str(data.get("invoiceUrl") or "").strip() or None
    if not pay_id:
        return False, "Cobrança criada sem id.", None, invoice_url
    return True, None, pay_id, invoice_url


def get_asaas_payment_invoice_url(
    *,
    api_key: str,
    sandbox: bool,
    payment_id: str,
) -> tuple[bool, str | None, str | None]:
    """GET /payments/{id}. Retorna (ok, erro, invoice_url)."""
    pid = (payment_id or "").strip()
    if not pid:
        return False, "ID da cobrança ausente.", None
    ok, err, data = asaas_api_json("GET", f"/payments/{pid}", api_key=api_key, sandbox=sandbox)
    if not ok or data is None:
        return False, err, None
    if not isinstance(data, dict):
        return False, "Resposta inválida ao consultar cobrança.", None
    invoice_url = str(data.get("invoiceUrl") or data.get("bankSlipUrl") or "").strip() or None
    return True, None, invoice_url


def delete_asaas_webhook(*, api_key: str, sandbox: bool, webhook_id: str) -> tuple[bool, str | None]:
    """DELETE /webhooks/{id}. HTTP 404 conta como sucesso (já remoto)."""
    wid = (webhook_id or "").strip()
    if not wid:
        return True, None
    key = (api_key or "").strip()
    url = f"{_base_url(sandbox=sandbox)}/webhooks/{wid}"
    req = urllib.request.Request(url, method="DELETE")
    req.add_header("access_token", key)
    req.add_header("Accept", "application/json")
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=25.0, context=ctx):
            return True, None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return True, None
        try:
            body = e.read().decode("utf-8")
            err_json = json.loads(body) if body.strip() else {}
            errs = err_json.get("errors")
            if isinstance(errs, list) and errs:
                first = errs[0]
                if isinstance(first, dict) and first.get("description"):
                    return False, str(first["description"])[:500]
        except Exception:
            pass
        return False, f"Asaas HTTP {e.code} ao remover webhook."
    except urllib.error.URLError as e:
        return False, f"Rede: {e.reason!r}"[:500]
    except TimeoutError:
        return False, "Timeout ao remover webhook."


def account_label_from_my_account(payload: dict[str, Any]) -> str | None:
    name = (payload.get("name") or "").strip()
    if name:
        return name[:255]
    email = (payload.get("email") or "").strip()
    if email:
        return email[:255]
    return None
