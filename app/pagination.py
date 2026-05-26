"""Helpers de paginação — evita 422 quando o cliente envia `limit` acima do teto."""

from __future__ import annotations

MAX_PAGE_LIMIT = 200


def clamp_limit(limit: int, *, cap: int = MAX_PAGE_LIMIT) -> int:
    """Retorna um limite entre 1 e `cap` (padrão 200)."""
    try:
        value = int(limit)
    except (TypeError, ValueError):
        value = cap
    return min(max(1, value), cap)
