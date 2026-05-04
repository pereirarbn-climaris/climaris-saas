from __future__ import annotations

import json
import logging
import ssl
import unicodedata
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import Select, delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import CLAUDE_API_KEY, CLAUDE_MODEL
from models import (
    AIChatHistory,
    AIPendingToolConfirmation,
    Schedule,
    ScheduleStatus,
    Service,
    Tenant,
    TenantAISettings,
)

logger = logging.getLogger("erp.ai.assistant")

SENSITIVE_TOOLS: frozenset[str] = frozenset({"cancel_appointment", "finalize_service"})
PENDING_CONFIRMATION_TTL = timedelta(minutes=30)


@dataclass
class CompanyContext:
    tenant_id: int
    company_name: str
    services: list[dict[str, Any]]
    prices: list[dict[str, Any]]
    cancellation_rules: str
    agent_name: str
    tone_of_voice: str
    custom_instructions: str
    model_slug: str

    @classmethod
    def from_db(cls, db: Session, tenant_id: int) -> "CompanyContext":
        tenant = db.get(Tenant, tenant_id)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")

        settings = db.execute(
            select(TenantAISettings).where(TenantAISettings.tenant_id == tenant_id)
        ).scalar_one_or_none()
        active_services = db.execute(
            select(Service)
            .where(Service.tenant_id == tenant_id, Service.is_active.is_(True))
            .order_by(Service.name.asc())
        ).scalars().all()

        services_payload = [
            {
                "name": service.name,
                "description": service.description or "",
                "estimated_duration_minutes": int(service.duration_minutes),
            }
            for service in active_services
        ]
        prices_payload = [
            {
                "service_name": service.name,
                "base_price_brl": float(service.price),
            }
            for service in active_services
        ]
        cancel_rules = (
            "Reagendamentos e cancelamentos devem ser confirmados por um atendente humano."
            if settings is None or not (settings.instructions or "").strip()
            else (settings.instructions or "").strip()
        )
        return cls(
            tenant_id=tenant_id,
            company_name=tenant.name,
            services=services_payload,
            prices=prices_payload,
            cancellation_rules=cancel_rules,
            agent_name=(settings.agent_name if settings else "Assistente") or "Assistente",
            tone_of_voice=(settings.tone_of_voice if settings else "amigavel") or "amigavel",
            custom_instructions=(settings.instructions if settings else "") or "",
            model_slug=(settings.model_slug if settings else CLAUDE_MODEL) or CLAUDE_MODEL,
        )


def _is_ai_enabled(db: Session, tenant_id: int) -> bool:
    row = db.execute(
        select(TenantAISettings).where(TenantAISettings.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if row is None:
        return True
    return bool(row.is_enabled)


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _build_system_prompt(context: CompanyContext) -> str:
    services_json = json.dumps(context.services, ensure_ascii=False)
    prices_json = json.dumps(context.prices, ensure_ascii=False)
    rules = _safe_text(context.cancellation_rules)
    instructions = _safe_text(context.custom_instructions)
    return f"""
<contexto_da_empresa>
Nome: {context.company_name}
Serviços: {services_json}
Preços: {prices_json}
Regras de Cancelamento: {rules}
</contexto_da_empresa>

<instrucoes_de_agente>
Você é {context.agent_name}, assistente de agendamento HVAC.
Tom de voz: {context.tone_of_voice}
Use somente os dados do contexto da empresa.
Nunca invente serviços, preços, condições ou políticas.
Se o cliente pedir algo fora do contexto, peça para aguardar um atendente humano.
Antes de usar a tool cancel_appointment ou finalize_service, pergunte ao cliente se ele confirma a ação (data/valor).
O sistema só executará essas tools depois de uma confirmação explícita do cliente (SIM). Não chame essas tools até o cliente confirmar por escrito.
{instructions}
</instrucoes_de_agente>
""".strip()


def _normalize_client_whatsapp_key(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = "".join(ch for ch in raw.strip() if ch.isdigit())
    if not digits:
        return None
    if len(digits) > 20:
        digits = digits[-20:]
    return digits


def _strip_accents_lower(value: str) -> str:
    raw = (value or "").strip().lower()
    return "".join(
        ch for ch in unicodedata.normalize("NFD", raw) if unicodedata.category(ch) != "Mn"
    )


def _user_message_confirms(value: str) -> bool:
    t = _strip_accents_lower(value)
    if not t:
        return False
    tokens = frozenset(t.replace(",", " ").split())
    if t in ("sim", "s", "ok", "pode", "confirmo", "isso", "certo", "blz", "beleza", "fechado", "manda", "gera"):
        return True
    return bool(tokens & {"sim", "confirmo", "pode", "ok", "certo", "blz", "beleza", "manda", "gera"})


def _user_message_denies(value: str) -> bool:
    t = _strip_accents_lower(value)
    if not t:
        return False
    if t.startswith("nao") or t.startswith("não") or t in ("n", "no"):
        return True
    return any(
        t.startswith(p)
        for p in ("nao ", "não ", "negativo", "cancela", "esquece", "pare", "melhor nao", "melhor não")
    )


def _get_pending_confirmation(
    db: Session, *, tenant_id: int, client_whatsapp: str
) -> AIPendingToolConfirmation | None:
    return db.execute(
        select(AIPendingToolConfirmation).where(
            AIPendingToolConfirmation.tenant_id == tenant_id,
            AIPendingToolConfirmation.client_whatsapp == client_whatsapp,
        )
    ).scalar_one_or_none()


def _clear_pending_confirmation(db: Session, *, tenant_id: int, client_whatsapp: str) -> None:
    db.execute(
        delete(AIPendingToolConfirmation).where(
            AIPendingToolConfirmation.tenant_id == tenant_id,
            AIPendingToolConfirmation.client_whatsapp == client_whatsapp,
        )
    )
    db.commit()


def _store_pending_confirmation(
    db: Session,
    *,
    tenant_id: int,
    client_whatsapp: str,
    tool_name: str,
    arguments: dict[str, Any],
    confirmation_prompt: str,
) -> None:
    _clear_pending_confirmation(db, tenant_id=tenant_id, client_whatsapp=client_whatsapp)
    row = AIPendingToolConfirmation(
        tenant_id=tenant_id,
        client_whatsapp=client_whatsapp,
        tool_name=tool_name,
        arguments_json=json.dumps(arguments, ensure_ascii=False),
        confirmation_prompt=confirmation_prompt,
        expires_at=datetime.now(timezone.utc) + PENDING_CONFIRMATION_TTL,
    )
    db.add(row)
    db.commit()


def _build_sensitive_confirmation_prompt(
    db: Session, *, tenant_id: int, tool_name: str, arguments: dict[str, Any]
) -> str:
    if tool_name == "cancel_appointment":
        aid = arguments.get("appointment_id")
        try:
            aid_int = int(aid) if aid is not None else None
        except (TypeError, ValueError):
            aid_int = None
        if aid_int is None:
            return (
                "Você confirma o cancelamento desta visita? "
                "Responda *SIM* para confirmar ou *NÃO* para deixar como está."
            )
        sched = db.execute(
            select(Schedule).where(Schedule.tenant_id == tenant_id, Schedule.id == aid_int)
        ).scalar_one_or_none()
        if sched is None:
            return (
                "Não encontrei esse agendamento. Confirma mesmo assim o cancelamento (ação pode falhar)? "
                "Responda *SIM* ou *NÃO*."
            )
        when = sched.starts_at.astimezone(timezone.utc).strftime("%d/%m/%Y às %H:%M (UTC)")
        return (
            f"Você confirma o cancelamento da visita agendada para *{when}*? "
            "Responda *SIM* para confirmar ou *NÃO* para manter o agendamento."
        )
    if tool_name == "finalize_service":
        try:
            amount = float(arguments.get("amount") or 0)
        except (TypeError, ValueError):
            amount = 0.0
        desc = str(arguments.get("description") or "serviço").strip() or "serviço"
        return (
            f"Posso gerar o link de pagamento no valor de *R$ {amount:.2f}* referente a: {desc}? "
            "Responda *SIM* para confirmar ou *NÃO* para não gerar agora."
        )
    return "Confirma esta ação? Responda *SIM* ou *NÃO*."


def _reply_after_confirmed_tool(tool_name: str, result: dict[str, Any]) -> str:
    if result.get("ok") is False:
        return str(result.get("message") or "Não foi possível concluir a ação. Tente de novo ou fale com um atendente.")
    if tool_name == "cancel_appointment":
        return "Pronto! O agendamento foi cancelado conforme solicitado."
    if tool_name == "finalize_service":
        pay = result.get("payment") if isinstance(result.get("payment"), dict) else {}
        url = str(pay.get("payment_url") or "").strip()
        if url:
            return (
                "Tudo certo! Segue o link de pagamento. "
                f"{url}\n"
                "(A emissão da NF seguirá o fluxo configurado na empresa.)"
            )
        return "Tudo certo! O fechamento foi registrado; em instantes envio o link de pagamento se ainda não apareceu acima."
    return "Ação concluída."


def _save_chat_history(
    db: Session,
    *,
    tenant_id: int,
    client_whatsapp: str | None,
    user_message: str,
    assistant_response: str,
    used_model: str | None,
    used_tools: list[dict[str, Any]],
    system_prompt_xml: str,
    is_mock: bool,
) -> None:
    try:
        row = AIChatHistory(
            tenant_id=tenant_id,
            client_whatsapp=(client_whatsapp or None),
            user_message=user_message,
            assistant_response=assistant_response,
            used_model=used_model,
            used_tools_json=json.dumps(used_tools, ensure_ascii=False) if used_tools else None,
            system_prompt_xml=system_prompt_xml,
            is_mock=is_mock,
        )
        db.add(row)
        db.commit()
    except SQLAlchemyError:
        logger.exception(
            "Falha ao gravar ai_chat_history (tenant_id=%s). Resposta ao cliente não será bloqueada.",
            tenant_id,
        )
        db.rollback()


def _fallback_local_reply(
    db: Session,
    *,
    tenant_id: int,
    message_text: str,
    client_name: str | None,
    context: CompanyContext,
) -> dict[str, str]:
    text = (message_text or "").strip().lower()
    name = (client_name or "cliente").strip()
    if any(k in text for k in ("orcamento", "orçamento", "valor", "preco", "preço", "quanto custa")):
        if context.prices:
            first = context.prices[0]
            return {
                "intent": "mock_preco_servico",
                "reply_text": (
                    f"[Simulação IA] O serviço de {first.get('service_name', 'serviço')} custa "
                    f"R$ {float(first.get('base_price_brl', 0)):.2f}. Deseja agendar?"
                ),
            }
        return {
            "intent": "mock_preco_servico",
            "reply_text": (
                f"[Simulação IA] Oi {name}! Ainda não há preços cadastrados para esta empresa. "
                "Deseja que eu te encaminhe para um atendente humano?"
            ),
        }
    if any(k in text for k in ("agendar", "agenda", "horario", "horário", "visita")):
        return {
            "intent": "mock_agendamento",
            "reply_text": (
                f"[Simulação IA] Verifiquei aqui e temos horários para a empresa {context.company_name}."
            ),
        }
    if any(k in text for k in ("status", "andamento", "aprovado", "reprovado")) and "orc" in text:
        return {
            "intent": "mock_status_orcamento",
            "reply_text": (
                f"Perfeito, {name}. Para consultar o status do orçamento, me envie o número do orçamento "
                "ou CPF/CNPJ do titular."
            ),
        }
    if any(k in text for k in ("atendente", "humano", "pessoa", "cancelar", "desmarcar")):
        return {
            "intent": "mock_falar_atendente",
            "reply_text": "Tudo bem! Vou encaminhar seu atendimento para nossa equipe humana.",
        }
    pending_stmt: Select[tuple[Schedule]] = (
        select(Schedule)
        .where(
            Schedule.tenant_id == tenant_id,
            Schedule.status.in_([ScheduleStatus.PENDING, ScheduleStatus.CONFIRMED, ScheduleStatus.IN_PROGRESS]),
        )
        .order_by(Schedule.starts_at.asc())
        .limit(1)
    )
    next_schedule = db.execute(pending_stmt).scalar_one_or_none()
    if next_schedule is not None and any(k in text for k in ("agenda", "horario", "horário", "agendamento")):
        return {
            "intent": "mock_agenda",
            "reply_text": "Posso te ajudar com agendamentos. Para confirmar disponibilidade, um atendente humano irá validar o horário.",
        }
    return {
        "intent": "mock_fallback",
        "reply_text": (
            "[Simulação IA] Posso ajudar com: valores de serviço, status de orçamento, agenda e atendimento humano. "
            "Me diga o que você precisa."
        ),
    }


def _get_available_slots(db: Session, *, tenant_id: int, date_str: str) -> dict[str, Any]:
    target = datetime.fromisoformat(date_str).date()
    start_utc = datetime.combine(target, time(0, 0, 0), tzinfo=timezone.utc)
    end_utc = datetime.combine(target, time(23, 59, 59), tzinfo=timezone.utc)
    busy = db.execute(
        select(Schedule)
        .where(
            Schedule.tenant_id == tenant_id,
            Schedule.status.in_([ScheduleStatus.PENDING, ScheduleStatus.CONFIRMED, ScheduleStatus.IN_PROGRESS]),
            Schedule.starts_at >= start_utc,
            Schedule.starts_at <= end_utc,
        )
    ).scalars().all()
    busy_hours = {s.starts_at.hour for s in busy}
    slots = []
    for h in range(8, 18):
        if h not in busy_hours:
            slots.append(f"{target.isoformat()}T{h:02d}:00:00")
    return {"date": target.isoformat(), "available_slots": slots[:8]}


def _cancel_appointment(db: Session, *, tenant_id: int, appointment_id: int) -> dict[str, Any]:
    sched = db.execute(
        select(Schedule).where(Schedule.tenant_id == tenant_id, Schedule.id == int(appointment_id))
    ).scalar_one_or_none()
    if sched is None:
        return {"ok": False, "message": "Agendamento não encontrado."}
    sched.status = ScheduleStatus.CANCELLED
    db.add(sched)
    db.commit()
    return {"ok": True, "appointment_id": sched.id, "status": sched.status.value}


def _generate_payment_link(*, amount: float, description: str) -> dict[str, Any]:
    token = f"sim-{int(datetime.now(timezone.utc).timestamp())}"
    return {
        "ok": True,
        "amount": float(amount),
        "description": (description or "Pagamento de serviço")[:120],
        "payment_url": f"https://pay.climaris.local/checkout/{token}",
    }


def _finalize_service(db: Session, *, tenant_id: int, appointment_id: int | None, amount: float, description: str) -> dict[str, Any]:
    if appointment_id is not None:
        try:
            aid = int(appointment_id)
        except (TypeError, ValueError):
            return {
                "ok": False,
                "message": "Não encontrei esse agendamento no sistema.",
            }
        sched = db.execute(
            select(Schedule).where(Schedule.tenant_id == tenant_id, Schedule.id == aid)
        ).scalar_one_or_none()
        if sched is None:
            return {
                "ok": False,
                "message": "Não encontrei esse agendamento no sistema.",
            }
        sched.status = ScheduleStatus.COMPLETED
        db.add(sched)
        db.commit()
        out: dict[str, Any] = {
            "ok": True,
            "appointment_status": sched.status.value,
            "appointment_id": sched.id,
        }
    else:
        out = {"ok": True}
    out["payment"] = _generate_payment_link(amount=amount, description=description)
    out["nf_status"] = "pending_external_invoice_integration"
    return out


def _tool_definitions() -> list[dict[str, Any]]:
    return [
        {
            "name": "get_available_slots",
            "description": "Consultar horários vagos por data.",
            "input_schema": {
                "type": "object",
                "properties": {"date": {"type": "string", "description": "Data ISO (YYYY-MM-DD)."}},
                "required": ["date"],
            },
        },
        {
            "name": "cancel_appointment",
            "description": "Cancelar agendamento existente pelo id.",
            "input_schema": {
                "type": "object",
                "properties": {"appointment_id": {"type": "integer"}},
                "required": ["appointment_id"],
            },
        },
        {
            "name": "generate_payment_link",
            "description": "Gerar link de pagamento para o cliente.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "amount": {"type": "number"},
                    "description": {"type": "string"},
                },
                "required": ["amount", "description"],
            },
        },
        {
            "name": "finalize_service",
            "description": "Finaliza serviço, prepara NF e link de pagamento.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "appointment_id": {"type": "integer"},
                    "amount": {"type": "number"},
                    "description": {"type": "string"},
                },
                "required": ["amount", "description"],
            },
        },
    ]


def available_ai_tools() -> list[dict[str, Any]]:
    return _tool_definitions()


def _execute_tool(db: Session, *, tenant_id: int, name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name == "get_available_slots":
        return _get_available_slots(db, tenant_id=tenant_id, date_str=str(args.get("date")))
    if name == "cancel_appointment":
        return _cancel_appointment(db, tenant_id=tenant_id, appointment_id=int(args.get("appointment_id")))
    if name == "generate_payment_link":
        return _generate_payment_link(
            amount=float(args.get("amount") or 0),
            description=str(args.get("description") or "Pagamento"),
        )
    if name == "finalize_service":
        return _finalize_service(
            db,
            tenant_id=tenant_id,
            appointment_id=(int(args["appointment_id"]) if args.get("appointment_id") is not None else None),
            amount=float(args.get("amount") or 0),
            description=str(args.get("description") or "Fechamento de serviço"),
        )
    return {"ok": False, "message": f"Tool não implementada: {name}"}


def execute_ai_tool_sandbox(
    db: Session,
    *,
    tenant_id: int,
    tool_name: str,
    arguments: dict[str, Any] | None = None,
) -> dict[str, Any]:
    name = (tool_name or "").strip()
    args = arguments or {}
    allowed = {item["name"] for item in _tool_definitions()}
    if name not in allowed:
        return {
            "ok": False,
            "message": f"Tool inválida para sandbox: {name}.",
            "allowed_tools": sorted(allowed),
        }
    try:
        return _execute_tool(db, tenant_id=tenant_id, name=name, args=args)
    except Exception as exc:
        return {"ok": False, "message": f"Falha na execução da tool: {type(exc).__name__}: {exc}"}


def _anthropic_request(body: dict[str, Any]) -> tuple[dict[str, Any] | None, bool]:
    payload = {
        "model": body["model"],
        "max_tokens": body.get("max_tokens", 700),
        "temperature": body.get("temperature", 0),
        "system": body["system"],
        "messages": body["messages"],
        "tools": body.get("tools", []),
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": CLAUDE_API_KEY,
            "anthropic-version": "2023-06-01",
        },
    )
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
        data = json.loads(raw) if raw.strip() else {}
        if isinstance(data, dict):
            return data, False
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            return None, True
    except Exception:
        return None, False
    return None, False


def _call_claude_with_tools(
    db: Session,
    *,
    tenant_id: int,
    model: str,
    system_prompt: str,
    user_message: str,
) -> tuple[str, list[dict[str, Any]], bool, tuple[str, dict[str, Any]] | None]:
    """Retorna (texto, tools_usadas, chave_inválida, pendência_tool_sensível)."""
    tools_used: list[dict[str, Any]] = []
    messages: list[dict[str, Any]] = [{"role": "user", "content": user_message}]
    tools = _tool_definitions()
    for _ in range(3):
        data, key_invalid = _anthropic_request(
            {
                "model": model,
                "system": system_prompt,
                "messages": messages,
                "tools": tools,
                "temperature": 0,
                "max_tokens": 700,
            }
        )
        if key_invalid:
            return "", [], True, None
        if not data:
            return "", tools_used, False, None
        content = data.get("content")
        if not isinstance(content, list):
            return "", tools_used, False, None
        text_parts: list[str] = []
        tool_results: list[dict[str, Any]] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "tool_use":
                tool_name = str(block.get("name") or "").strip()
                if tool_name in SENSITIVE_TOOLS:
                    tool_input = block.get("input") if isinstance(block.get("input"), dict) else {}
                    return "", tools_used, False, (tool_name, tool_input)
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text":
                text = str(block.get("text") or "").strip()
                if text:
                    text_parts.append(text)
            if block.get("type") == "tool_use":
                tool_name = str(block.get("name") or "").strip()
                tool_input = block.get("input") if isinstance(block.get("input"), dict) else {}
                tool_id = str(block.get("id") or "").strip()
                result = _execute_tool(db, tenant_id=tenant_id, name=tool_name, args=tool_input)
                tools_used.append({"name": tool_name, "input": tool_input, "output": result})
                if tool_id:
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": json.dumps(result, ensure_ascii=False),
                        }
                    )
        if tool_results:
            messages.append({"role": "assistant", "content": content})
            messages.append({"role": "user", "content": tool_results})
            continue
        if text_parts:
            return "\n".join(text_parts).strip(), tools_used, False, None
    return "", tools_used, False, None


def generate_ai_response(
    db: Session,
    *,
    message_text: str,
    tenant_id: int,
    client_name: str | None = None,
    client_whatsapp: str | None = None,
) -> dict[str, str]:
    if not (message_text or "").strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Mensagem vazia.")
    if not _is_ai_enabled(db, tenant_id):
        return {"intent": "ai_disabled", "reply_text": "Atendimento automático desativado. Um atendente humano vai seguir com você."}
    context = CompanyContext.from_db(db, tenant_id)
    system_prompt = _build_system_prompt(context)
    logger.info("AI system prompt tenant_id=%s\n%s", tenant_id, system_prompt)
    model = context.model_slug or CLAUDE_MODEL
    wa_key = _normalize_client_whatsapp_key(client_whatsapp)

    if wa_key:
        pending = _get_pending_confirmation(db, tenant_id=tenant_id, client_whatsapp=wa_key)
        if pending is not None and pending.expires_at < datetime.now(timezone.utc):
            _clear_pending_confirmation(db, tenant_id=tenant_id, client_whatsapp=wa_key)
            pending = None
        if pending is not None:
            if _user_message_denies(message_text):
                _clear_pending_confirmation(db, tenant_id=tenant_id, client_whatsapp=wa_key)
                reply = "Tudo bem, não farei essa alteração. Se precisar de outra coisa, é só dizer."
                _save_chat_history(
                    db,
                    tenant_id=tenant_id,
                    client_whatsapp=client_whatsapp,
                    user_message=message_text,
                    assistant_response=reply,
                    used_model=model,
                    used_tools=[],
                    system_prompt_xml=system_prompt,
                    is_mock=False,
                )
                return {"intent": "sensitive_tool_declined", "reply_text": reply}
            if _user_message_confirms(message_text):
                try:
                    args = json.loads(pending.arguments_json)
                    if not isinstance(args, dict):
                        args = {}
                except json.JSONDecodeError:
                    args = {}
                tool_name = pending.tool_name
                result = _execute_tool(db, tenant_id=tenant_id, name=tool_name, args=args)
                _clear_pending_confirmation(db, tenant_id=tenant_id, client_whatsapp=wa_key)
                reply = _reply_after_confirmed_tool(tool_name, result)
                _save_chat_history(
                    db,
                    tenant_id=tenant_id,
                    client_whatsapp=client_whatsapp,
                    user_message=message_text,
                    assistant_response=reply,
                    used_model=model,
                    used_tools=[{"name": tool_name, "input": args, "output": result, "after_user_confirm": True}],
                    system_prompt_xml=system_prompt,
                    is_mock=False,
                )
                return {"intent": "sensitive_tool_executed", "reply_text": reply}
            reminder = (
                f"{pending.confirmation_prompt}\n\n"
                "(Ainda aguardando: responda *SIM* para confirmar ou *NÃO* para cancelar.)"
            )
            _save_chat_history(
                db,
                tenant_id=tenant_id,
                client_whatsapp=client_whatsapp,
                user_message=message_text,
                assistant_response=reminder,
                used_model=model,
                used_tools=[],
                system_prompt_xml=system_prompt,
                is_mock=False,
            )
            return {"intent": "awaiting_sensitive_confirmation", "reply_text": reminder}

    if not CLAUDE_API_KEY:
        mocked = _fallback_local_reply(
            db,
            tenant_id=tenant_id,
            message_text=message_text,
            client_name=client_name,
            context=context,
        )
        _save_chat_history(
            db,
            tenant_id=tenant_id,
            client_whatsapp=client_whatsapp,
            user_message=message_text,
            assistant_response=mocked["reply_text"],
            used_model=context.model_slug,
            used_tools=[],
            system_prompt_xml=system_prompt,
            is_mock=True,
        )
        return mocked

    answer, tools_used, invalid_key, sensitive = _call_claude_with_tools(
        db,
        tenant_id=tenant_id,
        model=model,
        system_prompt=system_prompt,
        user_message=message_text,
    )
    if sensitive is not None:
        sens_name, sens_args = sensitive
        if not wa_key:
            reply = (
                "Para sua segurança, preciso confirmar essa ação em um canal identificado (WhatsApp). "
                "Abra o atendimento pelo número cadastrado ou peça ao painel para informar o telefone da conversa."
            )
            _save_chat_history(
                db,
                tenant_id=tenant_id,
                client_whatsapp=client_whatsapp,
                user_message=message_text,
                assistant_response=reply,
                used_model=model,
                used_tools=[{"name": sens_name, "input": sens_args, "deferred": True, "reason": "missing_client_whatsapp"}],
                system_prompt_xml=system_prompt,
                is_mock=False,
            )
            return {"intent": "sensitive_tool_needs_channel", "reply_text": reply}
        confirmation = _build_sensitive_confirmation_prompt(db, tenant_id=tenant_id, tool_name=sens_name, arguments=sens_args)
        _store_pending_confirmation(
            db,
            tenant_id=tenant_id,
            client_whatsapp=wa_key,
            tool_name=sens_name,
            arguments=sens_args,
            confirmation_prompt=confirmation,
        )
        _save_chat_history(
            db,
            tenant_id=tenant_id,
            client_whatsapp=client_whatsapp,
            user_message=message_text,
            assistant_response=confirmation,
            used_model=model,
            used_tools=[{"name": sens_name, "input": sens_args, "deferred": True, "awaiting_confirm": True}],
            system_prompt_xml=system_prompt,
            is_mock=False,
        )
        return {"intent": "awaiting_sensitive_confirmation", "reply_text": confirmation}

    if invalid_key:
        mocked = _fallback_local_reply(
            db,
            tenant_id=tenant_id,
            message_text=message_text,
            client_name=client_name,
            context=context,
        )
        _save_chat_history(
            db,
            tenant_id=tenant_id,
            client_whatsapp=client_whatsapp,
            user_message=message_text,
            assistant_response=mocked["reply_text"],
            used_model=model,
            used_tools=[],
            system_prompt_xml=system_prompt,
            is_mock=True,
        )
        return mocked
    if answer:
        _save_chat_history(
            db,
            tenant_id=tenant_id,
            client_whatsapp=client_whatsapp,
            user_message=message_text,
            assistant_response=answer,
            used_model=model,
            used_tools=tools_used,
            system_prompt_xml=system_prompt,
            is_mock=False,
        )
        return {"intent": "ai_response", "reply_text": answer}
    mocked = _fallback_local_reply(
        db,
        tenant_id=tenant_id,
        message_text=message_text,
        client_name=client_name,
        context=context,
    )
    _save_chat_history(
        db,
        tenant_id=tenant_id,
        client_whatsapp=client_whatsapp,
        user_message=message_text,
        assistant_response=mocked["reply_text"],
        used_model=model,
        used_tools=tools_used,
        system_prompt_xml=system_prompt,
        is_mock=True,
    )
    return mocked
