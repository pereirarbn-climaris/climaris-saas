"""Normalização de textos e códigos para o XML da DPS (NFS-e nacional)."""

from __future__ import annotations

import os
import unicodedata

from app.tax_id import digits_only


def nfse_xml_ascii_fold(text: str, *, max_len: int | None = None) -> str:
    """Remove diacríticos (NFD) para reduzir rejeições em validadores estritos / E999 genérico.

    UTF-8 permanece válido; apenas caracteres combinantes são retirados (ex.: São → Sao).
    Desligue com ``NFSE_DPS_XML_ASCII_FOLD=0``.
    """

    if os.getenv("NFSE_DPS_XML_ASCII_FOLD", "1").strip().lower() in ("0", "false", "no", "off"):
        base = text or ""
        return base[:max_len] if max_len is not None else base

    if not text:
        return ""
    nfd = unicodedata.normalize("NFD", text)
    out = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    if max_len is not None:
        out = out[:max_len]
    return out


def nfse_dps_descricao_sanitizada(raw: str | None) -> str:
    """Texto da discriminação (DPS: ``xDescServ`` e JSON interno de emissão).

    **Sempre** remove acentos e restringe a ASCII imprimível — independente de
    ``NFSE_DPS_XML_ASCII_FOLD`` (a descrição do serviço é o ponto mais sensível a E999 na restrita).
    """

    s = (raw or "").strip()
    if not s:
        return ""
    nfd = unicodedata.normalize("NFD", s)
    s = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    s = s.replace("ç", "c").replace("Ç", "C")
    for bad in ("\u2014", "\u2013", "\u2212", "\u00ad"):
        s = s.replace(bad, "-")
    s = "".join(c for c in s if 32 <= ord(c) < 127)
    return s[:2000]


def c_trib_nac_digitos(raw: str | None) -> str:
    """Valor da tag ``cTribNac``: exatamente 6 dígitos (``01.01.01`` → ``010101``)."""

    d = digits_only(raw or "")
    if len(d) >= 6:
        return d[:6]
    if d:
        return d.ljust(6, "0")[:6]
    return "000000"


def c_nbs_digitos(raw: str | None, *, max_len: int = 20) -> str:
    """``cNBS`` como sequência numérica (sem prefixos)."""

    d = digits_only(raw or "")
    return d[:max_len] if d else ""
