from __future__ import annotations

import json
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from string import Formatter
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from models import (
    Client,
    FinanceEntry,
    FinanceEntryStatus,
    FinanceEntryType,
    ServiceOrder,
    Tenant,
    WhatsappBotFlow,
    WhatsappBotSession,
    WhatsappBotSettings,
    WhatsappBotStep,
    WhatsappMessageStatus,
)

DEFAULT_WELCOME_MESSAGE = (
    "Olá! Sou o atendimento automático da {empresa}.\n\n"
    "Digite uma das opções do menu ou descreva rapidamente o que você precisa."
)
DEFAULT_FALLBACK_MESSAGE = (
    "Não consegui identificar essa opção. Digite *menu* para ver as opções ou *atendente* para falar com nossa equipe."
)
DEFAULT_HANDOFF_MESSAGE = "Certo! Vou encaminhar seu atendimento para uma pessoa da equipe."
DEFAULT_HANDOFF_KEYWORDS = ["atendente", "humano", "pessoa", "suporte", "financeiro"]
MENU_KEYWORDS = {"menu", "inicio", "início", "oi", "ola", "olá", "bom dia", "boa tarde", "boa noite"}

DEFAULT_FLOW_TEMPLATES: list[dict[str, Any]] = [
    {
        "slug": "orcamento-valores",
        "name": "Orçamento e valores",
        "description": "Coleta dados básicos para orçamento, limpeza, instalação ou manutenção.",
        "enabled": True,
        "trigger_type": "menu_option",
        "trigger_keywords": ["1", "orçamento", "orcamento", "valor", "preço", "preco", "limpeza"],
        "priority": 10,
        "steps": [
            {
                "step_key": "inicio",
                "kind": "question",
                "message_template": (
                    "Claro! Para preparar seu orçamento, me envie em uma mensagem:\n"
                    "- serviço desejado\n- cidade/bairro\n- quantidade de equipamentos\n- uma breve descrição do problema"
                ),
                "actions": {"save_as": "dados_orcamento"},
                "next_step_key": "final",
                "sort_order": 100,
            },
            {
                "step_key": "final",
                "kind": "end",
                "message_template": (
                    "Recebido, {nome_cliente}! Nossa equipe vai analisar e retornar com o orçamento. "
                    "Se preferir atendimento imediato, digite *atendente*."
                ),
                "sort_order": 200,
            },
        ],
    },
    {
        "slug": "agendamento-visita",
        "name": "Agendar visita",
        "description": "Coleta melhor dia/horário para visita técnica.",
        "enabled": True,
        "trigger_type": "menu_option",
        "trigger_keywords": ["2", "agendar", "agenda", "visita", "horário", "horario"],
        "priority": 20,
        "steps": [
            {
                "step_key": "inicio",
                "kind": "question",
                "message_template": "Perfeito. Informe o melhor dia/horário, endereço e uma referência do local.",
                "actions": {"save_as": "preferencia_agendamento"},
                "next_step_key": "final",
                "sort_order": 100,
            },
            {
                "step_key": "final",
                "kind": "end",
                "message_template": (
                    "Obrigado! Vamos conferir a agenda e confirmar a visita. "
                    "Caso seja urgente, digite *atendente*."
                ),
                "sort_order": 200,
            },
        ],
    },
    {
        "slug": "financeiro-pagamentos",
        "name": "Financeiro e pagamentos",
        "description": "Direciona dúvidas de pagamento, segunda via e financeiro.",
        "enabled": True,
        "trigger_type": "menu_option",
        "trigger_keywords": ["3", "financeiro", "pagamento", "boleto", "pix", "segunda via"],
        "priority": 30,
        "steps": [
            {
                "step_key": "inicio",
                "kind": "menu",
                "message_template": "Como podemos ajudar no financeiro?",
                "options": [
                    {
                        "key": "1",
                        "label": "Segunda via / link de pagamento",
                        "next_step_key": "consultar-pendencias",
                    },
                    {
                        "key": "2",
                        "label": "Confirmar pagamento",
                        "message": "Envie o comprovante por aqui. Nossa equipe vai validar e retornar.",
                    },
                    {"key": "3", "label": "Falar com financeiro", "handoff": True},
                ],
                "sort_order": 100,
            },
            {
                "step_key": "consultar-pendencias",
                "kind": "action",
                "message_template": "Vou consultar suas pendências financeiras.",
                "actions": {"builtin": "finance_open_entries"},
                "sort_order": 200,
            }
        ],
    },
    {
        "slug": "fechamento-os",
        "name": "Fechamento de OS",
        "description": "Mensagem automática quando uma ordem de serviço é concluída.",
        "enabled": True,
        "trigger_type": "system_event",
        "trigger_keywords": [],
        "system_event": "service_order_done",
        "priority": 5,
        "steps": [
            {
                "step_key": "inicio",
                "kind": "menu",
                "message_template": (
                    "Olá {nome_cliente}! Sua OS #{numero_os} foi finalizada.\n"
                    "Serviço: {titulo_os}\nValor: R$ {valor_total}\n\nEscolha uma opção:"
                ),
                "options": [
                    {
                        "key": "1",
                        "label": "Formas de pagamento",
                        "message": "Nossa equipe vai enviar as formas de pagamento disponíveis para esta OS.",
                    },
                    {
                        "key": "2",
                        "label": "Solicitar nota fiscal",
                        "message": "Certo. Envie CPF/CNPJ, razão social/nome completo e e-mail para emissão da nota.",
                    },
                    {"key": "3", "label": "Falar com atendente", "handoff": True},
                ],
                "sort_order": 100,
            }
        ],
    },
    {
        "slug": "nota-fiscal",
        "name": "Nota fiscal",
        "description": "Coleta dados para solicitação de nota fiscal.",
        "enabled": True,
        "trigger_type": "keyword",
        "trigger_keywords": ["nota", "nf", "nfs", "nfse", "nota fiscal"],
        "priority": 40,
        "steps": [
            {
                "step_key": "inicio",
                "kind": "question",
                "message_template": "Para solicitar nota fiscal, envie CPF/CNPJ, razão social/nome completo e e-mail.",
                "actions": {"save_as": "dados_nf"},
                "next_step_key": "final",
                "sort_order": 100,
            },
            {
                "step_key": "final",
                "kind": "end",
                "message_template": "Dados recebidos. Vamos encaminhar para o financeiro/fiscal e retornar por aqui.",
                "sort_order": 200,
            },
        ],
    },
    {
        "slug": "falar-atendente",
        "name": "Falar com atendente",
        "description": "Pausa o bot e transfere para atendimento humano.",
        "enabled": True,
        "trigger_type": "menu_option",
        "trigger_keywords": ["4", "atendente", "humano", "pessoa"],
        "priority": 50,
        "steps": [
            {
                "step_key": "inicio",
                "kind": "menu",
                "message_template": "Vou chamar um atendente para continuar seu atendimento.",
                "options": [{"key": "1", "label": "Continuar com atendente", "handoff": True}],
                "sort_order": 100,
            }
        ],
    },
]


class SafeFormatDict(dict):
    def __missing__(self, key: str) -> str:
        return ""


def _json_loads(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _strip_accents_lower(value: str | None) -> str:
    raw = (value or "").strip().lower()
    normalized = unicodedata.normalize("NFD", raw)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _digits(value: str | None) -> str:
    return "".join(ch for ch in (value or "") if ch.isdigit())


def _normalize_client_whatsapp(value: str | None) -> str:
    raw = _digits(value)
    if not raw:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="WhatsApp do cliente inválido.")
    if raw.startswith("55") and len(raw) in (12, 13):
        return raw
    if len(raw) in (10, 11):
        return f"55{raw}"
    if len(raw) > 13:
        return raw[-13:]
    return raw


def _slugify(value: str) -> str:
    cleaned = _strip_accents_lower(value).replace(" ", "-")
    cleaned = re.sub(r"[^a-z0-9_-]+", "", cleaned)
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Slug inválido.")
    return cleaned[:80]


def _find_client_context(db: Session, *, tenant_id: int, whatsapp: str) -> dict[str, Any]:
    digits = _digits(whatsapp)
    variants = {digits}
    if digits.startswith("55"):
        variants.add(digits[2:])
    if len(digits) > 11:
        variants.add(digits[-11:])
        variants.add(digits[-10:])
    variant_list = [v for v in variants if v]
    client = db.execute(
        select(Client)
        .where(
            Client.tenant_id == tenant_id,
            or_(Client.whatsapp.in_(variant_list), Client.phone.in_(variant_list)),
        )
        .limit(1)
    ).scalar_one_or_none()
    if client is None:
        return {"telefone_cliente": digits, "nome_cliente": "cliente"}
    return {
        "cliente_id": client.id,
        "nome_cliente": client.name,
        "telefone_cliente": client.whatsapp or client.phone or digits,
        "email_cliente": client.email or "",
        "documento_cliente": client.document or "",
        "cidade_cliente": client.address_city or "",
        "uf_cliente": client.address_state or "",
    }


def _base_context(db: Session, *, tenant_id: int, client_whatsapp: str | None = None, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    tenant = db.get(Tenant, tenant_id)
    context: dict[str, Any] = {
        "empresa": tenant.name if tenant else "",
        "nome_cliente": "cliente",
        "telefone_cliente": client_whatsapp or "",
    }
    if client_whatsapp:
        context.update(_find_client_context(db, tenant_id=tenant_id, whatsapp=client_whatsapp))
    if extra:
        context.update({k: "" if v is None else v for k, v in extra.items()})
    return context


def _render_template(template: str, context: dict[str, Any]) -> str:
    values = SafeFormatDict({k: "" if v is None else str(v) for k, v in context.items()})
    try:
        return Formatter().vformat(template or "", (), values).strip()
    except (KeyError, ValueError):
        return (template or "").strip()


def _setting_to_out(row: WhatsappBotSettings) -> dict[str, Any]:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "enabled": bool(row.enabled),
        "welcome_message": row.welcome_message,
        "fallback_message": row.fallback_message,
        "handoff_message": row.handoff_message,
        "handoff_keywords": _json_loads(row.handoff_keywords_json, DEFAULT_HANDOFF_KEYWORDS),
        "handoff_pause_minutes": int(row.handoff_pause_minutes or 240),
        "business_hours": _json_loads(row.business_hours_json, {}),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _step_to_out(row: WhatsappBotStep) -> dict[str, Any]:
    return {
        "id": row.id,
        "flow_id": row.flow_id,
        "step_key": row.step_key,
        "kind": row.kind,
        "message_template": row.message_template,
        "options": _json_loads(row.options_json, []),
        "validation": _json_loads(row.validation_json, {}),
        "actions": _json_loads(row.actions_json, {}),
        "next_step_key": row.next_step_key,
        "sort_order": int(row.sort_order or 100),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def flow_to_out(row: WhatsappBotFlow) -> dict[str, Any]:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "slug": row.slug,
        "name": row.name,
        "description": row.description,
        "enabled": bool(row.enabled),
        "trigger_type": row.trigger_type,
        "trigger_keywords": _json_loads(row.trigger_keywords_json, []),
        "system_event": row.system_event,
        "priority": int(row.priority or 100),
        "steps": [_step_to_out(step) for step in sorted(row.steps, key=lambda s: (s.sort_order, s.id))],
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def get_or_create_settings(db: Session, *, tenant_id: int) -> WhatsappBotSettings:
    row = db.execute(select(WhatsappBotSettings).where(WhatsappBotSettings.tenant_id == tenant_id)).scalar_one_or_none()
    if row is not None:
        return row
    row = WhatsappBotSettings(
        tenant_id=tenant_id,
        enabled=False,
        welcome_message=DEFAULT_WELCOME_MESSAGE,
        fallback_message=DEFAULT_FALLBACK_MESSAGE,
        handoff_message=DEFAULT_HANDOFF_MESSAGE,
        handoff_keywords_json=_json_dumps(DEFAULT_HANDOFF_KEYWORDS),
        handoff_pause_minutes=240,
        business_hours_json=_json_dumps({}),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_settings(db: Session, *, tenant_id: int, patch: dict[str, Any]) -> dict[str, Any]:
    row = get_or_create_settings(db, tenant_id=tenant_id)
    if "enabled" in patch:
        row.enabled = bool(patch["enabled"])
    for field in ("welcome_message", "fallback_message", "handoff_message"):
        if field in patch and patch[field] is not None:
            setattr(row, field, str(patch[field]).strip())
    if "handoff_keywords" in patch and patch["handoff_keywords"] is not None:
        row.handoff_keywords_json = _json_dumps(patch["handoff_keywords"])
    if "handoff_pause_minutes" in patch and patch["handoff_pause_minutes"] is not None:
        row.handoff_pause_minutes = int(patch["handoff_pause_minutes"])
    if "business_hours" in patch and patch["business_hours"] is not None:
        row.business_hours_json = _json_dumps(patch["business_hours"])
    db.add(row)
    db.commit()
    db.refresh(row)
    return _setting_to_out(row)


def list_flows(db: Session, *, tenant_id: int) -> list[dict[str, Any]]:
    rows = db.execute(
        select(WhatsappBotFlow)
        .where(WhatsappBotFlow.tenant_id == tenant_id)
        .options(selectinload(WhatsappBotFlow.steps))
        .order_by(WhatsappBotFlow.priority.asc(), WhatsappBotFlow.id.asc())
    ).scalars().all()
    return [flow_to_out(row) for row in rows]


def get_flow(db: Session, *, tenant_id: int, flow_id: int) -> WhatsappBotFlow:
    row = db.execute(
        select(WhatsappBotFlow)
        .where(WhatsappBotFlow.id == flow_id, WhatsappBotFlow.tenant_id == tenant_id)
        .options(selectinload(WhatsappBotFlow.steps))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fluxo do bot não encontrado.")
    return row


def create_flow(db: Session, *, tenant_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    steps = payload.pop("steps", [])
    row = WhatsappBotFlow(
        tenant_id=tenant_id,
        slug=_slugify(payload["slug"]),
        name=payload["name"].strip(),
        description=payload.get("description"),
        enabled=bool(payload.get("enabled", True)),
        trigger_type=payload.get("trigger_type") or "keyword",
        trigger_keywords_json=_json_dumps(payload.get("trigger_keywords") or []),
        system_event=payload.get("system_event"),
        priority=int(payload.get("priority") or 100),
    )
    db.add(row)
    db.flush()
    for step_payload in steps:
        db.add(_build_step(row.id, step_payload))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe fluxo com este slug.") from exc
    return flow_to_out(get_flow(db, tenant_id=tenant_id, flow_id=row.id))


def update_flow(db: Session, *, tenant_id: int, flow_id: int, patch: dict[str, Any]) -> dict[str, Any]:
    row = get_flow(db, tenant_id=tenant_id, flow_id=flow_id)
    if "slug" in patch and patch["slug"] is not None:
        row.slug = _slugify(patch["slug"])
    if "name" in patch and patch["name"] is not None:
        row.name = patch["name"].strip()
    if "description" in patch:
        row.description = patch["description"]
    if "enabled" in patch and patch["enabled"] is not None:
        row.enabled = bool(patch["enabled"])
    if "trigger_type" in patch and patch["trigger_type"] is not None:
        row.trigger_type = patch["trigger_type"]
    if "trigger_keywords" in patch and patch["trigger_keywords"] is not None:
        row.trigger_keywords_json = _json_dumps(patch["trigger_keywords"])
    if "system_event" in patch:
        row.system_event = patch["system_event"]
    if "priority" in patch and patch["priority"] is not None:
        row.priority = int(patch["priority"])
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe fluxo com este slug.") from exc
    return flow_to_out(get_flow(db, tenant_id=tenant_id, flow_id=flow_id))


def delete_flow(db: Session, *, tenant_id: int, flow_id: int) -> None:
    row = get_flow(db, tenant_id=tenant_id, flow_id=flow_id)
    db.delete(row)
    db.commit()


def _build_step(flow_id: int, payload: dict[str, Any]) -> WhatsappBotStep:
    return WhatsappBotStep(
        flow_id=flow_id,
        step_key=payload["step_key"].strip().lower().replace(" ", "-"),
        kind=payload.get("kind") or "message",
        message_template=payload["message_template"].strip(),
        options_json=_json_dumps(payload.get("options") or []),
        validation_json=_json_dumps(payload.get("validation") or {}),
        actions_json=_json_dumps(payload.get("actions") or {}),
        next_step_key=payload.get("next_step_key"),
        sort_order=int(payload.get("sort_order") or 100),
    )


def create_step(db: Session, *, tenant_id: int, flow_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    get_flow(db, tenant_id=tenant_id, flow_id=flow_id)
    row = _build_step(flow_id, payload)
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe passo com esta chave no fluxo.") from exc
    db.refresh(row)
    return _step_to_out(row)


def get_step(db: Session, *, tenant_id: int, flow_id: int, step_id: int) -> WhatsappBotStep:
    get_flow(db, tenant_id=tenant_id, flow_id=flow_id)
    row = db.execute(
        select(WhatsappBotStep).where(WhatsappBotStep.id == step_id, WhatsappBotStep.flow_id == flow_id)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Passo do bot não encontrado.")
    return row


def update_step(db: Session, *, tenant_id: int, flow_id: int, step_id: int, patch: dict[str, Any]) -> dict[str, Any]:
    row = get_step(db, tenant_id=tenant_id, flow_id=flow_id, step_id=step_id)
    if "step_key" in patch and patch["step_key"] is not None:
        row.step_key = patch["step_key"].strip().lower().replace(" ", "-")
    if "kind" in patch and patch["kind"] is not None:
        row.kind = patch["kind"]
    if "message_template" in patch and patch["message_template"] is not None:
        row.message_template = patch["message_template"].strip()
    if "options" in patch and patch["options"] is not None:
        row.options_json = _json_dumps(patch["options"])
    if "validation" in patch and patch["validation"] is not None:
        row.validation_json = _json_dumps(patch["validation"])
    if "actions" in patch and patch["actions"] is not None:
        row.actions_json = _json_dumps(patch["actions"])
    if "next_step_key" in patch:
        row.next_step_key = patch["next_step_key"]
    if "sort_order" in patch and patch["sort_order"] is not None:
        row.sort_order = int(patch["sort_order"])
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe passo com esta chave no fluxo.") from exc
    db.refresh(row)
    return _step_to_out(row)


def delete_step(db: Session, *, tenant_id: int, flow_id: int, step_id: int) -> None:
    row = get_step(db, tenant_id=tenant_id, flow_id=flow_id, step_id=step_id)
    db.delete(row)
    db.commit()


def seed_default_flows(db: Session, *, tenant_id: int) -> dict[str, Any]:
    get_or_create_settings(db, tenant_id=tenant_id)
    existing_flows = {
        row.slug: row
        for row in db.execute(
            select(WhatsappBotFlow)
            .where(WhatsappBotFlow.tenant_id == tenant_id)
            .options(selectinload(WhatsappBotFlow.steps))
        ).scalars().all()
    }
    created = 0
    skipped = 0
    for template in DEFAULT_FLOW_TEMPLATES:
        existing = existing_flows.get(template["slug"])
        if existing is not None:
            _patch_existing_default_flow(db, existing, template)
            skipped += 1
            continue
        payload = dict(template)
        steps = payload.pop("steps", [])
        flow = WhatsappBotFlow(
            tenant_id=tenant_id,
            slug=payload["slug"],
            name=payload["name"],
            description=payload.get("description"),
            enabled=bool(payload.get("enabled", True)),
            trigger_type=payload.get("trigger_type") or "keyword",
            trigger_keywords_json=_json_dumps(payload.get("trigger_keywords") or []),
            system_event=payload.get("system_event"),
            priority=int(payload.get("priority") or 100),
        )
        db.add(flow)
        db.flush()
        for step_payload in steps:
            db.add(_build_step(flow.id, step_payload))
        existing_flows[flow.slug] = flow
        created += 1
    db.commit()
    return {
        "created_flows": created,
        "skipped_existing": skipped,
        "flows": list_flows(db, tenant_id=tenant_id),
    }


def _patch_existing_default_flow(db: Session, flow: WhatsappBotFlow, template: dict[str, Any]) -> None:
    existing_step_keys = {step.step_key for step in flow.steps}
    for step_payload in template.get("steps") or []:
        if step_payload.get("step_key") not in existing_step_keys:
            db.add(_build_step(flow.id, step_payload))

    if template.get("slug") != "financeiro-pagamentos":
        return
    first = next((step for step in flow.steps if step.step_key == "inicio"), None)
    if first is None:
        return
    options = _json_loads(first.options_json, [])
    changed = False
    for option in options:
        if str(option.get("key") or "").strip() != "1":
            continue
        old_message = str(option.get("message") or "").strip()
        if old_message == "Informe CPF/CNPJ ou número da OS para localizarmos seu pagamento.":
            option.pop("message", None)
            option["next_step_key"] = "consultar-pendencias"
            changed = True
    if changed:
        first.options_json = _json_dumps(options)
        db.add(first)


def _get_session(db: Session, *, tenant_id: int, client_whatsapp: str) -> WhatsappBotSession | None:
    return db.execute(
        select(WhatsappBotSession).where(
            WhatsappBotSession.tenant_id == tenant_id,
            WhatsappBotSession.client_whatsapp == client_whatsapp,
        )
    ).scalar_one_or_none()


def _clear_session(db: Session, session: WhatsappBotSession | None) -> None:
    if session is not None:
        db.delete(session)


def _upsert_session(
    db: Session,
    *,
    tenant_id: int,
    client_whatsapp: str,
    flow_id: int | None,
    step_key: str | None,
    context: dict[str, Any],
    paused_until: datetime | None = None,
) -> WhatsappBotSession:
    now = datetime.now(timezone.utc)
    row = _get_session(db, tenant_id=tenant_id, client_whatsapp=client_whatsapp)
    if row is None:
        row = WhatsappBotSession(tenant_id=tenant_id, client_whatsapp=client_whatsapp)
    row.current_flow_id = flow_id
    row.current_step_key = step_key
    row.context_json = _json_dumps(context)
    row.paused_until = paused_until
    row.last_incoming_at = now
    row.last_outgoing_at = now
    db.add(row)
    return row


def _step_by_key(flow: WhatsappBotFlow, key: str | None) -> WhatsappBotStep | None:
    ordered = sorted(flow.steps, key=lambda s: (s.sort_order, s.id))
    if key:
        for step in ordered:
            if step.step_key == key:
                return step
    return ordered[0] if ordered else None


def _step_expects_reply(step: WhatsappBotStep) -> bool:
    options = _json_loads(step.options_json, [])
    return step.kind in ("question", "menu") or bool(options)


def _format_options(options: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for option in options:
        key = str(option.get("key") or option.get("value") or "").strip()
        label = str(option.get("label") or option.get("text") or "").strip()
        if key and label:
            lines.append(f"{key} - {label}")
        elif label:
            lines.append(label)
    return "\n".join(lines)


def _money_brl(value: Any) -> str:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0.0
    return f"R$ {amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _date_br(value: date | datetime | None) -> str:
    if value is None:
        return "sem vencimento"
    return value.strftime("%d/%m/%Y")


def _status_finance_pt(value: Any) -> str:
    raw = value.value if hasattr(value, "value") else str(value or "")
    return {
        "pending": "pendente",
        "overdue": "vencido",
        "paid": "pago",
        "cancelled": "cancelado",
    }.get(raw, raw)


def _finance_entry_matches(db: Session, *, tenant_id: int, client_whatsapp: str, context: dict[str, Any]) -> list[FinanceEntry]:
    digits = _digits(client_whatsapp)
    variants = {digits}
    if digits.startswith("55"):
        variants.add(digits[2:])
    if len(digits) > 11:
        variants.add(digits[-11:])
        variants.add(digits[-10:])
    variant_list = [v for v in variants if v]

    service_order_id: int | None = None
    for key in ("service_order_id", "numero_os"):
        raw = context.get(key)
        try:
            if raw not in (None, ""):
                service_order_id = int(str(raw))
                break
        except (TypeError, ValueError):
            continue

    conditions = []
    if variant_list:
        conditions.append(FinanceEntry.recipient_whatsapp.in_(variant_list))
    if service_order_id is not None:
        conditions.append(FinanceEntry.service_order_id == service_order_id)

    client_id = context.get("cliente_id")
    try:
        client_id_int = int(str(client_id)) if client_id not in (None, "") else None
    except (TypeError, ValueError):
        client_id_int = None
    if client_id_int is not None:
        conditions.append(FinanceEntry.service_order.has(ServiceOrder.client_id == client_id_int))

    if not conditions:
        return []

    return db.execute(
        select(FinanceEntry)
        .where(
            FinanceEntry.tenant_id == tenant_id,
            FinanceEntry.entry_type == FinanceEntryType.INCOME,
            FinanceEntry.status.in_([FinanceEntryStatus.PENDING, FinanceEntryStatus.OVERDUE]),
            or_(*conditions),
        )
        .order_by(FinanceEntry.due_date.asc(), FinanceEntry.id.asc())
        .limit(5)
    ).scalars().all()


def _finance_open_entries_reply(
    db: Session,
    *,
    tenant_id: int,
    client_whatsapp: str,
    context: dict[str, Any],
) -> str:
    entries = _finance_entry_matches(db, tenant_id=tenant_id, client_whatsapp=client_whatsapp, context=context)
    if not entries:
        return (
            "Não encontrei cobranças em aberto vinculadas a este WhatsApp. "
            "Envie CPF/CNPJ ou número da OS para um atendente localizar, ou digite *atendente*."
        )

    lines = ["Encontrei estas cobranças em aberto:"]
    for entry in entries:
        provider = (entry.payment_provider or "").strip()
        gateway = (entry.gateway_payment_id or "").strip()
        gateway_hint = ""
        if provider or gateway:
            gateway_hint = f" | cobrança {provider or 'gateway'} {gateway}".strip()
        lines.append(
            f"- #{entry.id}: {entry.description} | {_money_brl(entry.amount)} | "
            f"venc. {_date_br(entry.due_date)} | {_status_finance_pt(entry.status)}{gateway_hint}"
        )
    lines.append(
        "Se precisar da segunda via/link atualizado, responda *atendente* que o financeiro continua por aqui."
    )
    return "\n".join(lines)


def _reply_for_action_step(
    db: Session,
    *,
    tenant_id: int,
    client_whatsapp: str,
    step: WhatsappBotStep,
    context: dict[str, Any],
) -> str:
    actions = _json_loads(step.actions_json, {})
    builtin = str(actions.get("builtin") or "").strip()
    if builtin == "finance_open_entries":
        return _finance_open_entries_reply(db, tenant_id=tenant_id, client_whatsapp=client_whatsapp, context=context)
    return _reply_for_step(step, context)


def _reply_for_step(step: WhatsappBotStep, context: dict[str, Any]) -> str:
    text = _render_template(step.message_template, context)
    options = _json_loads(step.options_json, [])
    option_text = _format_options(options)
    if option_text and option_text not in text:
        text = f"{text}\n\n{option_text}".strip()
    return text


def _match_option(step: WhatsappBotStep, message_text: str) -> dict[str, Any] | None:
    incoming = _strip_accents_lower(message_text)
    for option in _json_loads(step.options_json, []):
        keys = [
            option.get("key"),
            option.get("value"),
            option.get("label"),
            option.get("text"),
        ]
        aliases = option.get("aliases")
        if isinstance(aliases, list):
            keys.extend(aliases)
        for key in keys:
            if key is not None and incoming == _strip_accents_lower(str(key)):
                return option
    return None


def _active_flows(db: Session, *, tenant_id: int) -> list[WhatsappBotFlow]:
    return db.execute(
        select(WhatsappBotFlow)
        .where(WhatsappBotFlow.tenant_id == tenant_id, WhatsappBotFlow.enabled.is_(True))
        .options(selectinload(WhatsappBotFlow.steps))
        .order_by(WhatsappBotFlow.priority.asc(), WhatsappBotFlow.id.asc())
    ).scalars().all()


def _menu_text(settings: WhatsappBotSettings, flows: list[WhatsappBotFlow], context: dict[str, Any]) -> str:
    base = _render_template(settings.welcome_message, context)
    menu_flows = [f for f in flows if f.trigger_type == "menu_option"]
    lines: list[str] = []
    for flow in menu_flows:
        keywords = _json_loads(flow.trigger_keywords_json, [])
        key = str(keywords[0]).strip() if keywords else ""
        lines.append(f"{key} - {flow.name}" if key else flow.name)
    if lines:
        return f"{base}\n\n" + "\n".join(lines)
    return base


def _find_triggered_flow(flows: list[WhatsappBotFlow], message_text: str, *, system_event: str | None = None) -> WhatsappBotFlow | None:
    incoming = _strip_accents_lower(message_text)
    for flow in flows:
        if system_event:
            if flow.trigger_type == "system_event" and flow.system_event == system_event:
                return flow
            continue
        if flow.trigger_type not in ("keyword", "menu_option"):
            continue
        for keyword in _json_loads(flow.trigger_keywords_json, []):
            normalized = _strip_accents_lower(str(keyword))
            if not normalized:
                continue
            if incoming == normalized or (flow.trigger_type == "keyword" and normalized in incoming):
                return flow
    return None


def _start_flow(
    db: Session,
    *,
    tenant_id: int,
    client_whatsapp: str,
    flow: WhatsappBotFlow,
    context: dict[str, Any],
    persist_session: bool,
) -> dict[str, Any]:
    step = _step_by_key(flow, None)
    if step is None:
        reply = flow.description or f"Fluxo {flow.name} iniciado."
        if persist_session:
            _clear_session(db, _get_session(db, tenant_id=tenant_id, client_whatsapp=client_whatsapp))
        return {
            "matched": True,
            "reply_text": _render_template(reply, context),
            "flow_id": flow.id,
            "flow_name": flow.name,
            "step_key": None,
            "ended": True,
            "handoff": False,
            "paused_until": None,
            "context": context,
        }
    reply = (
        _reply_for_action_step(db, tenant_id=tenant_id, client_whatsapp=client_whatsapp, step=step, context=context)
        if step.kind == "action"
        else _reply_for_step(step, context)
    )
    ended = step.kind == "end" or not _step_expects_reply(step)
    if persist_session:
        if ended:
            _clear_session(db, _get_session(db, tenant_id=tenant_id, client_whatsapp=client_whatsapp))
        else:
            _upsert_session(
                db,
                tenant_id=tenant_id,
                client_whatsapp=client_whatsapp,
                flow_id=flow.id,
                step_key=step.step_key,
                context=context,
            )
    return {
        "matched": True,
        "reply_text": reply,
        "flow_id": flow.id,
        "flow_name": flow.name,
        "step_key": step.step_key,
        "ended": ended,
        "handoff": False,
        "paused_until": None,
        "context": context,
    }


def _pause_for_handoff(
    db: Session,
    *,
    settings: WhatsappBotSettings,
    tenant_id: int,
    client_whatsapp: str,
    context: dict[str, Any],
    persist_session: bool,
) -> dict[str, Any]:
    paused_until = datetime.now(timezone.utc) + timedelta(minutes=int(settings.handoff_pause_minutes or 240))
    if persist_session:
        _upsert_session(
            db,
            tenant_id=tenant_id,
            client_whatsapp=client_whatsapp,
            flow_id=None,
            step_key=None,
            context=context,
            paused_until=paused_until,
        )
    return {
        "matched": True,
        "reply_text": _render_template(settings.handoff_message, context),
        "flow_id": None,
        "flow_name": None,
        "step_key": None,
        "ended": True,
        "handoff": True,
        "paused_until": paused_until,
        "context": context,
    }


def route_message(
    db: Session,
    *,
    tenant_id: int,
    client_whatsapp: str,
    message_text: str,
    context_extra: dict[str, Any] | None = None,
    persist_session: bool = True,
    system_event: str | None = None,
    ignore_enabled: bool = False,
) -> dict[str, Any]:
    settings = get_or_create_settings(db, tenant_id=tenant_id)
    normalized_client = _normalize_client_whatsapp(client_whatsapp)
    context = _base_context(db, tenant_id=tenant_id, client_whatsapp=normalized_client, extra=context_extra)
    if not settings.enabled and not ignore_enabled:
        return {"matched": False, "reply_text": None, "context": context, "ended": True, "handoff": False}

    flows = _active_flows(db, tenant_id=tenant_id)
    session = _get_session(db, tenant_id=tenant_id, client_whatsapp=normalized_client)
    now = datetime.now(timezone.utc)
    if session and session.paused_until and session.paused_until > now and system_event is None:
        return {
            "matched": False,
            "reply_text": None,
            "context": _json_loads(session.context_json, context),
            "ended": True,
            "handoff": True,
            "paused_until": session.paused_until,
        }
    if session and session.context_json:
        context.update(_json_loads(session.context_json, {}))

    incoming_norm = _strip_accents_lower(message_text)
    handoff_keywords = [_strip_accents_lower(k) for k in _json_loads(settings.handoff_keywords_json, DEFAULT_HANDOFF_KEYWORDS)]
    if system_event is None and any(k and (incoming_norm == k or k in incoming_norm) for k in handoff_keywords):
        result = _pause_for_handoff(
            db,
            settings=settings,
            tenant_id=tenant_id,
            client_whatsapp=normalized_client,
            context=context,
            persist_session=persist_session,
        )
        if persist_session:
            db.commit()
        return result

    if system_event is None and session and session.current_flow_id and session.current_step_key:
        flow = next((f for f in flows if f.id == session.current_flow_id), None)
        step = _step_by_key(flow, session.current_step_key) if flow else None
        if flow and step:
            option = _match_option(step, message_text)
            actions = _json_loads(step.actions_json, {})
            if step.kind == "question" and option is None:
                save_as = str(actions.get("save_as") or step.step_key)
                context[save_as] = message_text.strip()
                next_key = step.next_step_key
            elif option:
                if option.get("handoff"):
                    result = _pause_for_handoff(
                        db,
                        settings=settings,
                        tenant_id=tenant_id,
                        client_whatsapp=normalized_client,
                        context=context,
                        persist_session=persist_session,
                    )
                    if persist_session:
                        db.commit()
                    return result
                if option.get("message"):
                    context["opcao_escolhida"] = option.get("label") or option.get("key") or ""
                next_key = option.get("next_step_key") or option.get("next") or step.next_step_key
                if option.get("message") and not next_key:
                    reply = _render_template(str(option["message"]), context)
                    if persist_session:
                        _clear_session(db, session)
                        db.commit()
                    return {
                        "matched": True,
                        "reply_text": reply,
                        "flow_id": flow.id,
                        "flow_name": flow.name,
                        "step_key": step.step_key,
                        "ended": True,
                        "handoff": False,
                        "paused_until": None,
                        "context": context,
                    }
            else:
                reply = f"{_render_template(settings.fallback_message, context)}\n\n{_reply_for_step(step, context)}"
                if persist_session:
                    session.last_incoming_at = now
                    db.add(session)
                    db.commit()
                return {
                    "matched": True,
                    "reply_text": reply,
                    "flow_id": flow.id,
                    "flow_name": flow.name,
                    "step_key": step.step_key,
                    "ended": False,
                    "handoff": False,
                    "paused_until": None,
                    "context": context,
                }

            next_step = _step_by_key(flow, str(next_key) if next_key else None) if next_key else None
            if next_step is None:
                if persist_session:
                    _clear_session(db, session)
                    db.commit()
                return {
                    "matched": True,
                    "reply_text": _render_template(step.message_template, context),
                    "flow_id": flow.id,
                    "flow_name": flow.name,
                    "step_key": step.step_key,
                    "ended": True,
                    "handoff": False,
                    "paused_until": None,
                    "context": context,
                }
            reply = (
                _reply_for_action_step(
                    db,
                    tenant_id=tenant_id,
                    client_whatsapp=normalized_client,
                    step=next_step,
                    context=context,
                )
                if next_step.kind == "action"
                else _reply_for_step(next_step, context)
            )
            ended = next_step.kind == "end" or not _step_expects_reply(next_step)
            if persist_session:
                if ended:
                    _clear_session(db, session)
                else:
                    _upsert_session(
                        db,
                        tenant_id=tenant_id,
                        client_whatsapp=normalized_client,
                        flow_id=flow.id,
                        step_key=next_step.step_key,
                        context=context,
                    )
                db.commit()
            return {
                "matched": True,
                "reply_text": reply,
                "flow_id": flow.id,
                "flow_name": flow.name,
                "step_key": next_step.step_key,
                "ended": ended,
                "handoff": False,
                "paused_until": None,
                "context": context,
            }

    flow = _find_triggered_flow(flows, message_text, system_event=system_event)
    if flow is not None:
        result = _start_flow(
            db,
            tenant_id=tenant_id,
            client_whatsapp=normalized_client,
            flow=flow,
            context=context,
            persist_session=persist_session,
        )
        if persist_session:
            db.commit()
        return result

    if system_event is None and incoming_norm in {_strip_accents_lower(k) for k in MENU_KEYWORDS}:
        reply = _menu_text(settings, flows, context)
    else:
        menu = _menu_text(settings, flows, context)
        fallback = _render_template(settings.fallback_message, context)
        reply = f"{fallback}\n\n{menu}" if menu else fallback
    if persist_session:
        if session and session.paused_until and session.paused_until <= now:
            _clear_session(db, session)
        db.commit()
    return {
        "matched": False,
        "reply_text": reply,
        "flow_id": None,
        "flow_name": None,
        "step_key": None,
        "ended": True,
        "handoff": False,
        "paused_until": None,
        "context": context,
    }


def test_message(
    db: Session,
    *,
    tenant_id: int,
    message_text: str,
    client_whatsapp: str | None,
    context: dict[str, Any],
    reset_session: bool,
) -> dict[str, Any]:
    phone = _normalize_client_whatsapp(client_whatsapp or "5500000000000")
    if reset_session:
        _clear_session(db, _get_session(db, tenant_id=tenant_id, client_whatsapp=phone))
        db.commit()
    result = route_message(
        db,
        tenant_id=tenant_id,
        client_whatsapp=phone,
        message_text=message_text,
        context_extra=context,
        persist_session=True,
        ignore_enabled=True,
    )
    if reset_session:
        _clear_session(db, _get_session(db, tenant_id=tenant_id, client_whatsapp=phone))
        db.commit()
    return result


def send_bot_reply(
    db: Session,
    *,
    tenant_id: int,
    recipient_whatsapp: str,
    message: str,
    reference_type: str | None = None,
    reference_id: int | None = None,
) -> None:
    from app.whatsapp import _evolution_send_text, _resolve_tenant_instance, append_event, create_message_job, normalize_whatsapp_number

    instance_name = _resolve_tenant_instance(db, tenant_id)
    recipient = normalize_whatsapp_number(recipient_whatsapp)
    job = create_message_job(
        db,
        tenant_id=tenant_id,
        created_by_user=None,
        template_key="bot_flow",
        recipient_whatsapp=recipient,
        rendered_message=message,
        reference_type=reference_type,
        reference_id=reference_id,
        scheduled_for=None,
    )
    try:
        result = _evolution_send_text(instance_name, recipient, message)
        job.status = WhatsappMessageStatus.SENT
        job.provider_message_id = result.get("message_id")
        job.sent_at = datetime.now(timezone.utc)
        job.error_message = None
        append_event(db, tenant_id=tenant_id, event_type="bot_reply_sent", payload=result.get("raw_response"), job_id=job.id)
    except HTTPException as exc:
        job.status = WhatsappMessageStatus.FAILED
        job.failed_at = datetime.now(timezone.utc)
        job.error_message = str(exc.detail)
        append_event(db, tenant_id=tenant_id, event_type="bot_reply_failed", payload={"error": str(exc.detail)}, job_id=job.id)
        raise


def handle_incoming_text_and_send(
    db: Session,
    *,
    tenant_id: int,
    sender: str,
    text: str,
) -> bool:
    result = route_message(db, tenant_id=tenant_id, client_whatsapp=sender, message_text=text, persist_session=True)
    reply = result.get("reply_text")
    if not reply:
        return False
    send_bot_reply(db, tenant_id=tenant_id, recipient_whatsapp=sender, message=str(reply), reference_type="bot_incoming")
    db.commit()
    return True


def _service_order_context(order: ServiceOrder) -> dict[str, Any]:
    service_total = sum(float(item.unit_price) * max(int(item.quantity or 1), 1) for item in order.service_items)
    product_total = sum(float(item.unit_price) * float(item.quantity or 0) for item in order.product_items)
    discount = float(order.discount_amount or 0)
    total = max(0.0, service_total + product_total - discount)
    client = order.client
    return {
        "numero_os": order.id,
        "titulo_os": order.title,
        "descricao_servico": order.description or order.title,
        "valor_total": f"{total:.2f}".replace(".", ","),
        "nome_cliente": client.name if client else "cliente",
        "telefone_cliente": (client.whatsapp or client.phone) if client else "",
    }


def dispatch_service_order_done_flow(db: Session, *, tenant_id: int, order: ServiceOrder) -> bool:
    client = order.client
    recipient = (client.whatsapp or client.phone) if client else None
    if not recipient:
        return False
    result = route_message(
        db,
        tenant_id=tenant_id,
        client_whatsapp=recipient,
        message_text="service_order_done",
        context_extra=_service_order_context(order),
        persist_session=True,
        system_event="service_order_done",
    )
    reply = result.get("reply_text")
    if not reply:
        return False
    send_bot_reply(
        db,
        tenant_id=tenant_id,
        recipient_whatsapp=recipient,
        message=str(reply),
        reference_type="service_order",
        reference_id=order.id,
    )
    db.commit()
    return True
