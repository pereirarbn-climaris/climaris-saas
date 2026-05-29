from __future__ import annotations

from typing import TypedDict


class PhoneValidationResult(TypedDict):
    valid: bool
    formatted: str
    error: str | None


def _digits_only(phone: str) -> str:
    return "".join(ch for ch in (phone or "") if ch.isdigit())


def validate_phone_number(phone: str) -> PhoneValidationResult:
    """Valida telefone brasileiro: país 55 + DDD (2) + 8 ou 9 dígitos."""
    raw = (phone or "").strip()
    digits = _digits_only(raw)
    if not digits:
        return {"valid": False, "formatted": "", "error": "Número vazio."}

    # Remove zeros à esquerda de discagem (0XX) ou tronco
    while digits.startswith("0") and len(digits) > 11:
        digits = digits[1:]

    if digits.startswith("55"):
        national = digits[2:]
    else:
        national = digits

    if len(national) not in (10, 11):
        return {
            "valid": False,
            "formatted": "",
            "error": "Informe DDD (2 dígitos) + número com 8 ou 9 dígitos.",
        }

    ddd = national[:2]
    subscriber = national[2:]

    try:
        ddd_int = int(ddd)
    except ValueError:
        return {"valid": False, "formatted": "", "error": "DDD inválido."}

    if ddd_int < 11 or ddd_int > 99:
        return {"valid": False, "formatted": "", "error": "DDD inválido (use 11 a 99)."}

    if len(subscriber) not in (8, 9):
        return {
            "valid": False,
            "formatted": "",
            "error": "O número deve ter 8 (fixo) ou 9 (celular) dígitos após o DDD.",
        }

    if len(subscriber) == 9 and not subscriber.startswith("9"):
        return {
            "valid": False,
            "formatted": "",
            "error": "Celular com 9 dígitos deve começar com 9.",
        }

    if len(subscriber) == 8 and subscriber.startswith(("9", "0")):
        return {
            "valid": False,
            "formatted": "",
            "error": "Número fixo inválido para este formato.",
        }

    e164_digits = f"55{ddd}{subscriber}"
    return {"valid": True, "formatted": f"+{e164_digits}", "error": None}


def phone_validation_to_storage(formatted: str) -> str:
    """Converte +5511… para dígitos usados no envio WhatsApp (sem '+')."""
    return _digits_only(formatted)
