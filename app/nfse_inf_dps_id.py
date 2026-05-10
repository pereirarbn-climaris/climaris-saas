"""Identificador da DPS (atributo Id de infDPS) para GET /dps/{id} no ADN — sem dependência de ORM."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

_TS_ID_DPS_PATTERN = re.compile(r"^DPS\d{42}$")


def inf_dps_id_segments(inf_id: str) -> dict[str, str]:
    """Decodifica o ``Id`` de ``infDPS`` para diagnóstico (suporte / NFSE_SEFIN_DEBUG).

    Layout nacional (SPED): município emissor 7 + tipo inscrição 1 + inscrição federal 14
    + série DPS 5 + número DPS 15 — **não** é a chave de acesso da NFS-e autorizada (44 dígitos).
    """

    if not _TS_ID_DPS_PATTERN.fullmatch(inf_id):
        return {"_erro": "Id não corresponde a ^DPS[0-9]{42}$"}
    d = inf_id[3:]
    return {
        "observacao": "TSIdDPS (SPED). Não confundir com chave de acesso da NFS-e emitida.",
        "cMunEmissor_7": d[0:7],
        "tipoInscricaoFederal_1": d[7],
        "inscricaoFederal_14": d[8:22],
        "serieDPS_5": d[22:27],
        "numeroDPS_15": d[27:42],
    }


def extract_inf_dps_id_from_xml(xml_string: str) -> str | None:
    """Retorna o atributo `Id` do elemento `infDPS` (manual nacional — composição IBGE + inscrição + série + número)."""

    s = (xml_string or "").strip()
    if not s:
        return None
    try:
        root = ET.fromstring(s.encode("utf-8"))
        for el in root.iter():
            tag_local = el.tag.split("}")[-1] if "}" in el.tag else el.tag
            if tag_local.lower() == "infdps":
                i = el.get("Id")
                if i and str(i).strip():
                    return str(i).strip()
    except ET.ParseError:
        pass
    m = re.search(r"<(?:[^:>]*:)?infDPS\b[^>]*\bId=\"([^\"]+)\"", s, re.IGNORECASE | re.DOTALL)
    return m.group(1).strip() if m else None
