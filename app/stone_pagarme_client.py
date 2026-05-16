"""Cliente HTTP mínimo Pagar.me Core v5 (Stone / conta com chave secreta sk_*)."""

from __future__ import annotations

import base64
import json
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from typing import Any

PAGARME_API_BASE = "https://api.pagar.me/core/v5"


def _basic_auth_header(secret_key: str) -> str:
    raw = f"{secret_key.strip()}:"
    return "Basic " + base64.b64encode(raw.encode("utf-8")).decode("ascii")


def pagarme_api_json(
    method: str,
    path: str,
    *,
    secret_key: str,
    json_body: dict[str, Any] | None = None,
    timeout: float = 25.0,
) -> tuple[bool, str | None, dict[str, Any] | list[Any] | None]:
    sk = (secret_key or "").strip()
    if not sk:
        return False, "Chave secreta ausente.", None
    p = path if path.startswith("/") else f"/{path}"
    url = f"{PAGARME_API_BASE}{p}"
    data = None
    if json_body is not None:
        data = json.dumps(json_body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, method=method.upper(), data=data)
    req.add_header("Authorization", _basic_auth_header(sk))
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
            msg = err_json.get("message")
            if isinstance(msg, str) and msg.strip():
                return False, str(msg).strip()[:500], None
            errs = err_json.get("errors")
            if isinstance(errs, dict) and errs:
                first_key = next(iter(errs.keys()), "")
                first_val = errs.get(first_key)
                if isinstance(first_val, list) and first_val:
                    return False, str(first_val[0])[:500], None
                return False, str(first_key)[:500], None
        except Exception:
            pass
        return False, f"Pagar.me HTTP {e.code}.", None
    except urllib.error.URLError as e:
        return False, f"Rede Pagar.me: {e.reason!r}"[:500], None
    except TimeoutError:
        return False, "Tempo esgotado ao contatar o Pagar.me.", None
    except json.JSONDecodeError:
        return False, "Resposta JSON inválida do Pagar.me.", None


def test_pagarme_secret_key(secret_key: str, *, timeout: float = 18.0) -> tuple[bool, str | None, dict[str, Any]]:
    """Valida sk_test_* / sk_live_* consultando pedidos (endpoint leve com paginação)."""
    ok, err, data = pagarme_api_json("GET", "/orders?page=1&size=1", secret_key=secret_key, timeout=timeout)
    if not ok:
        return False, err or "Chave inválida ou sem permissão.", {}
    if isinstance(data, dict):
        return True, None, data
    return False, "Resposta inesperada do Pagar.me.", {}


def account_label_from_pagarme_orders_payload(payload: dict[str, Any]) -> str | None:
    data = payload.get("data")
    if isinstance(data, list) and data:
        first = data[0]
        if isinstance(first, dict):
            cid = first.get("customer_id") or first.get("customer", {}).get("id")
            if cid:
                return f"Pagar.me · {cid}"
    return "Pagar.me (Stone)"


def _digits_only(s: str) -> str:
    return "".join(c for c in (s or "") if c.isdigit())


def customer_block_with_br_document(
    *,
    customer_name: str,
    customer_email: str,
    payer_document: str,
) -> tuple[bool, str | None, dict[str, Any]]:
    """Monta `customer` com CPF/CNPJ (obrigatório para boleto e cartão na maioria das contas)."""
    digits = _digits_only(payer_document)
    if len(digits) == 11:
        doc_type = "individual"
    elif len(digits) == 14:
        doc_type = "company"
    else:
        return False, "Informe CPF (11 dígitos) ou CNPJ (14 dígitos) do pagador.", {}
    return True, None, {
        "name": (customer_name or "Cliente")[:64],
        "email": (customer_email or "nao-informado@climaris.invalid")[:64],
        "type": doc_type,
        "document": digits,
    }


def _order_items_and_meta(
    *,
    amount_reais: float,
    description: str,
    order_code: str,
    metadata: dict[str, str],
) -> tuple[bool, str | None, list[dict[str, Any]] | None]:
    cents = int(round(float(amount_reais) * 100))
    if cents < 100:
        return False, "Valor mínimo para cobrança no Pagar.me é R$ 1,00.", None
    items = [
        {
            "amount": cents,
            "description": (description or "Cobrança")[:256],
            "quantity": 1,
            "code": order_code[:256],
        }
    ]
    return True, None, items


def create_pagarme_pix_order(
    *,
    secret_key: str,
    amount_reais: float,
    description: str,
    order_code: str,
    metadata: dict[str, str],
    customer_name: str,
    customer_email: str,
    payer_document: str | None = None,
    expires_in_seconds: int = 86400,
    timeout: float = 35.0,
) -> tuple[bool, str | None, dict[str, Any] | None]:
    """Cria pedido fechado com um pagamento PIX (valor em reais → centavos)."""
    ok_items, err_items, items = _order_items_and_meta(
        amount_reais=amount_reais,
        description=description,
        order_code=order_code,
        metadata=metadata,
    )
    if not ok_items or items is None:
        return False, err_items or "Valor inválido.", None
    customer: dict[str, Any] = {
        "name": (customer_name or "Cliente")[:64],
        "email": (customer_email or "nao-informado@climaris.invalid")[:64],
    }
    digits = _digits_only(payer_document or "")
    if len(digits) == 11:
        customer["type"] = "individual"
        customer["document"] = digits
    elif len(digits) == 14:
        customer["type"] = "company"
        customer["document"] = digits
    body: dict[str, Any] = {
        "closed": True,
        "code": order_code[:512],
        "metadata": metadata,
        "items": items,
        "customer": customer,
        "payments": [
            {
                "payment_method": "pix",
                "pix": {"expires_in": int(expires_in_seconds)},
            }
        ],
    }
    ok, err, data = pagarme_api_json("POST", "/orders", secret_key=secret_key, json_body=body, timeout=timeout)
    if not ok or not isinstance(data, dict):
        return False, err or "Falha ao criar pedido.", None
    return True, None, data


def extract_order_id(order: dict[str, Any]) -> str | None:
    oid = order.get("id")
    if oid is None:
        return None
    s = str(oid).strip()
    return s[:64] if s else None


def extract_pix_from_order(order: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """
    Retorna (charge_id, pix_copy_paste, qr_code_url) a partir do JSON do pedido.
    """
    charges = order.get("charges")
    if not isinstance(charges, list):
        return None, None, None
    for ch in charges:
        if not isinstance(ch, dict):
            continue
        pm = str(ch.get("payment_method") or "").strip().lower()
        if pm != "pix":
            continue
        lt = ch.get("last_transaction")
        if not isinstance(lt, dict):
            continue
        cid = str(ch.get("id") or "").strip() or None
        qr = str(lt.get("qr_code") or "").strip() or None
        url = str(lt.get("qr_code_url") or "").strip() or None
        return (cid[:64] if cid else None, qr, url)
    return None, None, None


def boleto_due_at_iso_from_entry_due(*, entry_due: date, today: date | None = None) -> str:
    """Fim do dia America/Sao_Paulo (offset fixo -03:00), como no fluxo Mercado Pago."""
    ref = today if today is not None else date.today()
    exp = entry_due if entry_due >= ref else ref + timedelta(days=3)
    return f"{exp.isoformat()}T23:59:59.000-03:00"


def create_pagarme_boleto_order(
    *,
    secret_key: str,
    amount_reais: float,
    description: str,
    order_code: str,
    metadata: dict[str, str],
    customer: dict[str, Any],
    due_at_iso: str,
    instructions: str | None,
    timeout: float = 40.0,
) -> tuple[bool, str | None, dict[str, Any] | None]:
    """Pedido fechado com um pagamento boleto (documento do pagador em `customer`)."""
    ok_items, err_items, items = _order_items_and_meta(
        amount_reais=amount_reais,
        description=description,
        order_code=order_code,
        metadata=metadata,
    )
    if not ok_items or items is None:
        return False, err_items or "Valor inválido.", None
    boleto: dict[str, Any] = {"due_at": due_at_iso}
    if instructions and instructions.strip():
        boleto["instructions"] = instructions.strip()[:256]
    body: dict[str, Any] = {
        "closed": True,
        "code": order_code[:512],
        "metadata": metadata,
        "items": items,
        "customer": customer,
        "payments": [{"payment_method": "boleto", "boleto": boleto}],
    }
    ok, err, data = pagarme_api_json("POST", "/orders", secret_key=secret_key, json_body=body, timeout=timeout)
    if not ok or not isinstance(data, dict):
        return False, err or "Falha ao criar pedido.", None
    return True, None, data


def create_pagarme_credit_card_order(
    *,
    secret_key: str,
    amount_reais: float,
    description: str,
    order_code: str,
    metadata: dict[str, str],
    customer: dict[str, Any],
    card_token: str,
    installments: int,
    statement_descriptor: str | None = None,
    timeout: float = 45.0,
) -> tuple[bool, str | None, dict[str, Any] | None]:
    """
    Pedido fechado com captura (`auth_and_capture`). Exige `card_token` gerado no browser
    (ex.: tokenização Pagar.me / Checkout) — não envie PAN/CVV pelo backend.
    """
    ok_items, err_items, items = _order_items_and_meta(
        amount_reais=amount_reais,
        description=description,
        order_code=order_code,
        metadata=metadata,
    )
    if not ok_items or items is None:
        return False, err_items or "Valor inválido.", None
    desc = (statement_descriptor or "CLIMARIS")[:13]
    inst = max(1, min(12, int(installments)))
    tok = (card_token or "").strip()
    if len(tok) < 16:
        return False, "card_token inválido.", None
    cc: dict[str, Any] = {
        "installments": inst,
        "operation_type": "auth_and_capture",
        "statement_descriptor": desc,
        "card_token": tok,
    }
    body: dict[str, Any] = {
        "closed": True,
        "code": order_code[:512],
        "metadata": metadata,
        "items": items,
        "customer": customer,
        "payments": [{"payment_method": "credit_card", "credit_card": cc}],
    }
    ok, err, data = pagarme_api_json("POST", "/orders", secret_key=secret_key, json_body=body, timeout=timeout)
    if not ok or not isinstance(data, dict):
        return False, err or "Falha ao criar pedido.", None
    return True, None, data


def extract_boleto_from_order(order: dict[str, Any]) -> tuple[str | None, str | None, str | None, str | None]:
    """
    Retorna (charge_id, pdf_url, digitable_line, barcode) a partir do JSON do pedido.
    """
    charges = order.get("charges")
    if not isinstance(charges, list):
        return None, None, None, None
    for ch in charges:
        if not isinstance(ch, dict):
            continue
        pm = str(ch.get("payment_method") or "").strip().lower()
        if pm != "boleto":
            continue
        lt = ch.get("last_transaction")
        if not isinstance(lt, dict):
            continue
        cid = str(ch.get("id") or "").strip() or None
        pdf = (
            str(lt.get("pdf") or "").strip()
            or str(lt.get("url") or "").strip()
            or str(lt.get("bank_slip_url") or "").strip()
            or None
        )
        line = str(lt.get("line") or lt.get("line_1") or "").strip() or None
        barcode = str(lt.get("barcode") or "").strip() or None
        return (cid[:64] if cid else None, pdf, line, barcode)
    return None, None, None, None


_CC_BAD_TX = frozenset({"refused", "failed", "canceled", "voided"})


def credit_card_charge_declined_message(order: dict[str, Any]) -> str | None:
    """Se a primeira charge de cartão estiver recusada/cancelada, retorna mensagem; senão None."""
    charges = order.get("charges")
    if not isinstance(charges, list):
        return None
    for ch in charges:
        if not isinstance(ch, dict):
            continue
        if str(ch.get("payment_method") or "").strip().lower() != "credit_card":
            continue
        lt = ch.get("last_transaction")
        if not isinstance(lt, dict):
            continue
        st = str(lt.get("status") or "").strip().lower()
        if st not in _CC_BAD_TX:
            return None
        for key in ("acquirer_message", "message"):
            raw = lt.get(key)
            if isinstance(raw, str) and raw.strip():
                return raw.strip()[:500]
        gr = lt.get("gateway_response")
        if isinstance(gr, dict):
            msg = gr.get("message")
            if isinstance(msg, str) and msg.strip():
                return msg.strip()[:500]
        return f"Cartão não autorizado (status: {st})."
    return None


def fetch_pagarme_order(*, secret_key: str, order_id: str, timeout: float = 25.0) -> tuple[bool, str | None, dict[str, Any] | None]:
    oid = urllib.parse.quote((order_id or "").strip(), safe="")
    if not oid:
        return False, "order_id ausente.", None
    ok, err, data = pagarme_api_json("GET", f"/orders/{oid}", secret_key=secret_key, timeout=timeout)
    if not ok or not isinstance(data, dict):
        return False, err or "Pedido não encontrado.", None
    return True, None, data
