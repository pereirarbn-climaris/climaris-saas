"""WhatsApp da operação Climaris — Evolution e API oficial (Meta Cloud API)."""

from __future__ import annotations

import json
import logging
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from fastapi import HTTPException, status

from app.config import (
    EVOLUTION_API_BASE_URL,
    EVOLUTION_API_KEY,
    EVOLUTION_INSTANCE,
    PLATFORM_WHATSAPP_PROVIDER,
    WHATSAPP_OFFICIAL_ACCESS_TOKEN,
    WHATSAPP_OFFICIAL_API_VERSION,
    WHATSAPP_OFFICIAL_PHONE_NUMBER_ID,
)
from app.platform_credentials import resolve_whatsapp_official_config

logger = logging.getLogger("erp.platform_whatsapp")

DEFAULT_PLATFORM_INSTANCE = "climaris-platform"
PLATFORM_PROVIDER_EVOLUTION = "evolution"
PLATFORM_PROVIDER_OFFICIAL = "official"


def evolution_is_configured() -> bool:
    return bool(EVOLUTION_API_BASE_URL and EVOLUTION_API_KEY)


def official_is_configured(db: Any | None = None) -> bool:
    cfg = resolve_whatsapp_official_config(db)
    return bool(cfg.get("access_token") and cfg.get("phone_number_id"))


def resolve_platform_provider(requested: str | None = None) -> str:
    candidate = (requested or PLATFORM_WHATSAPP_PROVIDER or PLATFORM_PROVIDER_EVOLUTION).strip().lower()
    if candidate in {PLATFORM_PROVIDER_EVOLUTION, PLATFORM_PROVIDER_OFFICIAL}:
        return candidate
    return PLATFORM_PROVIDER_EVOLUTION


def available_platform_providers() -> list[str]:
    return [PLATFORM_PROVIDER_EVOLUTION, PLATFORM_PROVIDER_OFFICIAL]


def _slugify_instance(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip().lower())
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug[:64]


def resolve_platform_instance_name(requested: str | None = None) -> str:
    if requested and requested.strip():
        return _slugify_instance(requested)
    if EVOLUTION_INSTANCE:
        return EVOLUTION_INSTANCE.strip()
    return DEFAULT_PLATFORM_INSTANCE


def _official_phone_number_id(db: Any | None = None) -> str:
    cfg = resolve_whatsapp_official_config(db)
    return str(cfg.get("phone_number_id") or "").strip()


def _official_graph_url(path: str, db: Any | None = None) -> str:
    cfg = resolve_whatsapp_official_config(db)
    version = str(cfg.get("api_version") or "").strip() or WHATSAPP_OFFICIAL_API_VERSION.strip() or "v20.0"
    return f"https://graph.facebook.com/{version}/{path.lstrip('/')}"


def _official_request(
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    *,
    db: Any | None = None,
    timeout_seconds: float = 20.0,
) -> dict[str, Any]:
    cfg = resolve_whatsapp_official_config(db)
    access_token = str(cfg.get("access_token") or "").strip() or WHATSAPP_OFFICIAL_ACCESS_TOKEN
    if not official_is_configured(db):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "WhatsApp API oficial não configurada. "
                "Defina WHATSAPP_OFFICIAL_ACCESS_TOKEN e WHATSAPP_OFFICIAL_PHONE_NUMBER_ID."
            ),
        )
    endpoint = _official_graph_url(path, db)
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {access_token}",
        "User-Agent": "Climaris-ERP/1.0",
    }
    req = urllib.request.Request(endpoint, method=method.upper(), headers=headers, data=body)
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds, context=ssl.create_default_context()) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        err_raw = ""
        try:
            err_raw = exc.read().decode(errors="replace")
        except Exception:
            pass
        detail = err_raw.strip() or f"HTTP {exc.code}"
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"WhatsApp oficial retornou erro: {detail[:260]}",
        ) from exc
    except urllib.error.URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Sem conexão com WhatsApp oficial: {exc.reason}",
        ) from exc
    try:
        data = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {"raw": raw}
    return data if isinstance(data, dict) else {"result": data}


def _import_evolution_helpers():
    from app.whatsapp import (
        _evolution_create_conflict_detail,
        _evolution_fetch_instances_entries,
        _evolution_instance_entry_name,
        _evolution_request,
        _evolution_send_text,
        disconnect_instance,
        evolution_connect_qrcode_fields,
        get_instance_qrcode,
        get_instance_state,
    )

    return {
        "fetch_entries": _evolution_fetch_instances_entries,
        "instance_name": _evolution_instance_entry_name,
        "request": _evolution_request,
        "send_text": _evolution_send_text,
        "disconnect": disconnect_instance,
        "qrcode_fields": evolution_connect_qrcode_fields,
        "get_qrcode": get_instance_qrcode,
        "get_state": get_instance_state,
        "create_conflict": _evolution_create_conflict_detail,
    }


def ensure_platform_instance(requested_instance_name: str | None = None) -> str:
    if not evolution_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Evolution API não configurada. Defina EVOLUTION_API_BASE_URL e EVOLUTION_API_KEY.",
        )
    evo = _import_evolution_helpers()
    instance_name = resolve_platform_instance_name(requested_instance_name)
    if not instance_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nome de instância inválido.")

    fetch_data = evo["request"]("GET", "/instance/fetchInstances")
    instances = evo["fetch_entries"](fetch_data)
    found = any(evo["instance_name"](item) == instance_name for item in instances)
    if not found:
        try:
            evo["request"](
                "POST",
                "/instance/create",
                {
                    "instanceName": instance_name,
                    "token": f"{instance_name}-token",
                    "qrcode": True,
                    "integration": "WHATSAPP-BAILEYS",
                },
            )
        except HTTPException as exc:
            if not evo["create_conflict"](str(exc.detail)):
                raise
    return instance_name


def _extract_connection_status(state: dict[str, Any]) -> str | None:
    state_value = state.get("instance", {}).get("state") if isinstance(state.get("instance"), dict) else state.get("state")
    if isinstance(state_value, str) and state_value.strip():
        return state_value.strip().lower()
    return None


def _compact_json_preview(value: Any, max_chars: int = 260) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False)
    except Exception:
        text = str(value)
    text = (text or "").strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3] + "..."


def _extract_provider_send_error(raw_response: dict[str, Any]) -> str | None:
    response = raw_response.get("response")
    if isinstance(response, dict):
        msg = response.get("message")
        if isinstance(msg, str) and msg.strip():
            return msg.strip()
        if isinstance(msg, list) and msg:
            first = msg[0]
            if isinstance(first, dict) and first.get("exists") is False:
                return "O número informado não está cadastrado no WhatsApp."

    for key in ("error", "message", "detail"):
        value = raw_response.get(key)
        if isinstance(value, str) and value.strip():
            lowered = value.strip().lower()
            if lowered in {"success", "ok"}:
                continue
            return value.strip()
    return None


def get_platform_connection(
    instance_name: str | None = None,
    provider: str | None = None,
    db: Any | None = None,
) -> dict[str, Any]:
    selected_provider = resolve_platform_provider(provider)
    evo_configured = evolution_is_configured()
    official_configured = official_is_configured(db)
    if selected_provider == PLATFORM_PROVIDER_OFFICIAL:
        phone_id = _official_phone_number_id(db)
        if not official_configured or not phone_id:
            return {
                "provider": PLATFORM_PROVIDER_OFFICIAL,
                "instance_name": phone_id,
                "status": "not_configured",
                "provider_configured": official_configured,
                "evolution_configured": evo_configured,
                "official_configured": official_configured,
                "qrcode_base64": None,
                "pairing_code": None,
                "raw": None,
            }
        raw = _official_request(
            "GET",
            f"{phone_id}?fields=id,display_phone_number,verified_name,name_status",
            db=db,
        )
        return {
            "provider": PLATFORM_PROVIDER_OFFICIAL,
            "instance_name": phone_id,
            "status": "connected",
            "provider_configured": True,
            "evolution_configured": evo_configured,
            "official_configured": official_configured,
            "qrcode_base64": None,
            "pairing_code": None,
            "raw": raw,
        }

    name = resolve_platform_instance_name(instance_name)
    if not evo_configured or not name:
        return {
            "provider": PLATFORM_PROVIDER_EVOLUTION,
            "instance_name": name,
            "status": "not_configured",
            "provider_configured": evo_configured,
            "evolution_configured": evo_configured,
            "official_configured": official_configured,
            "qrcode_base64": None,
            "pairing_code": None,
            "raw": None,
        }
    evo = _import_evolution_helpers()
    try:
        state = evo["get_state"](name)
    except HTTPException:
        state = {}
    status_val = _extract_connection_status(state if isinstance(state, dict) else {})
    return {
        "provider": PLATFORM_PROVIDER_EVOLUTION,
        "instance_name": name,
        "status": status_val or "not_configured",
        "provider_configured": True,
        "evolution_configured": evo_configured,
        "official_configured": official_configured,
        "qrcode_base64": None,
        "pairing_code": None,
        "raw": state if isinstance(state, dict) else None,
    }


def setup_platform_connection(
    requested_instance_name: str | None = None,
    provider: str | None = None,
    db: Any | None = None,
) -> dict[str, Any]:
    selected_provider = resolve_platform_provider(provider)
    if selected_provider == PLATFORM_PROVIDER_OFFICIAL:
        # Cloud API não usa QR; validamos credenciais/phone-id e marcamos conectado.
        return get_platform_connection(provider=PLATFORM_PROVIDER_OFFICIAL, db=db)

    instance_name = ensure_platform_instance(requested_instance_name)
    evo = _import_evolution_helpers()
    qr = evo["get_qrcode"](instance_name)
    if not isinstance(qr, dict):
        qr = {}
    b64, pairing, evo_state = evo["qrcode_fields"](qr)
    official_configured = official_is_configured(db)
    if evo_state in ("open", "connected"):
        return {
            "provider": PLATFORM_PROVIDER_EVOLUTION,
            "instance_name": instance_name,
            "status": "connected",
            "provider_configured": True,
            "evolution_configured": True,
            "official_configured": official_configured,
            "qrcode_base64": None,
            "pairing_code": None,
            "raw": qr,
        }
    return {
        "provider": PLATFORM_PROVIDER_EVOLUTION,
        "instance_name": instance_name,
        "status": "connecting",
        "provider_configured": True,
        "evolution_configured": True,
        "official_configured": official_configured,
        "qrcode_base64": b64,
        "pairing_code": pairing,
        "raw": qr,
    }


def disconnect_platform_connection(
    instance_name: str | None = None,
    provider: str | None = None,
    db: Any | None = None,
) -> dict[str, Any]:
    selected_provider = resolve_platform_provider(provider)
    official_configured = official_is_configured(db)
    if selected_provider == PLATFORM_PROVIDER_OFFICIAL:
        # Cloud API não possui "logout" da sessão pelo Graph para este fluxo.
        return {
            "provider": PLATFORM_PROVIDER_OFFICIAL,
            "instance_name": _official_phone_number_id(db),
            "status": "connected" if official_configured else "not_configured",
            "provider_configured": official_configured,
            "evolution_configured": evolution_is_configured(),
            "official_configured": official_configured,
            "qrcode_base64": None,
            "pairing_code": None,
            "raw": {"note": "Desconexão não aplicável na API oficial."},
        }
    name = resolve_platform_instance_name(instance_name)
    if not name or not evolution_is_configured():
        return get_platform_connection(name, PLATFORM_PROVIDER_EVOLUTION)
    evo = _import_evolution_helpers()
    evo["disconnect"](name)
    return {
        "provider": PLATFORM_PROVIDER_EVOLUTION,
        "instance_name": name,
        "status": "close",
        "provider_configured": True,
        "evolution_configured": True,
        "official_configured": official_configured,
        "qrcode_base64": None,
        "pairing_code": None,
        "raw": {},
    }


def platform_send_text(
    number: str,
    message: str,
    provider: str | None = None,
    db: Any | None = None,
) -> dict[str, Any]:
    selected_provider = resolve_platform_provider(provider)
    if selected_provider == PLATFORM_PROVIDER_OFFICIAL:
        phone_id = _official_phone_number_id(db)
        payload = {
            "messaging_product": "whatsapp",
            "to": number,
            "type": "text",
            "text": {"preview_url": False, "body": message},
        }
        raw_response = _official_request("POST", f"{phone_id}/messages", payload, db=db)
        error_obj = raw_response.get("error") if isinstance(raw_response, dict) else None
        if isinstance(error_obj, dict):
            msg = str(error_obj.get("message") or "Erro ao enviar pela API oficial.").strip()
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=msg)
        message_id = None
        contacts = raw_response.get("messages") if isinstance(raw_response, dict) else None
        if isinstance(contacts, list) and contacts:
            first = contacts[0]
            if isinstance(first, dict):
                maybe_id = first.get("id")
                if isinstance(maybe_id, str) and maybe_id.strip():
                    message_id = maybe_id.strip()
        if not message_id:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "WhatsApp oficial não confirmou o envio da mensagem. "
                    f"Resposta: {_compact_json_preview(raw_response)}"
                ),
            )
        return {"provider_message_id": message_id, "raw_response": raw_response}

    if not evolution_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Evolution API não configurada.",
        )
    instance_name = resolve_platform_instance_name()
    evo = _import_evolution_helpers()
    state = evo["get_state"](instance_name)
    status_val = _extract_connection_status(state if isinstance(state, dict) else {})
    if status_val not in ("open", "connected"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Instância WhatsApp desconectada. Reconecte em Operação > WhatsApp e tente novamente.",
        )

    result = evo["send_text"](instance_name, number, message)
    provider_message_id = result.get("message_id") if isinstance(result, dict) else None
    raw_response = result.get("raw_response") if isinstance(result, dict) else {}
    raw_response = raw_response if isinstance(raw_response, dict) else {}

    provider_error = _extract_provider_send_error(raw_response)
    if provider_error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=provider_error,
        )
    if not provider_message_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Evolution não confirmou o envio da mensagem. "
                f"Resposta do provider: {_compact_json_preview(raw_response)}"
            ),
        )
    return {
        "provider_message_id": provider_message_id,
        "raw_response": raw_response,
    }


def safe_normalize_whatsapp(value: str | None) -> str | None:
    if not value:
        return None
    digits = "".join(ch for ch in value if ch.isdigit())
    if not digits:
        return None
    if digits.startswith("55") and len(digits) in (12, 13):
        return digits
    if len(digits) in (10, 11):
        return f"55{digits}"
    if len(digits) in (12, 13):
        return digits
    return None
