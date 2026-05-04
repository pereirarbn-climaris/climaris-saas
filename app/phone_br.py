"""Normalização de telefone BR (somente dígitos) para API e banco."""

from __future__ import annotations


def normalize_br_phone_optional(value: str | None) -> str | None:
    """
    Celular: DDD + 9 dígitos (3º dígito nacional = 9) → até 11 dígitos.
    Fixo: DDD + 8 dígitos → até 10 dígitos.
    """
    if value is None:
        return None
    d = "".join(c for c in str(value) if c.isdigit())
    if not d:
        return None
    if len(d) >= 3 and d[2] == "9":
        return d[:11]
    return d[:10]
