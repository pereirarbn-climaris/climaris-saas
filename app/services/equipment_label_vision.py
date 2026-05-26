"""Extração estruturada de dados de etiquetas (nameplate) de ar-condicionado via visão computacional."""

from __future__ import annotations

import base64
import json
import logging
import re
import ssl
import urllib.error
import urllib.request
from typing import Any

from fastapi import HTTPException, status

from app.config import CLAUDE_MODEL, GEMINI_API_KEY, OPENAI_API_KEY, HAUKU_ECONOMY_MODEL

logger = logging.getLogger(__name__)

CLAUDE_VISION_MODEL_FALLBACKS: tuple[str, ...] = (
    HAUKU_ECONOMY_MODEL,
    "claude-haiku-4-5-20251001",
    "claude-3-haiku-20240307",
)

MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_MEDIA = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})

EXTRACTION_PROMPT = """Você é um especialista em HVAC lendo placas de identificação (nameplate) de ar-condicionado.
Analise a(s) imagem(ns) e extraia APENAS os dados visíveis na etiqueta.

Retorne SOMENTE um JSON válido (sem markdown, sem texto extra) com exatamente estas chaves:
{
  "marca": "String",
  "modelo_evaporadora": "String ou null",
  "modelo_condensadora": "String ou null",
  "capacidade_btus": "String (ex: 9000 BTUs)",
  "fluido_refrigerante": "String (ex: R-32)",
  "tensao": "String (ex: 220V)",
  "tipo_equipamento": "String (ex: Hi-Wall, Piso Teto, Cassete, Chiller)",
  "tecnologia": "Inverter ou On-Off"
}

Regras:
- Use null quando o campo não estiver legível na imagem.
- capacidade_btus deve incluir "BTUs" quando aplicável.
- tecnologia deve ser exatamente "Inverter" ou "On-Off" (ou null se incerto).
- Se houver duas imagens, a primeira tende a ser evaporadora e a segunda condensadora.
- Não invente dados que não apareçam na placa."""


def _normalize_media_type(content_type: str | None, filename: str | None) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in ALLOWED_MEDIA:
        return ct
    name = (filename or "").lower()
    if name.endswith(".png"):
        return "image/png"
    if name.endswith(".webp"):
        return "image/webp"
    if name.endswith(".gif"):
        return "image/gif"
    return "image/jpeg"


def _parse_json_payload(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            raise ValueError("Resposta da IA não contém JSON válido.") from exc
        parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("JSON retornado deve ser um objeto.")
    return parsed


def _normalize_extraction(raw: dict[str, Any]) -> dict[str, str | None]:
    def s(key: str) -> str | None:
        val = raw.get(key)
        if val is None:
            return None
        text = str(val).strip()
        return text or None

    tecnologia = s("tecnologia")
    if tecnologia:
        low = tecnologia.lower()
        if "invert" in low:
            tecnologia = "Inverter"
        elif "on" in low and "off" in low:
            tecnologia = "On-Off"

    return {
        "marca": s("marca"),
        "modelo_evaporadora": s("modelo_evaporadora"),
        "modelo_condensadora": s("modelo_condensadora"),
        "capacidade_btus": s("capacidade_btus"),
        "fluido_refrigerante": s("fluido_refrigerante"),
        "tensao": s("tensao"),
        "tipo_equipamento": s("tipo_equipamento"),
        "tecnologia": tecnologia,
    }


def _anthropic_vision(
    images: list[tuple[str, bytes]],
    *,
    media_types: list[str],
    claude_api_key: str | None,
    claude_model: str,
) -> dict[str, Any] | None:
    if not claude_api_key:
        return None
    content: list[dict[str, Any]] = []
    for (media_type, data), mt in zip(images, media_types, strict=True):
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": mt or media_type,
                    "data": base64.b64encode(data).decode("ascii"),
                },
            }
        )
    content.append({"type": "text", "text": EXTRACTION_PROMPT})
    payload = {
        "model": claude_model,
        "max_tokens": 800,
        "temperature": 0,
        "messages": [{"role": "user", "content": content}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": claude_api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        blocks = data.get("content") or []
        text_parts = [b.get("text", "") for b in blocks if b.get("type") == "text"]
        joined = "\n".join(text_parts).strip()
        if joined:
            return _normalize_extraction(_parse_json_payload(joined))
    except Exception:
        logger.exception("Falha na extração via Claude Vision.")
    return None


def _gemini_vision(
    images: list[tuple[str, bytes]],
    *,
    media_types: list[str],
) -> dict[str, Any] | None:
    if not GEMINI_API_KEY:
        return None
    parts: list[dict[str, Any]] = [{"text": EXTRACTION_PROMPT}]
    for (_, data), mt in zip(images, media_types, strict=True):
        parts.append(
            {
                "inline_data": {
                    "mime_type": mt,
                    "data": base64.b64encode(data).decode("ascii"),
                }
            }
        )
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
        f"?key={GEMINI_API_KEY}"
    )
    payload = {"contents": [{"parts": parts}], "generationConfig": {"temperature": 0}}
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        candidates = data.get("candidates") or []
        if not candidates:
            return None
        parts_out = candidates[0].get("content", {}).get("parts") or []
        text = "\n".join(p.get("text", "") for p in parts_out if p.get("text")).strip()
        if text:
            return _normalize_extraction(_parse_json_payload(text))
    except Exception:
        logger.exception("Falha na extração via Gemini Vision.")
    return None


def _openai_vision(
    images: list[tuple[str, bytes]],
    *,
    media_types: list[str],
) -> dict[str, Any] | None:
    if not OPENAI_API_KEY:
        return None
    content: list[dict[str, Any]] = [{"type": "text", "text": EXTRACTION_PROMPT}]
    for (_, data), mt in zip(images, media_types, strict=True):
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mt};base64,{base64.b64encode(data).decode('ascii')}",
                },
            }
        )
    payload = {
        "model": "gpt-4o",
        "max_tokens": 800,
        "temperature": 0,
        "messages": [{"role": "user", "content": content}],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
    )
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if text:
            return _normalize_extraction(_parse_json_payload(str(text)))
    except Exception:
        logger.exception("Falha na extração via OpenAI Vision.")
    return None


async def extract_ac_label_from_images(
    *,
    evaporator_bytes: bytes | None,
    evaporator_content_type: str | None,
    evaporator_filename: str | None,
    condenser_bytes: bytes | None,
    condenser_content_type: str | None,
    condenser_filename: str | None,
    claude_api_key: str | None = None,
    claude_model: str | None = None,
) -> dict[str, str | None]:
    images: list[tuple[str, bytes]] = []
    media_types: list[str] = []

    for blob, ct, name in (
        (evaporator_bytes, evaporator_content_type, evaporator_filename),
        (condenser_bytes, condenser_content_type, condenser_filename),
    ):
        if not blob:
            continue
        if len(blob) > MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Imagem muito grande (máx. 8 MB por foto).",
            )
        mt = _normalize_media_type(ct, name)
        images.append((mt, blob))
        media_types.append(mt)

    if not images:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Envie ao menos uma foto da etiqueta (evaporadora e/ou condensadora).",
        )

    model = claude_model or CLAUDE_MODEL
    models_to_try: list[str] = []
    for candidate in (model, *CLAUDE_VISION_MODEL_FALLBACKS):
        if candidate and candidate not in models_to_try:
            models_to_try.append(candidate)

    for attempt_model in models_to_try:
        result = _anthropic_vision(
            images,
            media_types=media_types,
            claude_api_key=claude_api_key,
            claude_model=attempt_model,
        )
        if result and any(v for v in result.values() if v):
            return result

    result = _gemini_vision(images, media_types=media_types)
    if result and any(v for v in result.values() if v):
        return result

    result = _openai_vision(images, media_types=media_types)
    if result and any(v for v in result.values() if v):
        return result

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "Não foi possível extrair dados da etiqueta. "
            "Configure a chave Claude em Operação → Chaves APIs, ou defina CLAUDE_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY no servidor."
        ),
    )
