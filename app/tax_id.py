"""Validação de CPF e CNPJ (somente dígitos)."""

from __future__ import annotations

import re


def digits_only(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def validate_cpf(d: str) -> bool:
    if len(d) != 11 or d == d[0] * 11:
        return False

    def _digit(base: str, factor_start: int) -> int:
        s = sum(int(base[i]) * (factor_start - i) for i in range(len(base)))
        r = (s * 10) % 11
        return 0 if r == 10 else r

    if _digit(d[:9], 10) != int(d[9]):
        return False
    if _digit(d[:10], 11) != int(d[10]):
        return False
    return True


def validate_cnpj(d: str) -> bool:
    if len(d) != 14 or d == d[0] * 14:
        return False
    nums = [int(x) for x in d]
    w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    r1 = sum(nums[i] * w1[i] for i in range(12)) % 11
    dv1 = 0 if r1 < 2 else 11 - r1
    if dv1 != nums[12]:
        return False
    w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    r2 = sum(nums[i] * w2[i] for i in range(13)) % 11
    dv2 = 0 if r2 < 2 else 11 - r2
    return dv2 == nums[13]


def normalize_and_validate_tax_document(raw: str, kind: str) -> str:
    """Retorna só dígitos ou levanta ValueError com mensagem em português."""
    d = digits_only(raw)
    if kind == "cpf":
        if len(d) != 11:
            raise ValueError("CPF deve conter 11 dígitos.")
        if not validate_cpf(d):
            raise ValueError("CPF inválido.")
        return d
    if kind == "cnpj":
        if len(d) != 14:
            raise ValueError("CNPJ deve conter 14 dígitos.")
        if not validate_cnpj(d):
            raise ValueError("CNPJ inválido.")
        return d
    raise ValueError("tax_id_kind deve ser 'cpf' ou 'cnpj'.")
