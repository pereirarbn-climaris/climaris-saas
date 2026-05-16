"""Montagem de payload de anúncio Mercado Livre (items) — atributos, envio, garantia, variações.

Não executa HTTP. Use no endpoint de publicação/atualização após validar categoria e token.

Referência: `docs/mercado-livre-100-operacao.md`.
"""

from __future__ import annotations

from typing import Any


def merge_listing_payload(
    base: dict[str, Any],
    *,
    attributes: list[dict[str, Any]] | None = None,
    shipping: dict[str, Any] | None = None,
    sale_terms: list[dict[str, Any]] | None = None,
    variations: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Junta campos opcionais ao corpo mínimo do item (create/put).

    ``attributes``: lista de ``{"id": "...", "value_id": "..."}`` ou ``value_name`` conforme API ML.
    """
    out: dict[str, Any] = dict(base)
    if attributes:
        existing = out.get("attributes")
        if isinstance(existing, list):
            merged: list[dict[str, Any]] = [a for a in existing if isinstance(a, dict)]
            merged.extend(a for a in attributes if isinstance(a, dict))
            out["attributes"] = merged
        else:
            out["attributes"] = [a for a in attributes if isinstance(a, dict)]
    if shipping is not None:
        out["shipping"] = shipping
    if sale_terms is not None:
        out["sale_terms"] = sale_terms
    if variations is not None:
        out["variations"] = variations
    return out


def shipping_mercado_envios_me2(*, free_shipping: bool = False, local_pick_up: bool = False) -> dict[str, Any]:
    """Envio modo ``me2`` (Mercado Envios) — padrão comum MLB; ajuste conforme conta e categoria."""
    return {
        "mode": "me2",
        "local_pick_up": local_pick_up,
        "free_shipping": free_shipping,
    }
