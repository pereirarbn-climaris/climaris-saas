"""Embeddings OpenAI text-embedding-3-small para a Knowledge Base."""

from __future__ import annotations

import json
import logging
import ssl
import urllib.error
import urllib.request

from sqlalchemy.orm import Session

from app.config import KB_EMBEDDING_MODEL
from app.platform_credentials import resolve_openai_api_key

logger = logging.getLogger("erp.knowledge_base.embeddings")

_BATCH_SIZE = 96
_MISSING_KEY_MSG = (
    "Chave da API OpenAI não configurada para embeddings da Knowledge Base. "
    "Configure em Operação → Chaves APIs (OpenAI) ou defina OPENAI_API_KEY no servidor."
)


def _require_api_key(db: Session | None) -> str:
    key = (resolve_openai_api_key(db) or "").strip()
    if not key:
        raise RuntimeError(_MISSING_KEY_MSG)
    return key


def _openai_embeddings_request(texts: list[str], *, db: Session | None) -> list[list[float]]:
    payload = {"model": KB_EMBEDDING_MODEL, "input": texts}
    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {_require_api_key(db)}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.warning("openai_embeddings_http_error status=%s body=%s", exc.code, body[:500])
        raise RuntimeError("Falha ao gerar embeddings na OpenAI.") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError("Não foi possível conectar à API da OpenAI.") from exc

    rows = data.get("data") or []
    if len(rows) != len(texts):
        raise RuntimeError("Resposta de embeddings incompleta da OpenAI.")
    rows.sort(key=lambda row: int(row.get("index", 0)))
    return [list(row["embedding"]) for row in rows]


def embed_texts(texts: list[str], *, db: Session | None = None) -> list[list[float]]:
    if not texts:
        return []
    vectors: list[list[float]] = []
    for start in range(0, len(texts), _BATCH_SIZE):
        batch = texts[start : start + _BATCH_SIZE]
        vectors.extend(_openai_embeddings_request(batch, db=db))
    return vectors


def embed_query(text: str, *, db: Session | None = None) -> list[float]:
    return _openai_embeddings_request([text.strip()], db=db)[0]
