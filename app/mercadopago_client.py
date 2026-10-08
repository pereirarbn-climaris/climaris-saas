"""Cliente HTTP mínimo para Mercado Pago (urllib, sem dependências extras)."""

from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

MP_API_BASE = "https://api.mercadopago.com"


def mercadopago_api_json(
    method: str,
    path: str,
    *,
    access_token: str,
    json_body: dict[str, Any] | None = None,
    timeout: float = 25.0,
) -> tuple[bool, str | None, dict[str, Any] | list[Any] | None]:
    token = (access_token or "").strip()
    if not token:
        return False, "Access Token ausente.", None
    p = path if path.startswith("/") else f"/{path}"
    url = f"{MP_API_BASE}{p}"
    data = None
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
    req = urllib.request.Request(url, method=method.upper(), data=data)
    req.add_header("Authorization", f"Bearer {token}")
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
            msg = err_json.get("message") or err_json.get("error")
            if isinstance(msg, str) and msg.strip():
                return False, str(msg).strip()[:500], None
            errs = err_json.get("cause")
            if isinstance(errs, list) and errs:
                first = errs[0]
                if isinstance(first, dict) and first.get("description"):
                    return False, str(first["description"])[:500], None
        except Exception:
            pass
        return False, f"Mercado Pago HTTP {e.code}.", None
    except urllib.error.URLError as e:
        return False, f"Rede Mercado Pago: {e.reason!r}"[:500], None
    except TimeoutError:
        return False, "Tempo esgotado ao contatar o Mercado Pago.", None
    except json.JSONDecodeError:
        return False, "Resposta JSON inválida do Mercado Pago.", None


def _mp_user_payload(access_token: str, timeout: float) -> tuple[bool, str | None, dict[str, Any]]:
    """Valida credenciais. Tenta /users/me (documentação oficial) e /v1/me."""
    for path in ("/users/me", "/v1/me"):
        ok, err, data = mercadopago_api_json("GET", path, access_token=access_token, timeout=timeout)
        if ok and isinstance(data, dict) and (data.get("id") is not None or data.get("user_id") is not None):
            return True, None, data
        if ok and isinstance(data, dict):
            return True, None, data
    return False, err or "Não foi possível validar o Access Token.", {}


def test_mercadopago_access_token(access_token: str, *, timeout: float = 18.0) -> tuple[bool, str | None, dict[str, Any]]:
    ok, err, data = _mp_user_payload(access_token, timeout)
    if not ok or not isinstance(data, dict):
        return False, err or "Token inválido.", {}
    uid = data.get("id") if data.get("id") is not None else data.get("user_id")
    if uid is None:
        return False, "Resposta do Mercado Pago sem identificador de usuário.", {}
    return True, None, data


def account_label_from_mp_user(payload: dict[str, Any]) -> str | None:
    nick = (payload.get("nickname") or "").strip()
    if nick:
        return nick[:255]
    email = (payload.get("email") or "").strip()
    if email:
        return email[:255]
    first = (payload.get("first_name") or "").strip()
    last = (payload.get("last_name") or "").strip()
    full = f"{first} {last}".strip()
    if full:
        return full[:255]
    return None


def mp_user_id_str(payload: dict[str, Any]) -> str | None:
    uid = payload.get("id") if payload.get("id") is not None else payload.get("user_id")
    if uid is None:
        return None
    return str(uid).strip()[:64] or None


def fetch_mercadopago_payment(*, access_token: str, payment_id: str, timeout: float = 25.0) -> tuple[bool, str | None, dict[str, Any] | None]:
    pid = (payment_id or "").strip()
    if not pid:
        return False, "ID do pagamento ausente.", None
    ok, err, data = mercadopago_api_json("GET", f"/v1/payments/{pid}", access_token=access_token, timeout=timeout)
    if not ok or not isinstance(data, dict):
        return False, err or "Falha ao consultar pagamento.", None
    return True, None, data


def fetch_mercadopago_merchant_order(*, access_token: str, order_id: str, timeout: float = 25.0) -> tuple[bool, str | None, dict[str, Any] | None]:
    oid = str(order_id or "").strip()
    if not oid:
        return False, "ID do pedido (merchant_order) ausente.", None
    ok, err, data = mercadopago_api_json("GET", f"/merchant_orders/{oid}", access_token=access_token, timeout=timeout)
    if not ok or not isinstance(data, dict):
        return False, err or "Falha ao consultar merchant_order.", None
    return True, None, data


def search_mercadopago_payments_by_external_reference(
    *, access_token: str, external_reference: str, timeout: float = 25.0
) -> tuple[bool, str | None, list[dict[str, Any]]]:
    """
    GET /v1/payments/search — fallback quando merchant_order não lista payments.
    Documentação: sort=date_created&criteria=desc&external_reference=...
    """
    ref = (external_reference or "").strip()
    if not ref:
        return False, "external_reference ausente.", []
    enc = urllib.parse.quote(ref, safe="")
    path = (
        "/v1/payments/search?sort=date_created&criteria=desc"
        f"&external_reference={enc}"
    )
    ok, err, data = mercadopago_api_json("GET", path, access_token=access_token, timeout=timeout)
    if not ok or not isinstance(data, dict):
        return False, err or "Falha na busca de pagamentos.", []
    raw = data.get("results")
    if not isinstance(raw, list):
        return True, None, []
    out: list[dict[str, Any]] = [p for p in raw if isinstance(p, dict) and p.get("id") is not None]
    return True, None, out


def fetch_mercadopago_account_balance(*, access_token: str, user_id: str, timeout: float = 18.0) -> tuple[bool, str | None, float | None]:
    """Tenta obter saldo disponível na conta MP (melhor esforço)."""
    uid = (user_id or "").strip()
    if not uid:
        return True, None, None
    paths = (
        f"/users/{uid}/mercadopago_account/balance",
        f"/v1/accounts/{uid}/balance",
    )
    for path in paths:
        ok, err, data = mercadopago_api_json("GET", path, access_token=access_token, timeout=timeout)
        if not ok or not isinstance(data, dict):
            continue
        for key in ("total_amount", "available_balance", "available_money", "total", "available"):
            raw = data.get(key)
            if raw is not None:
                try:
                    return True, None, float(raw)
                except (TypeError, ValueError):
                    continue
    return True, None, None


def create_mercadopago_pix_payment(
    *,
    access_token: str,
    transaction_amount: float,
    description: str,
    external_reference: str,
    payer_email: str,
    payer_first_name: str | None,
    payer_last_name: str | None,
    notification_url: str | None,
    metadata_entry_id: int | None,
    timeout: float = 35.0,
) -> tuple[bool, str | None, dict[str, Any] | None]:
    """POST /v1/payments com payment_method_id=pix."""
    payer: dict[str, Any] = {"email": (payer_email or "").strip()}
    fn = (payer_first_name or "").strip()
    ln = (payer_last_name or "").strip()
    if fn:
        payer["first_name"] = fn[:40]
    if ln:
        payer["last_name"] = ln[:40]

    body: dict[str, Any] = {
        "transaction_amount": round(float(transaction_amount), 2),
        "description": (description or "Pagamento").strip()[:255] or "Pagamento",
        "payment_method_id": "pix",
        "payer": payer,
        "external_reference": (external_reference or "").strip()[:256],
        "binary_mode": True,
    }
    if notification_url and notification_url.strip():
        body["notification_url"] = notification_url.strip()[:500]
    if metadata_entry_id is not None:
        body["metadata"] = {"climaris_finance_entry_id": str(metadata_entry_id)}

    ok, err, data = mercadopago_api_json("POST", "/v1/payments", access_token=access_token, json_body=body, timeout=timeout)
    if not ok or not isinstance(data, dict):
        return False, err or "Falha ao criar pagamento PIX.", None
    return True, None, data


def create_mercadopago_boleto_payment(
    *,
    access_token: str,
    transaction_amount: float,
    description: str,
    external_reference: str,
    payer_email: str,
    payer_first_name: str | None,
    payer_last_name: str | None,
    payer_cpf_digits: str,
    date_of_expiration: str,
    notification_url: str | None,
    metadata_entry_id: int | None,
    timeout: float = 35.0,
) -> tuple[bool, str | None, dict[str, Any] | None]:
    """POST /v1/payments com payment_method_id=bolbradesco (boleto bancário BR)."""
    cpf = "".join(c for c in str(payer_cpf_digits or "") if c.isdigit())
    if len(cpf) != 11:
        return False, "CPF do pagador deve ter 11 dígitos.", None
    payer: dict[str, Any] = {
        "email": (payer_email or "").strip(),
        "identification": {"type": "CPF", "number": cpf},
    }
    fn = (payer_first_name or "").strip()
    ln = (payer_last_name or "").strip()
    if fn:
        payer["first_name"] = fn[:40]
    if ln:
        payer["last_name"] = ln[:40]

    body: dict[str, Any] = {
        "transaction_amount": round(float(transaction_amount), 2),
        "description": (description or "Pagamento").strip()[:255] or "Pagamento",
        "payment_method_id": "bolbradesco",
        "payer": payer,
        "external_reference": (external_reference or "").strip()[:256],
        "date_of_expiration": (date_of_expiration or "").strip()[:40],
    }
    if notification_url and notification_url.strip():
        body["notification_url"] = notification_url.strip()[:500]
    if metadata_entry_id is not None:
        body["metadata"] = {"climaris_finance_entry_id": str(metadata_entry_id)}

    ok, err, data = mercadopago_api_json("POST", "/v1/payments", access_token=access_token, json_body=body, timeout=timeout)
    if not ok or not isinstance(data, dict):
        return False, err or "Falha ao criar boleto no Mercado Pago.", None
    return True, None, data


def mercadopago_payment_pix_urls(data: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """payment_id, ticket_url, pix_copy_paste (qr_code string)."""
    pid = str(data.get("id") or "").strip() or None
    ticket_url: str | None = None
    qr_code: str | None = None
    poi = data.get("point_of_interaction")
    if isinstance(poi, dict):
        td = poi.get("transaction_data")
        if isinstance(td, dict):
            ticket_url = str(td.get("ticket_url") or "").strip() or None
            qr_code = str(td.get("qr_code") or "").strip() or None
    return pid, ticket_url, qr_code


def mercadopago_payment_boleto_urls(data: dict[str, Any]) -> tuple[str | None, str | None]:
    """payment_id, ticket_url (PDF do boleto em transaction_data, mesmo padrão do PIX)."""
    pid, ticket_url, _qr = mercadopago_payment_pix_urls(data)
    return pid, ticket_url


def create_mercadopago_checkout_preference(
    *,
    access_token: str,
    title: str,
    unit_price: float,
    external_reference: str,
    notification_url: str | None,
    payer_email: str | None,
    success_url: str | None,
    failure_url: str | None,
    pending_url: str | None,
    metadata: dict[str, str] | None,
    auto_recurring: dict[str, Any] | None = None,
    timeout: float = 35.0,
) -> tuple[bool, str | None, dict[str, Any] | None]:
    """POST /checkout/preferences (Checkout Pro / link / assinatura com auto_recurring)."""
    price = round(float(unit_price), 2)
    if price <= 0:
        return False, "Valor da cobrança deve ser maior que zero.", None
    item: dict[str, Any] = {
        "title": (title or "Pagamento").strip()[:256] or "Pagamento",
        "quantity": 1,
        "unit_price": price,
        "currency_id": "BRL",
    }
    body: dict[str, Any] = {
        "items": [item],
        "external_reference": (external_reference or "").strip()[:256],
    }
    if notification_url and notification_url.strip():
        body["notification_url"] = notification_url.strip()[:500]
    if payer_email and payer_email.strip():
        body["payer"] = {"email": payer_email.strip()[:120]}
    back: dict[str, str] = {}
    if success_url and success_url.strip():
        back["success"] = success_url.strip()[:400]
    if failure_url and failure_url.strip():
        back["failure"] = failure_url.strip()[:400]
    if pending_url and pending_url.strip():
        back["pending"] = pending_url.strip()[:400]
    if back:
        body["back_urls"] = back
        if "success" in back:
            body["auto_return"] = "approved"
    if metadata:
        body["metadata"] = {k: str(v)[:128] for k, v in metadata.items() if v is not None}
    if auto_recurring:
        body["auto_recurring"] = auto_recurring

    ok, err, data = mercadopago_api_json(
        "POST", "/checkout/preferences", access_token=access_token, json_body=body, timeout=timeout
    )
    if not ok or not isinstance(data, dict):
        return False, err or "Falha ao criar preferência de checkout.", None
    return True, None, data


def mercadopago_preference_checkout_urls(data: dict[str, Any]) -> dict[str, str | None]:
    """Extrai ids e URLs da resposta de POST /checkout/preferences."""
    pref_id = str(data.get("id") or "").strip() or None
    init_point = str(data.get("init_point") or "").strip() or None
    sandbox_point = str(data.get("sandbox_init_point") or "").strip() or None
    return {
        "preference_id": pref_id,
        "init_point": init_point,
        "sandbox_init_point": sandbox_point,
    }


def mercadopago_preference_redirect_url(preference_id: str, *, sandbox: bool) -> str | None:
    """URL de redirecionamento ao checkout a partir do id da preferência (melhor esforço, BR/sandbox)."""
    pref = (preference_id or "").strip()
    if not pref:
        return None
    enc = urllib.parse.quote(pref, safe="")
    host = "https://sandbox.mercadopago.com.br" if sandbox else "https://www.mercadopago.com.br"
    return f"{host}/checkout/v1/redirect?pref_id={enc}"


def fetch_mercadopago_preapproval(
    *, access_token: str, preapproval_id: str, timeout: float = 25.0
) -> tuple[bool, str | None, dict[str, Any] | None]:
    """GET /preapproval/{id} — assinatura (checkout com auto_recurring)."""
    pid = (preapproval_id or "").strip()
    if not pid:
        return False, "ID da assinatura (preapproval) ausente.", None
    ok, err, data = mercadopago_api_json("GET", f"/preapproval/{pid}", access_token=access_token, timeout=timeout)
    if ok and isinstance(data, dict):
        return True, None, data
    return False, err or "Falha ao consultar preapproval.", None
