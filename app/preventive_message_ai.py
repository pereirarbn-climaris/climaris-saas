"""Personalização da mensagem preventiva via IA, com validação e fallback ao template renderizado."""

from __future__ import annotations

import json
import logging
import re
import ssl
import urllib.error
import urllib.request
from typing import Any

from sqlalchemy.orm import Session

from app.ai_assistant import _is_ai_enabled
from app.config import CLAUDE_MODEL, PREVENTIVE_AI_MESSAGE_ENABLED
from app.platform_credentials import resolve_claude_api_key, resolve_claude_model
from models import Tenant

logger = logging.getLogger("erp.preventive_message_ai")

_MAX_CHARS = 900
_MIN_CHARS = 40

_SYSTEM_PROMPT = """Você redige mensagens WhatsApp de manutenção preventiva para clientes de climatização.

Regras OBRIGATÓRIAS:
1. Use SOMENTE fatos presentes em "Mensagem base" e no "Padrão da empresa".
2. Tom cordial e profissional, português do Brasil.
3. Cumprimente pelo nome do cliente.
4. Mencione equipamento(s) e o intervalo/tempo desde a última manutenção.
5. Convide a agendar a próxima preventiva — sem inventar datas, horários, preços ou telefones.
6. Máximo 900 caracteres. Emojis moderados (0 a 3). Pode usar *negrito* do WhatsApp.
7. NÃO inclua links, URLs, valores monetários ou promessas que não estejam na mensagem base.
8. Responda APENAS com o texto final, sem explicações ou markdown extra."""


def _extract_text_from_anthropic(data: dict[str, Any]) -> str:
    parts: list[str] = []
    for block in data.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(str(block.get("text") or ""))
    return "\n".join(parts).strip()


def _anthropic_messages_request(*, api_key: str, model: str, system: str, user: str) -> str | None:
    payload = {
        "model": model,
        "max_tokens": 512,
        "temperature": 0.2,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=45) as resp:
            raw = resp.read().decode("utf-8")
        data = json.loads(raw) if raw.strip() else {}
        if isinstance(data, dict):
            return _extract_text_from_anthropic(data) or None
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8")[:300]
        except Exception:
            pass
        logger.warning("preventive AI HTTP %s: %s", exc.code, detail)
    except Exception:
        logger.exception("preventive AI request failed")
    return None


def _client_first_name(client_name: str) -> str:
    parts = (client_name or "").strip().split()
    return parts[0] if parts else ""


def validate_preventive_ai_message(*, text: str, rendered_body: str, client_name: str) -> bool:
    cleaned = (text or "").strip()
    if len(cleaned) < _MIN_CHARS or len(cleaned) > _MAX_CHARS:
        return False
    first = _client_first_name(client_name).lower()
    if first and first not in cleaned.lower():
        return False
    if re.search(r"https?://", cleaned, flags=re.I):
        return False
    if re.search(r"R\$\s*\d", cleaned):
        return False
    # Mantém pelo menos um termo-chave da base (equipamento/intervalo/manutenção).
    base_tokens = {
        t.lower()
        for t in re.findall(r"[A-Za-zÀ-ú0-9]{4,}", rendered_body)
        if t.lower() not in {"cliente", "olá", "ola", "vamos", "agendar", "preventiva", "manutenção", "manutencao"}
    }
    if base_tokens:
        hits = sum(1 for tok in base_tokens if tok in cleaned.lower())
        if hits == 0:
            return False
    return True


def polish_preventive_whatsapp_message(
    db: Session,
    *,
    tenant: Tenant,
    tenant_id: int,
    rendered_body: str,
    client_name: str,
    template_pattern: str | None = None,
) -> str:
    """Reescreve a mensagem renderizada dentro do padrão; fallback silencioso se IA indisponível ou inválida."""
    base = (rendered_body or "").strip()
    if not base:
        return base
    if not PREVENTIVE_AI_MESSAGE_ENABLED or not _is_ai_enabled(db, tenant_id):
        return base
    api_key = resolve_claude_api_key(db)
    if not api_key:
        return base

    pattern = (template_pattern or tenant.preventive_message_template or "").strip()
    user_prompt = (
        f"Empresa: {tenant.name}\n\n"
        f"Padrão da empresa (referência de estilo — não invente fatos além da base):\n{pattern or '(padrão implícito)'}\n\n"
        f"Mensagem base (fatos confirmados — preserve estes dados):\n{base}\n\n"
        f"Cliente: {client_name.strip() or 'Cliente'}"
    )
    model = resolve_claude_model(db) or CLAUDE_MODEL
    polished = _anthropic_messages_request(api_key=api_key, model=model, system=_SYSTEM_PROMPT, user=user_prompt)
    if not polished:
        return base
    polished = polished.strip().strip('"').strip("'")
    if validate_preventive_ai_message(text=polished, rendered_body=base, client_name=client_name):
        return polished
    logger.info("preventive AI message rejected by validator tenant_id=%s", tenant_id)
    return base
