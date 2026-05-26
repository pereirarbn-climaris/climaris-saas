"""Chaves de ícone para categorias de equipamento (UI compartilhada)."""

from __future__ import annotations

DEFAULT_ICON_KEY = "outros"

VALID_ICON_KEYS: frozenset[str] = frozenset(
    {
        "ar_condicionado",
        "climatizador",
        "geladeira",
        "bebedouro",
        "outros",
    }
)

ICON_LABELS: dict[str, str] = {
    "ar_condicionado": "Ar-condicionado",
    "climatizador": "Climatizador",
    "geladeira": "Geladeira",
    "bebedouro": "Bebedouro",
    "outros": "Outros / genérico",
}


def icon_key_from_category_name(name: str) -> str:
    n = (name or "").lower()
    if "geladeira" in n:
        return "geladeira"
    if "bebedouro" in n:
        return "bebedouro"
    if "climatizador" in n:
        return "climatizador"
    if "ar-condicionado" in n or "ar condicionado" in n or "split" in n:
        return "ar_condicionado"
    return DEFAULT_ICON_KEY


def normalize_icon_key(value: str | None, *, fallback_name: str | None = None) -> str:
    key = (value or "").strip().lower()
    if key in VALID_ICON_KEYS:
        return key
    if fallback_name:
        return icon_key_from_category_name(fallback_name)
    return DEFAULT_ICON_KEY
