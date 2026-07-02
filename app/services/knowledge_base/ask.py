"""Consulta RAG com Claude."""

from __future__ import annotations

import json
import logging
import ssl
import urllib.error
import urllib.request
from typing import Any

from sqlalchemy.orm import Session

from app.config import CLAUDE_MODEL, KB_ENABLED, KB_MAX_CONTEXT_CHARS, KB_TOP_MANUALS
from app.platform_credentials import resolve_claude_api_key, resolve_claude_model
from app.services.knowledge_base.retrieval import RetrievedChunk, retrieve_relevant_chunks

logger = logging.getLogger("erp.knowledge_base.ask")

_SYSTEM_PROMPT = (
    "Você é um especialista em climatização. "
    "Responda apenas com base nos manuais técnicos fornecidos. "
    "Se não souber, diga que não há informações no manual."
)


def _build_context(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return ""

    manuals_seen: set[str] = set()
    parts: list[str] = []
    total = 0
    for chunk in chunks:
        manual_key = str(chunk.manual_id)
        meta = [
            f"fabricante: {chunk.fabricante or '—'}",
            f"modelo: {chunk.modelo or '—'}",
            f"tipo: {chunk.tipo_documento}",
            f"versão: {chunk.versao or '—'}",
            f"página: {chunk.pagina_origem}",
        ]
        header = f"### {chunk.manual_title} ({', '.join(meta)})"
        block = f"{header}\n{chunk.content}" if manual_key not in manuals_seen else f"[pág. {chunk.pagina_origem}]\n{chunk.content}"
        if manual_key not in manuals_seen:
            manuals_seen.add(manual_key)
        if total + len(block) > KB_MAX_CONTEXT_CHARS:
            break
        parts.append(block)
        total += len(block)
    return "\n\n---\n\n".join(parts)


def _extract_text_from_anthropic(data: dict[str, Any]) -> str:
    parts: list[str] = []
    for block in data.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(str(block.get("text") or ""))
    return "\n".join(parts).strip()


def _call_claude(*, api_key: str, model: str, user_message: str) -> str:
    payload = {
        "model": model,
        "max_tokens": 1024,
        "temperature": 0.1,
        "system": _SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_message}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.warning("claude_kb_http_error status=%s body=%s", exc.code, body[:500])
        raise RuntimeError("Falha ao consultar a IA.") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError("Não foi possível conectar à API de IA.") from exc

    text = _extract_text_from_anthropic(data)
    if not text:
        raise RuntimeError("Resposta vazia da IA.")
    return text


def ask_knowledge_base(
    db: Session,
    *,
    tenant_id: int,
    question: str,
    brand: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    if not KB_ENABLED:
        raise RuntimeError("Knowledge Base desabilitada.")

    q = question.strip()
    if not q:
        raise ValueError("Pergunta é obrigatória.")

    chunks = retrieve_relevant_chunks(
        db,
        tenant_id=tenant_id,
        question=q,
        brand=brand,
        model=model,
        top_manuals=KB_TOP_MANUALS,
    )
    context = _build_context(chunks)

    equipment_label = " · ".join(p for p in [(brand or "").strip(), (model or "").strip()] if p)
    user_parts = [f"Pergunta do técnico: {q}"]
    if equipment_label:
        user_parts.append(f"Equipamento em manutenção: {equipment_label}")
    if context:
        user_parts.append(f"Trechos dos manuais técnicos:\n\n{context}")
    else:
        user_parts.append("Nenhum trecho relevante foi encontrado nos manuais indexados.")

    api_key = resolve_claude_api_key(db)
    if not api_key:
        raise RuntimeError("Chave da API Claude não configurada.")

    answer = _call_claude(
        api_key=api_key,
        model=resolve_claude_model(db) or CLAUDE_MODEL,
        user_message="\n\n".join(user_parts),
    )

    manuals_used = []
    seen: set[str] = set()
    for chunk in chunks:
        mid = str(chunk.manual_id)
        if mid in seen:
            continue
        seen.add(mid)
        manuals_used.append(
            {
                "manual_id": mid,
                "title": chunk.manual_title,
                "brand": chunk.fabricante or None,
                "model": chunk.modelo or None,
            }
        )

    return {
        "answer": answer,
        "manuals_used": manuals_used[:KB_TOP_MANUALS],
        "chunks_found": len(chunks),
        "has_context": bool(context),
    }
