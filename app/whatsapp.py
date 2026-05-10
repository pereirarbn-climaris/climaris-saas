from __future__ import annotations

import json
import logging
import ssl
import urllib.error
import urllib.request
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
import re
from string import Formatter
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import delete, desc, or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import SessionLocal
from app.routers.service_orders import (
    _check_technician_conflict,
    _check_technician_work_rules,
    _ensure_inside_workday,
    _tenant_tz,
    _with_buffer,
)
from app.ai_assistant import generate_ai_response
from app.config import (
    EVOLUTION_API_BASE_URL,
    EVOLUTION_API_KEY,
    EVOLUTION_CORS_REQUEST_ORIGIN,
    EVOLUTION_INSTANCE,
    WHATSAPP_AI_INCOMING_ENABLED,
    WHATSAPP_INTERACTIVE_BUTTONS_ENABLED,
)
from models import (
    Client,
    Schedule,
    ScheduleTechnician,
    ScheduleStatus,
    Tenant,
    TenantHoliday,
    User,
    UserRole,
    WhatsappMessageEvent,
    WhatsappMessageJob,
    WhatsappMessageStatus,
    WhatsappRescheduleOption,
)

logger = logging.getLogger("erp.whatsapp")

# --- Evolution API v2.3.x (ex.: 2.3.7) — mensagens com botões ---
# 1) Preferir POST /message/sendButtons/{instance} (SendButtonsDto): a Evolution monta o envelope
#    Baileys no servidor — melhor compatibilidade (WhatsApp Web + mobile).
# 2) Fallback: POST /message/sendInteractive/{instance} com native_flow (_build_evolution_237_native_flow_payload).
# Não enviar viewOnceMessage na raiz do JSON HTTP.
# Implementação: _evolution_send_buttons.

TEMPLATES: dict[str, dict[str, Any]] = {
    "reminder_due": {
        "description": "Lembrete de vencimento.",
        "variables": ["nome", "valor", "vencimento", "link_pagamento"],
        "body": "Oi {nome}, passando para lembrar do vencimento em {vencimento}. Valor: R$ {valor}. {link_pagamento}",
    },
    "payment_paid": {
        "description": "Confirma pagamento recebido.",
        "variables": ["nome", "valor", "data_pagamento"],
        "body": "Pagamento confirmado, {nome}! Recebemos R$ {valor} em {data_pagamento}. Obrigado.",
    },
    "payment_overdue": {
        "description": "Aviso de pagamento em atraso.",
        "variables": ["nome", "valor", "vencimento", "link_pagamento"],
        "body": "Oi {nome}, identificamos um pagamento em atraso desde {vencimento}. Valor: R$ {valor}. {link_pagamento}",
    },
}

APPOINTMENT_TEMPLATE_ALLOWED_VARIABLES = [
    "nome_cliente",
    "data_hora",
    "empresa",
    "confirmar_acao",
    "remarcar_acao",
]
DEFAULT_APPOINTMENT_CONFIRM_KEYWORD = "CONFIRMAR"
DEFAULT_APPOINTMENT_RESCHEDULE_KEYWORD = "REMARCAR"
DEFAULT_APPOINTMENT_TEMPLATE_BODY = (
    "Oi {nome_cliente}! Lembrete do seu agendamento em {data_hora}.\n"
    "Responda *{confirmar_acao}* para confirmar ou *{remarcar_acao}* para remarcar.\n"
    "{empresa}"
)
_BUTTON_CONFIRM_PREFIX = "climaris:schedule:confirm:"
_BUTTON_RESCHEDULE_PREFIX = "climaris:schedule:reschedule:"
REMINDER_OFFSET_PRESETS: dict[str, int] = {
    "offset_15m": 15,
    "offset_30m": 30,
    "offset_1h": 60,
    "offset_1d": 24 * 60,
}
DEFAULT_REMINDER_RULES = {
    "offset_15m": True,
    "offset_30m": True,
    "offset_1h": True,
    "offset_1d": True,
    "custom_enabled": False,
    "custom_minutes": None,
}
RESCHEDULE_OPTIONS_TTL_MINUTES = 30
HUMAN_HANDOFF_ON_KEYWORDS: tuple[str, ...] = (
    "atendente",
    "humano",
    "falar com atendente",
    "quero falar com atendente",
    "falar com humano",
)
HUMAN_HANDOFF_OFF_KEYWORDS: tuple[str, ...] = (
    "bot",
    "ia",
    "voltar bot",
    "voltar ia",
    "retomar bot",
    "retomar ia",
)


class ProviderSendResult(dict):
    message_id: str | None
    raw_response: dict[str, Any]


def normalize_whatsapp_number(value: str) -> str:
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if not digits:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Número de WhatsApp inválido.")
    if digits.startswith("55") and len(digits) in (12, 13):
        return digits
    if len(digits) in (10, 11):
        return f"55{digits}"
    if len(digits) in (12, 13):
        return digits
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Número de WhatsApp deve ter DDD válido.")


def _extract_template_variables(template_body: str) -> set[str]:
    variables: set[str] = set()
    for _, field_name, _, _ in Formatter().parse(template_body):
        if field_name:
            variables.add(field_name)
    return variables


def _render_raw_template(body: str, variables: dict[str, Any], *, detail_label: str) -> str:
    expected = _extract_template_variables(body)
    missing = sorted(k for k in expected if k not in variables or variables.get(k) in (None, ""))
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{detail_label}: variáveis ausentes: {', '.join(missing)}.",
        )
    values = {k: str(v) for k, v in variables.items()}
    return body.format(**values).strip()


def render_template(template_key: str, variables: dict[str, Any]) -> str:
    tpl = TEMPLATES.get(template_key)
    if tpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template de WhatsApp não encontrado.")
    body = str(tpl["body"])
    return _render_raw_template(body, variables, detail_label="Template de WhatsApp inválido")


def chatbot_reply_for_message(db: Session, *, tenant_id: int, message_text: str, client_name: str | None = None) -> dict[str, str]:
    del db
    del tenant_id
    text = (message_text or "").strip().lower()
    name = (client_name or "cliente").strip()
    if any(k in text for k in ("orcamento", "orçamento", "valor", "preco", "preço")):
        return {
            "intent": "preco_servico",
            "reply_text": (
                f"Oi {name}! Posso te ajudar com valores e orçamento. "
                "Me diga qual serviço você precisa (ex.: limpeza, instalação, manutenção)."
            ),
        }
    if any(k in text for k in ("status", "andamento", "aprovado", "reprovado")) and "orc" in text:
        return {
            "intent": "status_orcamento",
            "reply_text": (
                f"Perfeito, {name}. Para consultar o status do orçamento, me envie o número do orçamento "
                "ou CPF/CNPJ do titular."
            ),
        }
    if any(k in text for k in ("atendente", "humano", "pessoa")):
        return {
            "intent": "falar_atendente",
            "reply_text": "Tudo bem! Vou encaminhar seu atendimento para nossa equipe humana.",
        }
    return {
        "intent": "fallback",
        "reply_text": (
            "Posso ajudar com: valores de serviço, status de orçamento ou falar com atendente. "
            "Me diga o que você precisa."
        ),
    }


def get_tenant_appointment_message_settings(db: Session, *, tenant_id: int) -> dict[str, Any]:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    return {
        "template_body": (tenant.whatsapp_appointment_template or DEFAULT_APPOINTMENT_TEMPLATE_BODY).strip(),
        "confirm_keyword": (
            (tenant.whatsapp_appointment_confirm_keyword or DEFAULT_APPOINTMENT_CONFIRM_KEYWORD).strip().upper()
        ),
        "reschedule_keyword": (
            (tenant.whatsapp_appointment_reschedule_keyword or DEFAULT_APPOINTMENT_RESCHEDULE_KEYWORD).strip().upper()
        ),
        "allowed_variables": APPOINTMENT_TEMPLATE_ALLOWED_VARIABLES,
    }


def update_tenant_appointment_message_settings(
    db: Session,
    *,
    tenant_id: int,
    template_body: str | None,
    confirm_keyword: str | None,
    reschedule_keyword: str | None,
) -> dict[str, Any]:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")

    if template_body is not None:
        template_vars = _extract_template_variables(template_body)
        invalid = sorted(v for v in template_vars if v not in APPOINTMENT_TEMPLATE_ALLOWED_VARIABLES)
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Template contém variáveis não permitidas: "
                    f"{', '.join(invalid)}. Permitidas: {', '.join(APPOINTMENT_TEMPLATE_ALLOWED_VARIABLES)}."
                ),
            )
        tenant.whatsapp_appointment_template = template_body
    if confirm_keyword is not None:
        tenant.whatsapp_appointment_confirm_keyword = confirm_keyword
    if reschedule_keyword is not None:
        tenant.whatsapp_appointment_reschedule_keyword = reschedule_keyword

    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return get_tenant_appointment_message_settings(db, tenant_id=tenant_id)


def render_appointment_reminder_message(
    db: Session,
    *,
    tenant_id: int,
    nome_cliente: str,
    data_hora: str,
    empresa: str | None = None,
) -> str:
    settings = get_tenant_appointment_message_settings(db, tenant_id=tenant_id)
    vars_payload = {
        "nome_cliente": nome_cliente,
        "data_hora": data_hora,
        "empresa": empresa or "",
        "confirmar_acao": settings["confirm_keyword"],
        "remarcar_acao": settings["reschedule_keyword"],
    }
    return _render_raw_template(
        settings["template_body"],
        vars_payload,
        detail_label="Template de lembrete de agendamento inválido",
    )


def get_tenant_reminder_rules(db: Session, *, tenant_id: int) -> dict[str, Any]:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    raw = tenant.whatsapp_reminder_offsets_json or ""
    parsed: dict[str, Any] = {}
    if raw.strip():
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                parsed = data
        except Exception:
            parsed = {}
    rules = dict(DEFAULT_REMINDER_RULES)
    rules.update({k: parsed.get(k, rules[k]) for k in ("offset_15m", "offset_30m", "offset_1h", "offset_1d", "custom_enabled")})
    custom_minutes = tenant.whatsapp_reminder_custom_minutes
    if custom_minutes is not None and custom_minutes > 0:
        rules["custom_minutes"] = int(custom_minutes)
    active_offsets = [minutes for key, minutes in REMINDER_OFFSET_PRESETS.items() if bool(rules.get(key))]
    if bool(rules.get("custom_enabled")) and isinstance(rules.get("custom_minutes"), int) and int(rules["custom_minutes"]) > 0:
        active_offsets.append(int(rules["custom_minutes"]))
    rules["active_offsets_minutes"] = sorted(set(active_offsets))
    return rules


def update_tenant_reminder_rules(
    db: Session,
    *,
    tenant_id: int,
    offset_15m: bool | None = None,
    offset_30m: bool | None = None,
    offset_1h: bool | None = None,
    offset_1d: bool | None = None,
    custom_enabled: bool | None = None,
    custom_minutes: int | None = None,
) -> dict[str, Any]:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    current = get_tenant_reminder_rules(db, tenant_id=tenant_id)
    next_rules = dict(current)
    if offset_15m is not None:
        next_rules["offset_15m"] = bool(offset_15m)
    if offset_30m is not None:
        next_rules["offset_30m"] = bool(offset_30m)
    if offset_1h is not None:
        next_rules["offset_1h"] = bool(offset_1h)
    if offset_1d is not None:
        next_rules["offset_1d"] = bool(offset_1d)
    if custom_enabled is not None:
        next_rules["custom_enabled"] = bool(custom_enabled)
    if custom_minutes is not None:
        next_rules["custom_minutes"] = int(custom_minutes)

    active_offsets = [minutes for key, minutes in REMINDER_OFFSET_PRESETS.items() if bool(next_rules.get(key))]
    if bool(next_rules.get("custom_enabled")):
        minutes = next_rules.get("custom_minutes")
        if not isinstance(minutes, int) or minutes <= 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Minutos personalizados inválidos.")
        active_offsets.append(minutes)
    if not active_offsets:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ative ao menos uma antecedência de lembrete.",
        )
    tenant.whatsapp_reminder_offsets_json = json.dumps(
        {
            "offset_15m": bool(next_rules["offset_15m"]),
            "offset_30m": bool(next_rules["offset_30m"]),
            "offset_1h": bool(next_rules["offset_1h"]),
            "offset_1d": bool(next_rules["offset_1d"]),
            "custom_enabled": bool(next_rules["custom_enabled"]),
        },
        ensure_ascii=True,
    )
    tenant.whatsapp_reminder_custom_minutes = (
        int(next_rules["custom_minutes"])
        if bool(next_rules.get("custom_enabled")) and isinstance(next_rules.get("custom_minutes"), int)
        else None
    )
    db.add(tenant)
    db.commit()
    return get_tenant_reminder_rules(db, tenant_id=tenant_id)



def _resolve_tenant_instance(db: Session, tenant_id: int) -> str:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")
    if tenant.whatsapp_instance_name:
        return tenant.whatsapp_instance_name
    if EVOLUTION_INSTANCE:
        return EVOLUTION_INSTANCE
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="WhatsApp não configurado para este tenant. Configure a conexão da instância primeiro.",
    )


def _evolution_request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    if not EVOLUTION_API_BASE_URL or not EVOLUTION_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Evolution API não configurada. Defina EVOLUTION_API_BASE_URL e EVOLUTION_API_KEY.",
        )
    endpoint = f"{EVOLUTION_API_BASE_URL.rstrip('/')}/{path.lstrip('/')}"
    body = None
    headers = {
        "Content-Type": "application/json",
        "apikey": EVOLUTION_API_KEY,
        "Accept": "application/json",
        "User-Agent": "Climaris-ERP/1.0",
    }
    if EVOLUTION_CORS_REQUEST_ORIGIN:
        headers["Origin"] = EVOLUTION_CORS_REQUEST_ORIGIN
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        method=method.upper(),
        headers=headers,
        data=body,
    )
    try:
        with urllib.request.urlopen(req, timeout=25, context=ssl.create_default_context()) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode(errors="replace")
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Evolution API retornou HTTP {exc.code}: {body[:200]}",
        ) from exc
    except urllib.error.URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Sem conexão com Evolution API: {exc.reason}",
        ) from exc

    try:
        data = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        data = {"raw": raw}
    if not isinstance(data, dict):
        return {"result": data}
    return data


def _evolution_send_text(instance_name: str, number: str, message: str) -> ProviderSendResult:
    payload = {
        "number": number,
        # Compatibilidade com variações da Evolution API que exigem `text` no root.
        "text": message,
        "options": {"delay": 0, "presence": "composing"},
        "textMessage": {"text": message},
    }
    data = _evolution_request("POST", f"/message/sendText/{instance_name}", payload)

    key_data = data.get("key") if isinstance(data, dict) else {}
    message_id = None
    if isinstance(key_data, dict):
        message_id = key_data.get("id")
    if not message_id and isinstance(data, dict):
        message_id = data.get("id") or data.get("messageId")
    return ProviderSendResult(message_id=message_id, raw_response=data)


def evolution_send_media_message(
    instance_name: str,
    number: str,
    *,
    caption: str,
    media_url: str | None = None,
    media_base64: str | None = None,
    mimetype: str = "image/jpeg",
    filename: str | None = None,
) -> ProviderSendResult:
    """POST /message/sendMedia/{instance} — imagem por URL ou Base64 (Evolution API)."""
    media = (media_url or "").strip() or (media_base64 or "").strip()
    if not media:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Envie media_url ou media_base64 para o envio com imagem.",
        )
    mediatype = "image"
    payload: dict[str, Any] = {
        "number": number,
        "mediatype": mediatype,
        "mimetype": mimetype,
        "caption": caption,
        "media": media,
    }
    if filename:
        payload["fileName"] = filename
    data = _evolution_request("POST", f"/message/sendMedia/{instance_name}", payload)
    key_data = data.get("key") if isinstance(data, dict) else {}
    message_id = None
    if isinstance(key_data, dict):
        message_id = key_data.get("id")
    if not message_id and isinstance(data, dict):
        message_id = data.get("id") or data.get("messageId")
    return ProviderSendResult(message_id=message_id, raw_response=data)


def _build_evolution_237_native_flow_payload(
    number: str,
    title: str,
    body: str,
    footer: str,
    buttons: list[dict[str, Any]],
) -> dict[str, Any]:
    """Monta o JSON esperado pela Evolution API v2.3.7 para botões (quick_reply).

    Usado como **fallback** em `_evolution_send_buttons` quando `POST /message/sendButtons`
    não resolve — não é o primeiro caminho (o primeiro é SendButtonsDto para a Evolution
    montar o proto no servidor, melhor para WhatsApp Web).

    Endpoint HTTP: POST /message/sendInteractive/{instance}

    Regras v2.3.7:
    - Raiz: apenas "number" e "interactiveMessage" (não enviar viewOnceMessage nem "message"
      no JSON HTTP — isso quebra / Unknown message type; a Evolution encapsula no servidor).
    - interactiveMessage deve ter "type": "native_flow".
    - Botões em nativeFlowMessage.buttons: name "quick_reply", buttonParamsJson com JSON
      string {"display_text", "id"}.

    Opcional: nativeFlowMessage.messageParamsJson com from/templateId, alinhado ao código da
    Evolution (whatsapp.baileys.service.ts).
    """
    t = (title or "").strip()
    b = (body or "").strip()
    if t:
        text = f"*{t}*\n\n{b}"
    else:
        text = b
    flow_buttons: list[dict[str, str]] = []
    for btn in buttons:
        bid = str((btn or {}).get("buttonId", "") or "").strip()
        bt = (btn or {}).get("buttonText")
        display = ""
        if isinstance(bt, dict):
            display = str(bt.get("displayText", "") or "").strip()
        if len(display) > 20:
            display = display[:20]
        if not bid or not display:
            continue
        params = json.dumps(
            {"display_text": display, "id": bid},
            ensure_ascii=False,
        )
        flow_buttons.append(
            {
                "name": "quick_reply",
                "buttonParamsJson": params,
            }
        )
    if len(flow_buttons) > 3:
        flow_buttons = flow_buttons[:3]
    if not flow_buttons:
        raise ValueError("Nenhum botão válido para native_flow (id e displayText).")
    return {
        "number": number,
        "interactiveMessage": {
            "body": {"text": text},
            "footer": {"text": (footer or "")[:60]},
            "type": "native_flow",
            "nativeFlowMessage": {
                "buttons": flow_buttons,
                # Mesmo que whatsapp.baileys.service.ts (Evolution): envelope interno do fluxo.
                "messageParamsJson": json.dumps(
                    {"from": "api", "templateId": str(uuid.uuid4())},
                    ensure_ascii=False,
                ),
            },
        },
    }


def _internal_buttons_to_evolution_reply(buttons: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Converte o formato interno (buttonId + buttonText.displayText) para SendButtonsDto da Evolution."""
    out: list[dict[str, Any]] = []
    for btn in buttons:
        bid = str((btn or {}).get("buttonId", "") or "").strip()
        bt = (btn or {}).get("buttonText")
        display = ""
        if isinstance(bt, dict):
            display = str(bt.get("displayText", "") or "").strip()
        if len(display) > 20:
            display = display[:20]
        if bid and display:
            out.append({"type": "reply", "id": bid, "displayText": display})
    return out


def _evolution_send_buttons(
    instance_name: str,
    number: str,
    title: str,
    body: str,
    footer: str,
    buttons: list[dict[str, str]],
) -> ProviderSendResult:
    reply_buttons = _internal_buttons_to_evolution_reply(buttons)
    if len(reply_buttons) < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Envie ao menos um botão válido (id e texto).",
        )

    try:
        payload_native_flow = _build_evolution_237_native_flow_payload(
            number, title, body, footer, list(buttons)
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    # 1) Evolution 2.3.7+ — sendInteractive + native_flow (recomendado Baileys)
    payload_v2_send_buttons = {
        "number": number,
        "title": title[:128],
        "description": body,
        "footer": footer[:60],
        "buttons": reply_buttons,
    }
    # 2) Mesmo formato com delay/presence (algumas versões)
    payload_v2_send_buttons_delayed = {
        **payload_v2_send_buttons,
        "delay": 1200,
    }
    # 3) Legado: buttonId + buttonText aninhado (instâncias antigas)
    payload_legacy_nested = {
        "number": number,
        "title": title[:128],
        "description": body,
        "footer": footer[:60],
        "buttons": [
            {
                "type": "reply",
                "buttonId": str(btn.get("buttonId", "")),
                "buttonText": {"displayText": str(btn.get("buttonText", {}).get("displayText", ""))},
            }
            for btn in buttons
        ],
    }
    # 4) Interactive text (último recurso — alguns clients não renderizam bem)
    payload_interactive = {
        "number": number,
        "options": {"delay": 1200, "presence": "composing"},
        "interactiveMessage": {
            "header": {"title": title[:128]},
            "body": {"text": body},
            "footer": {"text": footer[:60]},
            "action": {
                "buttons": [
                    {
                        "buttonId": str(btn.get("buttonId", "")),
                        "buttonText": {"displayText": str(btn.get("buttonText", {}).get("displayText", ""))},
                    }
                    for btn in buttons
                ]
            },
        },
    }

    send_interactive_endpoint = f"/message/sendInteractive/{instance_name}"
    send_buttons_endpoint = f"/message/sendButtons/{instance_name}"
    interactive_endpoint = f"/message/sendInteractiveText/{instance_name}"

    # Ordem: primeiro POST /message/sendButtons — a Evolution monta o proto no servidor
    # (buttonMessage em whatsapp.baileys.service.ts: viewOnce + nativeFlow + messageParamsJson).
    # Isso costuma renderizar em WhatsApp Web e celular. Depois tentamos sendInteractive
    # com JSON native_flow (útil quando sendButtons falha ou instância antiga).
    attempts: list[tuple[str, dict[str, Any]]] = [
        (send_buttons_endpoint, payload_v2_send_buttons),
        (send_buttons_endpoint, payload_v2_send_buttons_delayed),
        (send_buttons_endpoint, payload_legacy_nested),
        (send_interactive_endpoint, payload_native_flow),
        (interactive_endpoint, payload_interactive),
    ]

    last_exc: HTTPException | None = None
    data: dict[str, Any] | None = None
    for endpoint, payload in attempts:
        try:
            data = _evolution_request("POST", endpoint, payload)
            break
        except HTTPException as exc:
            last_exc = exc
    if data is None:
        if last_exc is not None:
            raise last_exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Falha ao enviar botões no WhatsApp.")
    key_data = data.get("key") if isinstance(data, dict) else {}
    message_id = None
    if isinstance(key_data, dict):
        message_id = key_data.get("id")
    if not message_id and isinstance(data, dict):
        message_id = data.get("id") or data.get("messageId")
    return ProviderSendResult(message_id=message_id, raw_response=data)


def create_message_job(
    db: Session,
    *,
    tenant_id: int,
    created_by_user: User | None,
    template_key: str,
    recipient_whatsapp: str,
    rendered_message: str,
    reference_type: str | None,
    reference_id: int | None,
    scheduled_for: datetime | None,
) -> WhatsappMessageJob:
    job = WhatsappMessageJob(
        tenant_id=tenant_id,
        created_by_user_id=created_by_user.id if created_by_user else None,
        provider_slug="evolution",
        template_key=template_key,
        recipient_whatsapp=recipient_whatsapp,
        rendered_message=rendered_message,
        reference_type=reference_type,
        reference_id=reference_id,
        scheduled_for=scheduled_for,
        status=WhatsappMessageStatus.QUEUED,
    )
    db.add(job)
    db.flush()
    return job


def append_event(
    db: Session,
    *,
    tenant_id: int,
    event_type: str,
    payload: dict[str, Any] | None,
    job_id: int | None = None,
) -> WhatsappMessageEvent:
    event = WhatsappMessageEvent(
        tenant_id=tenant_id,
        job_id=job_id,
        event_type=event_type,
        payload_json=json.dumps(payload, ensure_ascii=True) if payload is not None else None,
    )
    db.add(event)
    return event


def dispatch_template(
    db: Session,
    *,
    tenant_id: int,
    created_by_user: User,
    template_key: str,
    recipient_whatsapp: str,
    variables: dict[str, Any],
    reference_type: str | None = None,
    reference_id: int | None = None,
    scheduled_for: datetime | None = None,
) -> WhatsappMessageJob:
    instance_name = _resolve_tenant_instance(db, tenant_id)
    recipient = normalize_whatsapp_number(recipient_whatsapp)
    message = render_template(template_key, variables)
    job = create_message_job(
        db,
        tenant_id=tenant_id,
        created_by_user=created_by_user,
        template_key=template_key,
        recipient_whatsapp=recipient,
        rendered_message=message,
        reference_type=reference_type,
        reference_id=reference_id,
        scheduled_for=scheduled_for,
    )

    if scheduled_for is not None and scheduled_for > datetime.now(timezone.utc):
        append_event(db, tenant_id=tenant_id, event_type="scheduled", payload={"scheduled_for": scheduled_for.isoformat()}, job_id=job.id)
        db.commit()
        db.refresh(job)
        return job

    try:
        send_result = _evolution_send_text(instance_name, recipient, message)
        job.status = WhatsappMessageStatus.SENT
        job.provider_message_id = send_result.get("message_id")
        job.sent_at = datetime.now(timezone.utc)
        job.error_message = None
        append_event(db, tenant_id=tenant_id, event_type="sent", payload=send_result.get("raw_response"), job_id=job.id)
    except HTTPException as exc:
        job.status = WhatsappMessageStatus.FAILED
        job.failed_at = datetime.now(timezone.utc)
        job.error_message = str(exc.detail)
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="send_failed",
            payload={"error": str(exc.detail)},
            job_id=job.id,
        )
        db.commit()
        db.refresh(job)
        raise

    db.commit()
    db.refresh(job)
    return job


def dispatch_appointment_reminder(
    db: Session,
    *,
    tenant_id: int,
    created_by_user: User | None,
    recipient_whatsapp: str,
    nome_cliente: str,
    data_hora: str,
    empresa: str | None = None,
    reference_id: int | None = None,
) -> WhatsappMessageJob:
    instance_name = _resolve_tenant_instance(db, tenant_id)
    recipient = normalize_whatsapp_number(recipient_whatsapp)
    message = render_appointment_reminder_message(
        db,
        tenant_id=tenant_id,
        nome_cliente=nome_cliente,
        data_hora=data_hora,
        empresa=empresa,
    )
    job = create_message_job(
        db,
        tenant_id=tenant_id,
        created_by_user=created_by_user,
        template_key="appointment_reminder",
        recipient_whatsapp=recipient,
        rendered_message=message,
        reference_type="schedule",
        reference_id=reference_id,
        scheduled_for=None,
    )

    try:
        # Entrega estável primeiro: texto simples.
        # Botões interativos podem ser habilitados por flag quando a instância estiver estável.
        if WHATSAPP_INTERACTIVE_BUTTONS_ENABLED:
            settings = get_tenant_appointment_message_settings(db, tenant_id=tenant_id)
            confirm_button_id = (
                f"{_BUTTON_CONFIRM_PREFIX}{reference_id}" if reference_id is not None else settings["confirm_keyword"]
            )
            reschedule_button_id = (
                f"{_BUTTON_RESCHEDULE_PREFIX}{reference_id}" if reference_id is not None else settings["reschedule_keyword"]
            )
            try:
                send_result = _evolution_send_buttons(
                    instance_name,
                    recipient,
                    title="Lembrete de agendamento",
                    body=message,
                    footer="Climaris",
                    buttons=[
                        {"buttonId": confirm_button_id, "buttonText": {"displayText": "Confirmar"}},
                        {"buttonId": reschedule_button_id, "buttonText": {"displayText": "Remarcar"}},
                    ],
                )
            except HTTPException:
                send_result = _evolution_send_text(instance_name, recipient, message)
        else:
            send_result = _evolution_send_text(instance_name, recipient, message)
        job.status = WhatsappMessageStatus.SENT
        job.provider_message_id = send_result.get("message_id")
        job.sent_at = datetime.now(timezone.utc)
        job.error_message = None
        append_event(db, tenant_id=tenant_id, event_type="sent", payload=send_result.get("raw_response"), job_id=job.id)
    except HTTPException as exc:
        job.status = WhatsappMessageStatus.FAILED
        job.failed_at = datetime.now(timezone.utc)
        job.error_message = str(exc.detail)
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="send_failed",
            payload={"error": str(exc.detail)},
            job_id=job.id,
        )
        db.commit()
        db.refresh(job)
        raise

    db.commit()
    db.refresh(job)
    return job


def _slugify_instance(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9_-]+", "-", value.strip().lower())
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    if not cleaned:
        return ""
    return cleaned[:120]


def ensure_tenant_instance(db: Session, *, tenant_id: int, requested_instance_name: str | None = None) -> str:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")

    if requested_instance_name:
        instance_name = _slugify_instance(requested_instance_name)
    elif tenant.whatsapp_instance_name:
        instance_name = tenant.whatsapp_instance_name
    else:
        instance_name = f"tenant-{tenant.id}"
    if not instance_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nome de instância inválido.")

    collision = db.execute(
        select(Tenant).where(Tenant.whatsapp_instance_name == instance_name, Tenant.id != tenant.id)
    ).scalar_one_or_none()
    if collision is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nome de instância já utilizado por outro tenant.")

    fetch_data = _evolution_request("GET", "/instance/fetchInstances")
    instances = fetch_data if isinstance(fetch_data, list) else fetch_data.get("instances", [])
    found = False
    if isinstance(instances, list):
        for item in instances:
            if not isinstance(item, dict):
                continue
            if item.get("name") == instance_name or item.get("instanceName") == instance_name:
                found = True
                break
    if not found:
        try:
            _evolution_request(
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
            # Idempotência: em algumas versões da Evolution o fetch não lista tudo,
            # mas o create responde 403 quando a instância já existe.
            detail = str(exc.detail).lower()
            if "already in use" not in detail and "already exists" not in detail:
                raise

    tenant.whatsapp_instance_name = instance_name
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return instance_name


def _as_dict(v: Any) -> dict[str, Any] | None:
    return v if isinstance(v, dict) else None


def _pick_base64_from_block(block: dict[str, Any]) -> str | None:
    b = block.get("base64")
    if isinstance(b, str) and b.strip():
        return b.strip()
    return None


def evolution_connect_qrcode_fields(payload: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """
    Interpreta o JSON de GET /instance/connect/{instance} (Evolution API).
    Retorna (valor para src da imagem do QR, pairing_code, instance.state em minúsculas).

    Quando a instância já está conectada, a Evolution costuma devolver só
    {"instance": {"state": "open"}} sem base64 — o painel não deve pedir QR nesse caso.
    """
    if not isinstance(payload, dict):
        return None, None, None

    state: str | None = None
    inst = _as_dict(payload.get("instance"))
    if inst is not None:
        raw_s = inst.get("state")
        if isinstance(raw_s, str) and raw_s.strip():
            state = raw_s.strip().lower()

    b64: str | None = _pick_base64_from_block(payload)

    if not b64:
        q = payload.get("qrcode")
        if isinstance(q, dict):
            b64 = _pick_base64_from_block(q)
        elif isinstance(q, str) and q.strip().startswith("data:image"):
            b64 = q.strip()

    if not b64:
        for key in ("data", "response"):
            block = _as_dict(payload.get(key))
            if block is None:
                continue
            b64 = _pick_base64_from_block(block)
            if b64:
                break
            inner = block.get("qrcode")
            if isinstance(inner, dict):
                b64 = _pick_base64_from_block(inner)
                if b64:
                    break

    pairing: str | None = None
    for p in (payload.get("pairingCode"), payload.get("pairing_code")):
        if isinstance(p, str) and p.strip():
            pairing = p.strip()
            break
    if pairing is None:
        q = payload.get("qrcode")
        if isinstance(q, dict):
            pc = q.get("pairingCode")
            if isinstance(pc, str) and pc.strip():
                pairing = pc.strip()

    return b64, pairing, state


def get_instance_qrcode(instance_name: str) -> dict[str, Any]:
    return _evolution_request("GET", f"/instance/connect/{instance_name}")


def get_instance_state(instance_name: str) -> dict[str, Any]:
    return _evolution_request("GET", f"/instance/connectionState/{instance_name}")


def disconnect_instance(instance_name: str) -> dict[str, Any]:
    last_exc: HTTPException | None = None
    for method, path in (
        ("DELETE", f"/instance/logout/{instance_name}"),
        ("DELETE", f"/instance/disconnect/{instance_name}"),
        ("PUT", f"/instance/restart/{instance_name}"),
    ):
        try:
            return _evolution_request(method, path)
        except HTTPException as exc:
            last_exc = exc
    if last_exc:
        raise last_exc
    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Falha ao desconectar instância do WhatsApp.")


def _format_local_datetime(dt: datetime, tz: ZoneInfo) -> str:
    return dt.astimezone(tz).strftime("%d/%m/%Y %H:%M")


def _collect_active_reminder_offsets(rules: dict[str, Any]) -> list[int]:
    offsets = list(rules.get("active_offsets_minutes") or [])
    unique = sorted({int(x) for x in offsets if isinstance(x, int) and x > 0})
    return unique


def dispatch_due_appointment_reminders(*, now_utc: datetime | None = None) -> dict[str, int]:
    now = now_utc or datetime.now(timezone.utc)
    now = now if now.tzinfo is not None else now.replace(tzinfo=timezone.utc)
    sent = 0
    checked = 0
    with SessionLocal() as db:
        tenants = db.execute(select(Tenant)).scalars().all()
        for tenant in tenants:
            rules = get_tenant_reminder_rules(db, tenant_id=tenant.id)
            offsets = _collect_active_reminder_offsets(rules)
            if not offsets:
                continue
            max_offset = max(offsets)
            window_end = now + timedelta(minutes=max_offset + 3)
            schedules = db.execute(
                select(Schedule)
                .where(
                    Schedule.tenant_id == tenant.id,
                    Schedule.starts_at >= now - timedelta(minutes=2),
                    Schedule.starts_at <= window_end,
                    Schedule.status.in_([ScheduleStatus.PENDING, ScheduleStatus.CONFIRMED]),
                )
                .options(selectinload(Schedule.client))
            ).scalars().all()
            for schedule in schedules:
                checked += 1
                client = schedule.client
                recipient = (client.whatsapp if client else None) or (client.phone if client else None)
                if not recipient:
                    continue
                for offset in offsets:
                    delta_seconds = int((schedule.starts_at - timedelta(minutes=offset) - now).total_seconds())
                    if abs(delta_seconds) > 70:
                        continue
                    existing = db.execute(
                        select(WhatsappMessageJob).where(
                            WhatsappMessageJob.tenant_id == tenant.id,
                            WhatsappMessageJob.reference_type == "schedule_reminder",
                            WhatsappMessageJob.reference_id == schedule.id,
                            WhatsappMessageJob.template_key == f"appointment_reminder_{offset}m",
                        )
                    ).scalar_one_or_none()
                    if existing is not None:
                        continue
                    try:
                        job = dispatch_appointment_reminder(
                            db,
                            tenant_id=tenant.id,
                            created_by_user=None,
                            recipient_whatsapp=recipient,
                            nome_cliente=(client.name if client else "Cliente"),
                            data_hora=_format_local_datetime(schedule.starts_at, _tenant_tz(tenant)),
                            empresa=tenant.name,
                            reference_id=schedule.id,
                        )
                        job.reference_type = "schedule_reminder"
                        job.template_key = f"appointment_reminder_{offset}m"
                        db.add(job)
                        db.commit()
                        sent += 1
                    except Exception:
                        db.rollback()
                        continue
    return {"checked": checked, "sent": sent}


def _build_reschedule_options_message(*, schedule: Schedule, options: list[WhatsappRescheduleOption], tenant_tz: ZoneInfo) -> str:
    lines = ["Recebemos seu pedido de remarcacao. Escolha uma opcao:", ""]
    for idx, item in enumerate(options, start=1):
        starts = _format_local_datetime(item.starts_at, tenant_tz)
        lines.append(f"{idx}) {starts} - responda {idx}")
    lines.append("")
    lines.append("Responda somente com o numero da opcao (ex.: 1).")
    return "\n".join(lines)


def _period_bucket(dt: datetime, tenant_tz: ZoneInfo) -> tuple[str, str]:
    local = dt.astimezone(tenant_tz)
    period = "manha" if local.hour < 13 else "tarde"
    return (local.date().isoformat(), period)


def _jump_to_end_of_conflicting_schedule(
    db: Session,
    *,
    tenant_id: int,
    technician_ids: list[int],
    starts_at: datetime,
    ends_at: datetime,
    ignore_schedule_id: int | None,
) -> datetime | None:
    if not technician_ids:
        return None
    conflict_end = db.execute(
        select(Schedule.ends_at)
        .join(ScheduleTechnician, Schedule.id == ScheduleTechnician.schedule_id)
        .where(
            Schedule.tenant_id == tenant_id,
            Schedule.status != ScheduleStatus.CANCELLED,
            ScheduleTechnician.technician_id.in_(technician_ids),
            Schedule.starts_at < _with_buffer(ends_at),
            Schedule.ends_at > starts_at,
            Schedule.id != ignore_schedule_id if ignore_schedule_id is not None else True,
        )
        .order_by(Schedule.ends_at.asc())
        .limit(1)
    ).scalar_one_or_none()
    if conflict_end is None:
        return None
    return _with_buffer(conflict_end)


def _create_reschedule_options_for_schedule(
    db: Session,
    *,
    tenant_id: int,
    schedule: Schedule,
    recipient_whatsapp: str,
) -> None:
    now = datetime.now(timezone.utc)
    if schedule.service_order_id is None:
        return
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return
    holidays = set(db.execute(select(TenantHoliday.holiday_date).where(TenantHoliday.tenant_id == tenant_id)).scalars().all())
    duration_minutes = max(1, int((schedule.ends_at - schedule.starts_at).total_seconds() // 60))
    technician_ids = [item.technician_id for item in schedule.technicians]
    multi_tech = len(technician_ids) > 0
    if not technician_ids:
        technician_ids = [
            row.id
            for row in db.execute(
                select(User)
                .where(
                    User.tenant_id == tenant_id,
                    User.role == UserRole.TECHNICIAN,
                    User.is_active.is_(True),
                )
                .order_by(User.id.asc())
            ).scalars().all()
        ]
    probe = _with_buffer(schedule.ends_at)
    suggestions: list[dict[str, Any]] = []
    used_periods: set[tuple[str, str]] = set()
    tenant_tz = _tenant_tz(tenant)
    attempts = 0
    while len(suggestions) < 4 and attempts < 1200:
        attempts += 1
        candidate_end = probe + timedelta(minutes=duration_minutes)
        try:
            _ensure_inside_workday(probe, candidate_end, tenant=tenant, holidays=holidays)
            chosen_tid: int | None = None
            if multi_tech:
                for technician_id in technician_ids:
                    _check_technician_conflict(
                        db=db,
                        tenant_id=tenant_id,
                        technician_id=technician_id,
                        starts_at=probe,
                        ends_at=candidate_end,
                        ignore_schedule_id=schedule.id,
                    )
                    _check_technician_work_rules(
                        db=db,
                        tenant_id=tenant_id,
                        technician_id=technician_id,
                        starts_at=probe,
                        ends_at=candidate_end,
                        tenant_tz=tenant_tz,
                    )
                chosen_tid = technician_ids[0]
            else:
                for technician_id in technician_ids:
                    try:
                        _check_technician_conflict(
                            db=db,
                            tenant_id=tenant_id,
                            technician_id=technician_id,
                            starts_at=probe,
                            ends_at=candidate_end,
                            ignore_schedule_id=schedule.id,
                        )
                        _check_technician_work_rules(
                            db=db,
                            tenant_id=tenant_id,
                            technician_id=technician_id,
                            starts_at=probe,
                            ends_at=candidate_end,
                            tenant_tz=tenant_tz,
                        )
                        chosen_tid = technician_id
                        break
                    except HTTPException:
                        continue
            if chosen_tid is None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="no slot")
            period_key = _period_bucket(probe, tenant_tz)
            if period_key in used_periods:
                probe = probe + timedelta(minutes=15)
                continue
            used_periods.add(period_key)
            suggestions.append(
                {
                    "starts_at": probe,
                    "ends_at": candidate_end,
                    "technician_id": chosen_tid,
                }
            )
            # Pega o primeiro horario de cada periodo (manha/tarde), evitando blocos muito proximos.
            local_probe = probe.astimezone(tenant_tz)
            if local_probe.hour < 13:
                next_local = local_probe.replace(hour=13, minute=0, second=0, microsecond=0)
            else:
                next_day = local_probe + timedelta(days=1)
                next_local = next_day.replace(hour=8, minute=0, second=0, microsecond=0)
            probe = next_local.astimezone(timezone.utc)
        except HTTPException:
            jump_probe = _jump_to_end_of_conflicting_schedule(
                db,
                tenant_id=tenant_id,
                technician_ids=technician_ids,
                starts_at=probe,
                ends_at=candidate_end,
                ignore_schedule_id=schedule.id,
            )
            probe = jump_probe if jump_probe is not None and jump_probe > probe else (probe + timedelta(minutes=15))
            continue
    if not suggestions:
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="schedule_action_reschedule_no_slots",
            payload={"schedule_id": schedule.id},
            job_id=None,
        )
        try:
            _evolution_send_text(
                _resolve_tenant_instance(db, tenant_id),
                normalize_whatsapp_number(recipient_whatsapp),
                "Não encontramos horários livres automáticos para remarcar agora. "
                "Um atendente pode ajudar ou tente novamente em alguns minutos.",
            )
        except HTTPException:
            pass
        return
    db.execute(
        delete(WhatsappRescheduleOption).where(
            WhatsappRescheduleOption.tenant_id == tenant_id,
            WhatsappRescheduleOption.schedule_id == schedule.id,
            WhatsappRescheduleOption.selected_at.is_(None),
            WhatsappRescheduleOption.expires_at > now,
        )
    )
    created: list[WhatsappRescheduleOption] = []
    for idx, slot in enumerate(suggestions[:4], start=1):
        option = WhatsappRescheduleOption(
            tenant_id=tenant_id,
            schedule_id=schedule.id,
            option_code=f"R{schedule.id}-{idx}",
            starts_at=slot["starts_at"],
            ends_at=slot["ends_at"],
            technician_id=slot["technician_id"],
            # Opções de remarcação devem expirar rápido para evitar escolha de horário antigo.
            expires_at=now + timedelta(minutes=RESCHEDULE_OPTIONS_TTL_MINUTES),
        )
        db.add(option)
        created.append(option)
    db.flush()
    body = _build_reschedule_options_message(schedule=schedule, options=created, tenant_tz=_tenant_tz(tenant))
    send_result = _evolution_send_text(_resolve_tenant_instance(db, tenant_id), normalize_whatsapp_number(recipient_whatsapp), body)
    append_event(
        db,
        tenant_id=tenant_id,
        event_type="schedule_reschedule_options_sent",
        payload={"schedule_id": schedule.id, "message_id": send_result.get("message_id"), "options": [o.option_code for o in created]},
        job_id=None,
    )


def _create_reschedule_options_for_specific_date(
    db: Session,
    *,
    tenant_id: int,
    schedule: Schedule,
    recipient_whatsapp: str,
    target_date_local: datetime,
) -> None:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        return
    now = datetime.now(timezone.utc)
    tenant_tz = _tenant_tz(tenant)
    duration_minutes = max(1, int((schedule.ends_at - schedule.starts_at).total_seconds() // 60))
    holidays = set(db.execute(select(TenantHoliday.holiday_date).where(TenantHoliday.tenant_id == tenant_id)).scalars().all())
    technician_ids = [item.technician_id for item in schedule.technicians]

    local_base = target_date_local.astimezone(tenant_tz).replace(hour=8, minute=0, second=0, microsecond=0)
    local_limit = local_base.replace(hour=18, minute=0, second=0, microsecond=0)
    probe_local = local_base

    morning: list[dict[str, Any]] = []
    afternoon: list[dict[str, Any]] = []

    while probe_local < local_limit and (len(morning) < 2 or len(afternoon) < 2):
        period = "morning" if probe_local.hour < 12 else "afternoon"
        if (period == "morning" and len(morning) >= 2) or (period == "afternoon" and len(afternoon) >= 2):
            probe_local += timedelta(minutes=15)
            continue
        start_utc = probe_local.astimezone(timezone.utc)
        end_utc = (probe_local + timedelta(minutes=duration_minutes)).astimezone(timezone.utc)
        try:
            _ensure_inside_workday(start_utc, end_utc, tenant=tenant, holidays=holidays)
            for technician_id in technician_ids:
                _check_technician_conflict(
                    db=db,
                    tenant_id=tenant_id,
                    technician_id=technician_id,
                    starts_at=start_utc,
                    ends_at=end_utc,
                    ignore_schedule_id=schedule.id,
                )
                _check_technician_work_rules(
                    db=db,
                    tenant_id=tenant_id,
                    technician_id=technician_id,
                    starts_at=start_utc,
                    ends_at=end_utc,
                    tenant_tz=tenant_tz,
                )
            item = {
                "starts_at": start_utc,
                "ends_at": end_utc,
                "technician_id": technician_ids[0] if technician_ids else None,
            }
            if period == "morning":
                morning.append(item)
            else:
                afternoon.append(item)
        except HTTPException:
            jump_probe = _jump_to_end_of_conflicting_schedule(
                db,
                tenant_id=tenant_id,
                technician_ids=technician_ids,
                starts_at=start_utc,
                ends_at=end_utc,
                ignore_schedule_id=schedule.id,
            )
            if jump_probe is not None and jump_probe > start_utc:
                probe_local = jump_probe.astimezone(tenant_tz)
            else:
                probe_local += timedelta(minutes=15)
            continue
        probe_local += timedelta(minutes=15)

    suggestions = morning + afternoon
    if not suggestions:
        body = (
            f"Nao encontramos horarios disponiveis em {target_date_local.astimezone(tenant_tz).strftime('%d/%m/%Y')}. "
            "Responda outra data no formato DD/MM/AAAA."
        )
        _evolution_send_text(_resolve_tenant_instance(db, tenant_id), normalize_whatsapp_number(recipient_whatsapp), body)
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="schedule_reschedule_specific_date_no_slots",
            payload={"schedule_id": schedule.id, "target_date": target_date_local.date().isoformat()},
            job_id=None,
        )
        return

    db.execute(
        delete(WhatsappRescheduleOption).where(
            WhatsappRescheduleOption.tenant_id == tenant_id,
            WhatsappRescheduleOption.schedule_id == schedule.id,
            WhatsappRescheduleOption.selected_at.is_(None),
            WhatsappRescheduleOption.expires_at > now,
        )
    )
    created: list[WhatsappRescheduleOption] = []
    for idx, slot in enumerate(suggestions[:4], start=1):
        option = WhatsappRescheduleOption(
            tenant_id=tenant_id,
            schedule_id=schedule.id,
            option_code=f"R{schedule.id}-{idx}",
            starts_at=slot["starts_at"],
            ends_at=slot["ends_at"],
            technician_id=slot["technician_id"],
            expires_at=now + timedelta(minutes=RESCHEDULE_OPTIONS_TTL_MINUTES),
        )
        db.add(option)
        created.append(option)
    db.flush()
    body = _build_reschedule_options_message(schedule=schedule, options=created, tenant_tz=tenant_tz)
    send_result = _evolution_send_text(_resolve_tenant_instance(db, tenant_id), normalize_whatsapp_number(recipient_whatsapp), body)
    append_event(
        db,
        tenant_id=tenant_id,
        event_type="schedule_reschedule_specific_date_options_sent",
        payload={
            "schedule_id": schedule.id,
            "target_date": target_date_local.date().isoformat(),
            "message_id": send_result.get("message_id"),
            "options": [o.option_code for o in created],
        },
        job_id=None,
    )


def _digits_from_whatsapp_jid(remote_jid: str | None) -> str | None:
    if not remote_jid:
        return None
    digits = "".join(ch for ch in remote_jid if ch.isdigit())
    return digits or None


def _lookup_client_name_for_whatsapp_digits(db: Session, *, tenant_id: int, digits: str) -> str | None:
    if len(digits) < 10:
        return None
    suffix11 = digits[-11:] if len(digits) >= 11 else digits
    suffix10 = digits[-10:]
    row = db.execute(
        select(Client.name).where(
            Client.tenant_id == tenant_id,
            or_(
                Client.whatsapp.like(f"%{suffix11}%"),
                Client.phone.like(f"%{suffix11}%"),
                Client.whatsapp.like(f"%{suffix10}%"),
                Client.phone.like(f"%{suffix10}%"),
            ),
        ).limit(1)
    ).scalar_one_or_none()
    if row is None:
        return None
    name = str(row).strip()
    return name or None


def _incoming_from_me_remote_and_plain_text(payload: dict[str, Any]) -> tuple[bool, str | None, str]:
    """fromMe, remoteJid (minúsculo), texto sem alterar caixa (para IA)."""
    data_inner = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    key_data = data_inner.get("key") if isinstance(data_inner.get("key"), dict) else {}
    from_me = bool(key_data.get("fromMe"))
    remote_jid = str(key_data.get("remoteJid") or "").strip().lower() or None
    message = data_inner.get("message") if isinstance(data_inner.get("message"), dict) else {}
    raw = ""
    if isinstance(message, dict):
        raw = str(message.get("conversation") or "").strip()
        if not raw and isinstance(message.get("extendedTextMessage"), dict):
            raw = str(message["extendedTextMessage"].get("text") or "").strip()
    return from_me, remote_jid, raw


def _normalize_text_for_intent(value: str) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return ""
    return "".join(ch for ch in unicodedata.normalize("NFD", raw) if unicodedata.category(ch) != "Mn")


def _is_human_handoff_on_intent(value: str) -> bool:
    text = _normalize_text_for_intent(value)
    return any(k in text for k in HUMAN_HANDOFF_ON_KEYWORDS)


def _is_human_handoff_off_intent(value: str) -> bool:
    text = _normalize_text_for_intent(value)
    return any(k in text for k in HUMAN_HANDOFF_OFF_KEYWORDS)


def _set_human_handoff_state(
    db: Session,
    *,
    tenant_id: int,
    whatsapp_digits: str,
    enabled: bool,
    source: str,
) -> None:
    append_event(
        db,
        tenant_id=tenant_id,
        event_type=("whatsapp_ai_handoff_on" if enabled else "whatsapp_ai_handoff_off"),
        payload={
            "whatsapp_digits": whatsapp_digits,
            "enabled": enabled,
            "source": source,
        },
        job_id=None,
    )


def _is_human_handoff_active(db: Session, *, tenant_id: int, whatsapp_digits: str) -> bool:
    rows = db.execute(
        select(WhatsappMessageEvent)
        .where(
            WhatsappMessageEvent.tenant_id == tenant_id,
            WhatsappMessageEvent.event_type.in_(("whatsapp_ai_handoff_on", "whatsapp_ai_handoff_off")),
        )
        .order_by(WhatsappMessageEvent.id.desc())
        .limit(200)
    ).scalars().all()
    for row in rows:
        raw = (row.payload_json or "").strip()
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, dict):
            continue
        if str(payload.get("whatsapp_digits") or "").strip() != whatsapp_digits:
            continue
        return bool(payload.get("enabled"))
    return False


def consume_evolution_webhook(db: Session, *, tenant_id: int, payload: dict[str, Any]) -> None:
    # Webhooks atrasados podem chegar depois que o tenant foi removido.
    # Ignoramos silenciosamente para evitar erro de FK em whatsapp_message_events.
    if db.get(Tenant, tenant_id) is None:
        return
    data = payload if isinstance(payload, dict) else {}
    event_name = str(data.get("event") or data.get("type") or "unknown")
    provider_message_id = None
    if isinstance(data.get("data"), dict):
        data_block = data["data"]
        key_block = data_block.get("key")
        if isinstance(key_block, dict):
            provider_message_id = key_block.get("id")
        if provider_message_id is None:
            provider_message_id = data_block.get("id")

    job = None
    if provider_message_id:
        job = db.execute(
            select(WhatsappMessageJob).where(
                WhatsappMessageJob.tenant_id == tenant_id,
                WhatsappMessageJob.provider_message_id == str(provider_message_id),
            )
        ).scalar_one_or_none()
    if job is not None:
        lowered = event_name.lower()
        now = datetime.now(timezone.utc)
        if "delivery" in lowered or "delivered" in lowered:
            job.status = WhatsappMessageStatus.DELIVERED
            job.delivered_at = now
        elif "read" in lowered:
            job.status = WhatsappMessageStatus.READ
            job.read_at = now
        elif "fail" in lowered:
            job.status = WhatsappMessageStatus.FAILED
            job.failed_at = now

    action_type: str | None = None
    action_schedule_id: int | None = None
    action_option_code: str | None = None
    incoming_message_id = _incoming_message_id(data)
    incoming_sender, incoming_text = _incoming_sender_and_text(data)
    already_processed = False
    if event_name.lower() == "messages.upsert":
        data_block = data.get("data") if isinstance(data, dict) else {}
        ts_raw = data_block.get("messageTimestamp") if isinstance(data_block, dict) else None
        if isinstance(ts_raw, (int, float)):
            ts_dt = datetime.fromtimestamp(float(ts_raw), tz=timezone.utc)
            # Ignora replay antigo para evitar loops em reentrega/backfill da Evolution.
            if datetime.now(timezone.utc) - ts_dt > timedelta(minutes=10):
                append_event(
                    db,
                    tenant_id=tenant_id,
                    event_type="incoming_message_ignored_stale",
                    payload={"message_id": incoming_message_id, "message_timestamp": ts_dt.isoformat()},
                    job_id=None,
                )
                db.commit()
                return
        if incoming_message_id:
            already_processed = _incoming_message_already_processed(
                db, tenant_id=tenant_id, message_id=incoming_message_id
            )
        if not already_processed:
            action_type, action_schedule_id, action_option_code = _extract_incoming_schedule_action(
                db, tenant_id=tenant_id, payload=data
            )
    append_event(db, tenant_id=tenant_id, event_type=event_name, payload=data, job_id=job.id if job else None)
    if action_type:
        _apply_schedule_action_from_whatsapp(
            db,
            tenant_id=tenant_id,
            action_type=action_type,
            schedule_id=action_schedule_id,
            option_code=action_option_code,
            payload=data,
        )
    preventive_handled = False
    if (
        event_name.lower() == "messages.upsert"
        and incoming_message_id
        and not already_processed
        and not action_type
    ):
        from app.preventive_maintenance import try_consume_preventive_reply

        preventive_handled = try_consume_preventive_reply(db, tenant_id=tenant_id, payload=data)
    if event_name.lower() == "messages.upsert" and incoming_message_id and not already_processed:
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="incoming_message_processed",
            payload={"message_id": incoming_message_id},
            job_id=None,
        )
    if event_name.lower() == "messages.upsert" and incoming_sender and incoming_text:
        append_event(
            db,
            tenant_id=tenant_id,
            event_type="incoming_text_processed",
            payload={"sender": incoming_sender, "text": incoming_text},
            job_id=None,
        )
    if (
        WHATSAPP_AI_INCOMING_ENABLED
        and event_name.lower() == "messages.upsert"
        and incoming_message_id
        and not already_processed
        and not action_type
        and not preventive_handled
    ):
        from_me_ai, remote_ai, plain_text = _incoming_from_me_remote_and_plain_text(data)
        if (
            not from_me_ai
            and plain_text.strip()
            and remote_ai
            and not remote_ai.endswith("@g.us")
        ):
            digits = _digits_from_whatsapp_jid(remote_ai)
            if digits:
                try:
                    if _is_human_handoff_off_intent(plain_text):
                        _set_human_handoff_state(
                            db,
                            tenant_id=tenant_id,
                            whatsapp_digits=digits,
                            enabled=False,
                            source="incoming_message",
                        )
                        inst = _resolve_tenant_instance(db, tenant_id)
                        _evolution_send_text(
                            inst,
                            normalize_whatsapp_number(digits),
                            "Perfeito! Reativei o assistente virtual aqui. Pode continuar 🙂",
                        )
                        append_event(
                            db,
                            tenant_id=tenant_id,
                            event_type="whatsapp_ai_handoff_resumed",
                            payload={"message_id": incoming_message_id, "sender": digits},
                            job_id=None,
                        )
                        db.commit()
                        return

                    if _is_human_handoff_on_intent(plain_text):
                        _set_human_handoff_state(
                            db,
                            tenant_id=tenant_id,
                            whatsapp_digits=digits,
                            enabled=True,
                            source="incoming_message",
                        )
                        inst = _resolve_tenant_instance(db, tenant_id)
                        _evolution_send_text(
                            inst,
                            normalize_whatsapp_number(digits),
                            "Perfeito! Vou pausar o assistente virtual por aqui e encaminhar para um atendente humano.",
                        )
                        append_event(
                            db,
                            tenant_id=tenant_id,
                            event_type="whatsapp_ai_handoff_paused",
                            payload={"message_id": incoming_message_id, "sender": digits},
                            job_id=None,
                        )
                        db.commit()
                        return

                    if _is_human_handoff_active(db, tenant_id=tenant_id, whatsapp_digits=digits):
                        append_event(
                            db,
                            tenant_id=tenant_id,
                            event_type="whatsapp_ai_skipped_handoff_active",
                            payload={"message_id": incoming_message_id, "sender": digits},
                            job_id=None,
                        )
                        db.commit()
                        return

                    client_nm = _lookup_client_name_for_whatsapp_digits(db, tenant_id=tenant_id, digits=digits)
                    ai_out = generate_ai_response(
                        db,
                        message_text=plain_text,
                        tenant_id=tenant_id,
                        client_name=client_nm,
                        client_whatsapp=digits,
                    )
                    reply = (ai_out.get("reply_text") or "").strip()
                    if reply:
                        inst = _resolve_tenant_instance(db, tenant_id)
                        _evolution_send_text(inst, normalize_whatsapp_number(digits), reply)
                        append_event(
                            db,
                            tenant_id=tenant_id,
                            event_type="whatsapp_ai_reply_sent",
                            payload={
                                "intent": ai_out.get("intent"),
                                "message_id": incoming_message_id,
                            },
                            job_id=None,
                        )
                except HTTPException as exc:
                    logger.warning(
                        "IA WhatsApp rejeitada (tenant_id=%s): %s",
                        tenant_id,
                        getattr(exc, "detail", exc),
                    )
                except Exception:
                    logger.exception(
                        "Falha ao gerar/enviar resposta IA WhatsApp (tenant_id=%s)",
                        tenant_id,
                    )
    db.commit()


def tenant_id_from_webhook_payload(db: Session, payload: dict[str, Any]) -> int | None:
    if not isinstance(payload, dict):
        return None
    candidates: list[str] = []
    direct = payload.get("instance")
    if isinstance(direct, str):
        candidates.append(direct)
    if isinstance(payload.get("instanceName"), str):
        candidates.append(payload["instanceName"])
    data = payload.get("data")
    if isinstance(data, dict):
        if isinstance(data.get("instance"), str):
            candidates.append(data["instance"])
        if isinstance(data.get("instanceName"), str):
            candidates.append(data["instanceName"])
    for name in candidates:
        tenant = db.execute(select(Tenant).where(Tenant.whatsapp_instance_name == name)).scalar_one_or_none()
        if tenant is not None:
            return tenant.id
    return None


def _extract_incoming_schedule_action(
    db: Session,
    *,
    tenant_id: int,
    payload: dict[str, Any],
) -> tuple[str | None, int | None, str | None]:
    if not isinstance(payload, dict):
        return None, None, None
    data = payload.get("data")
    if not isinstance(data, dict):
        return None, None, None
    key_data = data.get("key")
    if isinstance(key_data, dict) and bool(key_data.get("fromMe")):
        # Nunca interpreta acoes a partir de mensagens enviadas pela propria instancia.
        return None, None, None
    if isinstance(key_data, dict):
        remote_jid = str(key_data.get("remoteJid") or "").strip().lower()
        if remote_jid.endswith("@g.us"):
            # Ignora grupos para evitar ruido e acoes acidentais.
            return None, None, None
    message = data.get("message") if isinstance(data.get("message"), dict) else {}

    selected_id: str | None = None
    selected_text: str | None = None

    btn_response = message.get("buttonsResponseMessage") if isinstance(message, dict) else None
    if isinstance(btn_response, dict):
        selected_id = str(btn_response.get("selectedButtonId") or "").strip() or None
        selected_text = str(btn_response.get("selectedDisplayText") or "").strip() or None

    button_reply = message.get("buttonReply") if isinstance(message, dict) else None
    if not selected_id and isinstance(button_reply, dict):
        selected_id = str(button_reply.get("id") or "").strip() or None
        selected_text = str(button_reply.get("displayText") or "").strip() or selected_text

    list_response = message.get("listResponseMessage") if isinstance(message, dict) else None
    if not selected_id and isinstance(list_response, dict):
        single_select = list_response.get("singleSelectReply")
        if isinstance(single_select, dict):
            selected_id = str(single_select.get("selectedRowId") or "").strip() or None

    interactive_response = message.get("interactiveResponseMessage") if isinstance(message, dict) else None
    if not selected_id and isinstance(interactive_response, dict):
        native_flow = interactive_response.get("nativeFlowResponseMessage")
        if isinstance(native_flow, dict):
            params_json = native_flow.get("paramsJson")
            if isinstance(params_json, str) and params_json.strip():
                try:
                    params_obj = json.loads(params_json)
                except Exception:
                    params_obj = {}
                if isinstance(params_obj, dict):
                    selected_id = str(
                        params_obj.get("id")
                        or params_obj.get("buttonId")
                        or params_obj.get("rowId")
                        or ""
                    ).strip() or None
                    selected_text = str(
                        params_obj.get("display_text")
                        or params_obj.get("displayText")
                        or ""
                    ).strip() or selected_text

    if selected_id:
        if selected_id.startswith(_BUTTON_CONFIRM_PREFIX):
            raw_id = selected_id[len(_BUTTON_CONFIRM_PREFIX) :]
            return "confirm", int(raw_id) if raw_id.isdigit() else None, None
        if selected_id.startswith(_BUTTON_RESCHEDULE_PREFIX):
            raw_id = selected_id[len(_BUTTON_RESCHEDULE_PREFIX) :]
            return "reschedule", int(raw_id) if raw_id.isdigit() else None, None

    raw_text = (
        (str(message.get("conversation")) if isinstance(message, dict) and message.get("conversation") else "")
        or (
            str(message.get("extendedTextMessage", {}).get("text"))
            if isinstance(message, dict) and isinstance(message.get("extendedTextMessage"), dict)
            else ""
        )
        or selected_text
        or selected_id
        or ""
    ).strip()
    if not raw_text:
        return None, None, None
    normalized = raw_text.upper()
    normalized_simple = _normalize_user_text(raw_text)
    sender_number: str | None = None
    if isinstance(data, dict):
        key_data = data.get("key")
        if isinstance(key_data, dict):
            remote_jid = str(key_data.get("remoteJid") or "").strip()
            if remote_jid:
                sender_number = "".join(ch for ch in remote_jid if ch.isdigit())
        if not sender_number:
            sender_raw = str(data.get("from") or "").strip()
            if sender_raw:
                sender_number = "".join(ch for ch in sender_raw if ch.isdigit())
    settings = get_tenant_appointment_message_settings(db, tenant_id=tenant_id)
    inferred_schedule_id: int | None = None
    if sender_number:
        # Prioriza contexto de opcoes ativas (resposta 1/2/3/4 e Rxx-x).
        inferred_schedule_id = _infer_schedule_id_from_active_reschedule_options(
            db, tenant_id=tenant_id, sender_number=sender_number
        )
        if inferred_schedule_id is None:
            candidate_job = db.execute(
                select(WhatsappMessageJob)
                .where(
                    WhatsappMessageJob.tenant_id == tenant_id,
                    WhatsappMessageJob.reference_type == "schedule_reminder",
                    WhatsappMessageJob.recipient_whatsapp.like(f"%{sender_number[-11:]}%"),
                )
                .order_by(WhatsappMessageJob.id.desc())
                .limit(1)
            ).scalar_one_or_none()
            if candidate_job is not None and candidate_job.reference_id:
                inferred_schedule_id = int(candidate_job.reference_id)
    option_match = re.search(r"(R\d+-\d+)", normalized)
    if option_match:
        code = option_match.group(1)
        sid_part = code.split("-")[0].replace("R", "")
        return "reschedule_pick", int(sid_part) if sid_part.isdigit() else inferred_schedule_id, code
    simple_pick_match = re.search(r"\b([1-4])\b", normalized_simple)
    if simple_pick_match and inferred_schedule_id is not None:
        return "reschedule_pick", inferred_schedule_id, f"R{inferred_schedule_id}-{simple_pick_match.group(1)}"
    confirm_kw = _normalize_user_text(str(settings["confirm_keyword"]))
    reschedule_kw = _normalize_user_text(str(settings["reschedule_keyword"]))

    def _with_next_visit_fallback(sid: int | None) -> int | None:
        if sid is not None or not sender_number:
            return sid
        return _infer_schedule_id_from_client_next_visit(db, tenant_id=tenant_id, sender_number=sender_number)

    if normalized_simple == confirm_kw or normalized_simple.startswith(confirm_kw):
        sid = _with_next_visit_fallback(inferred_schedule_id)
        if sid is None:
            return None, None, None
        return "confirm", sid, None
    if normalized_simple == reschedule_kw or normalized_simple.startswith(reschedule_kw):
        sid = _with_next_visit_fallback(inferred_schedule_id)
        if sid is None:
            return None, None, None
        return "reschedule", sid, None
    if normalized_simple.startswith("CANCEL"):
        sid = _with_next_visit_fallback(inferred_schedule_id)
        if sid is None:
            return None, None, None
        return "cancel", sid, None
    return None, None, None


def _infer_schedule_id_from_active_reschedule_options(
    db: Session,
    *,
    tenant_id: int,
    sender_number: str,
) -> int | None:
    now = datetime.now(timezone.utc)
    suffix11 = sender_number[-11:] if sender_number else ""
    suffix10 = sender_number[-10:] if sender_number else ""
    if not suffix10:
        return None
    schedule_id = db.execute(
        select(WhatsappRescheduleOption.schedule_id)
        .join(Schedule, Schedule.id == WhatsappRescheduleOption.schedule_id)
        .join(Client, Client.id == Schedule.client_id)
        .where(
            WhatsappRescheduleOption.tenant_id == tenant_id,
            WhatsappRescheduleOption.selected_at.is_(None),
            WhatsappRescheduleOption.expires_at >= now,
            Schedule.tenant_id == tenant_id,
            (
                Client.whatsapp.like(f"%{suffix11}%")
                | Client.phone.like(f"%{suffix11}%")
                | Client.whatsapp.like(f"%{suffix10}%")
                | Client.phone.like(f"%{suffix10}%")
            ),
        )
        .order_by(desc(WhatsappRescheduleOption.id))
        .limit(1)
    ).scalar_one_or_none()
    return int(schedule_id) if schedule_id is not None else None


def _infer_schedule_id_from_client_next_visit(
    db: Session,
    *,
    tenant_id: int,
    sender_number: str,
) -> int | None:
    """Próxima visita ativa do cliente (fallback quando não há lembrete/opções recentes no WhatsApp)."""
    suffix11 = sender_number[-11:] if sender_number else ""
    suffix10 = sender_number[-10:] if sender_number else ""
    if not suffix10:
        return None
    now = datetime.now(timezone.utc)
    row = db.execute(
        select(Schedule.id)
        .join(Client, Client.id == Schedule.client_id)
        .where(
            Schedule.tenant_id == tenant_id,
            Schedule.status.in_(
                [ScheduleStatus.PENDING, ScheduleStatus.CONFIRMED, ScheduleStatus.IN_PROGRESS]
            ),
            Schedule.starts_at >= now - timedelta(days=1),
            (
                Client.whatsapp.like(f"%{suffix11}%")
                | Client.phone.like(f"%{suffix11}%")
                | Client.whatsapp.like(f"%{suffix10}%")
                | Client.phone.like(f"%{suffix10}%")
            ),
        )
        .order_by(Schedule.starts_at.asc())
        .limit(1)
    ).scalar_one_or_none()
    return int(row) if row is not None else None


def _normalize_user_text(value: str) -> str:
    raw = (value or "").strip().upper()
    if not raw:
        return ""
    no_accent = "".join(
        ch for ch in unicodedata.normalize("NFD", raw) if unicodedata.category(ch) != "Mn"
    )
    cleaned = re.sub(r"[^A-Z0-9/ ]+", " ", no_accent)
    return re.sub(r"\s+", " ", cleaned).strip()


def _incoming_message_id(payload: dict[str, Any]) -> str | None:
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if not isinstance(data, dict):
        return None
    key_data = data.get("key")
    if isinstance(key_data, dict):
        raw = str(key_data.get("id") or "").strip()
        if raw:
            return raw
    raw_data_id = str(data.get("id") or "").strip()
    return raw_data_id or None


def _incoming_message_already_processed(db: Session, *, tenant_id: int, message_id: str) -> bool:
    pattern = f'%\"message_id\": \"{message_id}\"%'
    row = db.execute(
        select(WhatsappMessageEvent.id).where(
            WhatsappMessageEvent.tenant_id == tenant_id,
            WhatsappMessageEvent.event_type == "incoming_message_processed",
            WhatsappMessageEvent.payload_json.like(pattern),
        )
    ).first()
    return row is not None


def _incoming_sender_and_text(payload: dict[str, Any]) -> tuple[str | None, str | None]:
    if not isinstance(payload, dict):
        return None, None
    data = payload.get("data")
    if not isinstance(data, dict):
        return None, None
    key_data = data.get("key")
    sender = None
    if isinstance(key_data, dict):
        sender = str(key_data.get("remoteJid") or "").strip().lower() or None
    message = data.get("message")
    text = ""
    if isinstance(message, dict):
        text = str(message.get("conversation") or "").strip()
        if not text and isinstance(message.get("extendedTextMessage"), dict):
            text = str(message["extendedTextMessage"].get("text") or "").strip()
    text = text.upper()
    return sender, (text or None)


def _latest_schedule_action_at(
    db: Session,
    *,
    tenant_id: int,
    schedule_id: int,
    event_type: str,
) -> datetime | None:
    pattern = f'%\"schedule_id\": {schedule_id}%'
    return db.execute(
        select(WhatsappMessageEvent.created_at)
        .where(
            WhatsappMessageEvent.tenant_id == tenant_id,
            WhatsappMessageEvent.event_type == event_type,
            WhatsappMessageEvent.payload_json.like(pattern),
        )
        .order_by(desc(WhatsappMessageEvent.id))
        .limit(1)
    ).scalar_one_or_none()


def _has_active_reschedule_options(db: Session, *, tenant_id: int, schedule_id: int) -> bool:
    now = datetime.now(timezone.utc)
    row = db.execute(
        select(WhatsappRescheduleOption.id).where(
            WhatsappRescheduleOption.tenant_id == tenant_id,
            WhatsappRescheduleOption.schedule_id == schedule_id,
            WhatsappRescheduleOption.selected_at.is_(None),
            WhatsappRescheduleOption.expires_at >= now,
        )
    ).first()
    return row is not None


def _apply_schedule_action_from_whatsapp(
    db: Session,
    *,
    tenant_id: int,
    action_type: str,
    schedule_id: int | None,
    option_code: str | None,
    payload: dict[str, Any],
) -> None:
    if schedule_id is None:
        append_event(
            db,
            tenant_id=tenant_id,
            event_type=f"schedule_action_{action_type}_without_reference",
            payload=payload,
            job_id=None,
        )
        return
    schedule = db.execute(
        select(Schedule)
        .where(Schedule.id == schedule_id, Schedule.tenant_id == tenant_id)
        .options(selectinload(Schedule.technicians), selectinload(Schedule.client))
    ).scalar_one_or_none()
    if schedule is None:
        append_event(
            db,
            tenant_id=tenant_id,
            event_type=f"schedule_action_{action_type}_not_found",
            payload={"schedule_id": schedule_id, "payload": payload},
            job_id=None,
        )
        return

    now_iso = datetime.now(timezone.utc).isoformat()
    if action_type == "confirm":
        if schedule.status not in (ScheduleStatus.CANCELLED, ScheduleStatus.COMPLETED):
            schedule.status = ScheduleStatus.CONFIRMED
            note = f"[WhatsApp] Cliente confirmou em {now_iso}."
            schedule.notes = f"{schedule.notes or ''}\n{note}".strip()
    elif action_type == "cancel":
        note = f"[WhatsApp] Cliente cancelou o fluxo de remarcacao em {now_iso}."
        schedule.notes = f"{schedule.notes or ''}\n{note}".strip()
        recipient = (schedule.client.whatsapp if schedule.client else None) or (schedule.client.phone if schedule.client else None)
        if recipient:
            _evolution_send_text(
                _resolve_tenant_instance(db, tenant_id),
                normalize_whatsapp_number(recipient),
                "Tudo bem, cancelamos a remarcacao por agora. Quando quiser, envie REMARCAR novamente.",
            )
    elif action_type == "reschedule":
        note = f"[WhatsApp] Cliente solicitou remarcacao em {now_iso}."
        schedule.notes = f"{schedule.notes or ''}\n{note}".strip()
        recipient = (schedule.client.whatsapp if schedule.client else None) or (schedule.client.phone if schedule.client else None)
        if recipient:
            _create_reschedule_options_for_schedule(
                db,
                tenant_id=tenant_id,
                schedule=schedule,
                recipient_whatsapp=recipient,
            )
    elif action_type == "reschedule_pick" and option_code:
        now_utc = datetime.now(timezone.utc)
        selected = db.execute(
            select(WhatsappRescheduleOption).where(
                WhatsappRescheduleOption.tenant_id == tenant_id,
                WhatsappRescheduleOption.schedule_id == schedule.id,
                WhatsappRescheduleOption.option_code == option_code,
                WhatsappRescheduleOption.selected_at.is_(None),
                WhatsappRescheduleOption.expires_at >= now_utc,
            )
        ).scalar_one_or_none()
        if selected:
            tenant = db.get(Tenant, tenant_id)
            if tenant is None:
                return
            try:
                # Hard-stop para impedir remarcação para horário no passado.
                if selected.starts_at < now_utc:
                    raise HTTPException(status_code=400, detail="Opção de remarcação já expirou.")
                holidays = set(
                    db.execute(select(TenantHoliday.holiday_date).where(TenantHoliday.tenant_id == tenant_id)).scalars().all()
                )
                _ensure_inside_workday(selected.starts_at, selected.ends_at, tenant=tenant, holidays=holidays)
                if schedule.technicians:
                    for item in schedule.technicians:
                        _check_technician_conflict(
                            db=db,
                            tenant_id=tenant_id,
                            technician_id=item.technician_id,
                            starts_at=selected.starts_at,
                            ends_at=selected.ends_at,
                            ignore_schedule_id=schedule.id,
                        )
                        _check_technician_work_rules(
                            db=db,
                            tenant_id=tenant_id,
                            technician_id=item.technician_id,
                            starts_at=selected.starts_at,
                            ends_at=selected.ends_at,
                            tenant_tz=_tenant_tz(tenant),
                        )
                elif selected.technician_id is not None:
                    tid_pick = int(selected.technician_id)
                    _check_technician_conflict(
                        db=db,
                        tenant_id=tenant_id,
                        technician_id=tid_pick,
                        starts_at=selected.starts_at,
                        ends_at=selected.ends_at,
                        ignore_schedule_id=schedule.id,
                    )
                    _check_technician_work_rules(
                        db=db,
                        tenant_id=tenant_id,
                        technician_id=tid_pick,
                        starts_at=selected.starts_at,
                        ends_at=selected.ends_at,
                        tenant_tz=_tenant_tz(tenant),
                    )
                schedule.starts_at = selected.starts_at
                schedule.ends_at = selected.ends_at
                schedule.status = ScheduleStatus.CONFIRMED
                if not schedule.technicians and selected.technician_id is not None:
                    db.add(ScheduleTechnician(schedule_id=schedule.id, technician_id=int(selected.technician_id)))
                pick_note = (
                    f"[WhatsApp] Horário atualizado para {_format_local_datetime(selected.starts_at, _tenant_tz(tenant))}."
                )
                schedule.notes = f"{schedule.notes or ''}\n{pick_note}".strip()
                selected.selected_at = datetime.now(timezone.utc)
                db.add(selected)
                # Ao remarcar, limpa lembretes antigos desse agendamento para permitir novo ciclo automatico.
                removed_jobs = db.execute(
                    delete(WhatsappMessageJob).where(
                        WhatsappMessageJob.tenant_id == tenant_id,
                        WhatsappMessageJob.reference_type == "schedule_reminder",
                        WhatsappMessageJob.reference_id == schedule.id,
                    )
                ).rowcount or 0
                response = (
                    f"Remarcado com sucesso para {_format_local_datetime(selected.starts_at, _tenant_tz(tenant))}. Obrigado!"
                )
                recipient = (schedule.client.whatsapp if schedule.client else None) or (schedule.client.phone if schedule.client else None)
                if recipient:
                    recipient_norm = normalize_whatsapp_number(recipient)
                    _evolution_send_text(_resolve_tenant_instance(db, tenant_id), recipient_norm, response)
                append_event(
                    db,
                    tenant_id=tenant_id,
                    event_type="schedule_reminder_cycle_reset",
                    payload={"schedule_id": schedule.id, "removed_jobs": int(removed_jobs)},
                    job_id=None,
                )
            except HTTPException:
                recipient = (schedule.client.whatsapp if schedule.client else None) or (schedule.client.phone if schedule.client else None)
                if recipient:
                    _evolution_send_text(
                        _resolve_tenant_instance(db, tenant_id),
                        normalize_whatsapp_number(recipient),
                        "Essa opcao acabou de ficar indisponivel. Vou enviar novas opcoes atualizadas.",
                    )
                    _create_reschedule_options_for_schedule(
                        db,
                        tenant_id=tenant_id,
                        schedule=schedule,
                        recipient_whatsapp=recipient,
                    )
        else:
            recipient = (schedule.client.whatsapp if schedule.client else None) or (schedule.client.phone if schedule.client else None)
            if recipient:
                _evolution_send_text(
                    _resolve_tenant_instance(db, tenant_id),
                    normalize_whatsapp_number(recipient),
                    "Opcao invalida ou expirada. Responda REMARCAR para receber novas opcoes.",
                )

    if action_type != "reschedule":
        append_event(
            db,
            tenant_id=tenant_id,
            event_type=f"schedule_action_{action_type}_applied",
            payload={"schedule_id": schedule.id},
            job_id=None,
        )
