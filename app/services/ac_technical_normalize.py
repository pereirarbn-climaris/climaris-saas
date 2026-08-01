"""Normaliza chaves de technical_data de ar-condicionado (aliases da IA → canônicas).

A IA extrai specs com nomes livres (ex: cabo_conexao_alimentacao_mm2, torque_conexao_flange_6_35…).
O formulário usa chaves canônicas (cabo_alimentacao, torque_liquido_nm). Este módulo unifica.
"""

from __future__ import annotations

import re
from typing import Any

# alias → canônico
AC_TECHNICAL_KEY_ALIASES: dict[str, str] = {
    "disjuntor_recomendado_A": "disjuntor_recomendado_a",
    "cabo_alimentacao_minimo": "cabo_alimentacao",
    "cabo_alimentacao_externa_interna": "cabo_alimentacao",
    "cabo_alimentacao_unidade_externa": "cabo_alimentacao",
    "cabo_conexao_alimentacao_mm2": "cabo_alimentacao",
    "cabo_conexao_alimentacao": "cabo_alimentacao",
    "bitola_cabo_alimentacao": "cabo_alimentacao",
    "bitola_cabo_alimentacao_mm2": "cabo_alimentacao",
    "cabo_interligacao_minimo": "cabo_interligacao",
    "cabo_conexao_interna_externa_mm2": "cabo_interligacao",
    "cabo_conexao_interna_externa": "cabo_interligacao",
    "cabo_interligacao_interna_externa": "cabo_interligacao",
    "bitola_cabo_interligacao": "cabo_interligacao",
    "bitola_cabo_interligacao_mm2": "cabo_interligacao",
    "bitola_minima_cabo_mm2": "bitola_minima_mm2",
    "secao_minima_cabo_mm2": "bitola_minima_mm2",
    "corrente_nominal": "corrente_nominal_a",
    "corrente_maxima_a": "corrente_nominal_a",
    "corrente_operacao_a": "corrente_nominal_a",
    "potencia_eletrica_w": "potencia_nominal_w",
    "potencia_consumida_w": "potencia_nominal_w",
    "potencia_entrada_w": "potencia_nominal_w",
    "potencia_entrada_kw": "potencia_kw",
    "disjuntor_a": "disjuntor_recomendado_a",
    "disjuntor_minimo_a": "disjuntor_recomendado_a",
    "comprimento_maximo_cabo_alimentacao_m": "comprimento_maximo_cabos_m",
    "comprimento_maximo_cabo_comunicacao_m": "comprimento_maximo_cabos_m",
    "diametro_linha_liquido_mm": "diametro_tubo_liquido",
    "diametro_linha_succao_mm": "diametro_tubo_gas",
    "diametro_tubo_gas_succao_mm": "diametro_tubo_gas",
    "diametro_tubo_gas_descarga_mm": "diametro_tubo_gas",
    "diametro_tubulacao_liquido": "diametro_tubo_liquido",
    "diametro_tubulacao_gas": "diametro_tubo_gas",
    "diametro_liquido": "diametro_tubo_liquido",
    "diametro_gas": "diametro_tubo_gas",
    "comprimento_maximo_tubo_m": "comprimento_maximo_tubulacao_m",
    "maxima_distancia_unidades": "comprimento_maximo_tubulacao_m",
    "distancia_maxima_tubulacao_m": "comprimento_maximo_tubulacao_m",
    "comprimento_tubo_carga_padrao": "comprimento_minimo_tubo_m",
    "desnivel_maximo_m": "altura_maxima_desnivel_m",
    "altura_maxima_tubo_m": "altura_maxima_desnivel_m",
    "maxima_altura_entre_unidades": "altura_maxima_desnivel_m",
    "desnivel_maximo_entre_unidades_m": "altura_maxima_desnivel_m",
    "carga_refrigerante_g": "carga_refrigerante_fabrica_kg",
    "carga_frabrica_m": "carga_refrigerante_fabrica_kg",
    "carga_de_gas_fabrica": "carga_refrigerante_fabrica_kg",
    "carga_gas_fabrica_kg": "carga_refrigerante_fabrica_kg",
    "adicao_carga_gas_por_metro_acima_5m": "adicao_carga_gas_por_metro",
    "carga_adicional_por_metro_g": "adicao_carga_gas_por_metro",
    "carga_adicional_refrigerante_por_metro_g": "adicao_carga_gas_por_metro",
    "raio_curvatura_minimo_tubo_mm": "raio_curvatura_minimo_mm",
    "torque_conexao": "torque_liquido_nm",
    "dimensao_evaporadora_mm": "dimensoes_interna_mm",
    "dimensao_condensadora_mm": "dimensoes_externa_mm",
    "dimensoes_unidade_interna_mm": "dimensoes_interna_mm",
    "dimensoes_unidade_externa_mm": "dimensoes_externa_mm",
    "peso_liquido_evaporadora_kg": "peso_interna_kg",
    "peso_liquido_condensadora_kg": "peso_externa_kg",
    "peso_unidade_interna_kg": "peso_interna_kg",
    "peso_unidade_externa_kg": "peso_externa_kg",
    "altura_minima_instalacao_m": "altura_instalacao_minima_m",
    "altura_minima_de_instalacao_m": "altura_instalacao_minima_m",
    "altura_minima_teto_mm": "distancia_minima_teto_mm",
    "espaco_minimo_obstrucao_superior_mm": "distancia_minima_teto_mm",
    "espaco_minimo_obstrucao_lateral_mm": "distancia_minima_parede_mm",
    "distancia_minima_lateral_mm": "distancia_minima_parede_mm",
    "espaco_minimo_parede_protecao_mm": "distancia_minima_parede_mm",
    "distancia_minima_unidade_externa_parede_mm": "distancia_minima_parede_mm",
    "diametro_orificio_parede_mm": "diametro_furo_parede_mm",
    "modelo_comercial_completo": "modelo_do_equipamento",
    "frequencia": "tecnologia",
    "tipo_frequencia": "tecnologia",
    "modo_operacao": "tecnologia",
}


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_tecnologia(raw: str) -> str:
    lower = raw.strip().lower().replace(" ", "")
    if "inverter" in lower or lower == "inv":
        return "Inverter"
    if any(x in lower for x in ("on-off", "onoff", "on/off", "fix", "convencional")):
        return "On-Off"
    return raw.strip()


def _infer_tipo_equipamento(raw: str) -> str | None:
    lower = raw.lower()
    if "hi-wall" in lower or "hiwall" in lower or "high wall" in lower:
        return "Hi-Wall"
    if "piso" in lower and "teto" in lower:
        return "Piso Teto"
    if "cassete" in lower:
        return "Cassete"
    if "duto" in lower:
        return "Duto"
    if "janela" in lower:
        return "Janela"
    if "chiller" in lower:
        return "Chiller"
    if "vrf" in lower or "multi" in lower:
        return "VRF"
    return None


def _semantic_canonical(key: str) -> str | None:
    k = key.lower()
    if "cabo" in k and ("aliment" in k or "power" in k):
        return "cabo_alimentacao"
    if "cabo" in k and (
        "interlig" in k
        or "interna_externa" in k
        or "conexao_interna" in k
        or ("conexao" in k and "externa" in k)
    ):
        return "cabo_interligacao"
    if "cabo" in k and ("comunic" in k or "sinal" in k):
        return "cabo_comunicacao"
    if ("bitola" in k or "secao" in k) and ("cabo" in k or "mm2" in k):
        return "bitola_minima_mm2"
    if "corrente" in k and ("nominal" in k or "operacao" in k or k.endswith("_a")):
        return "corrente_nominal_a"
    if "disjuntor" in k:
        return "disjuntor_recomendado_a"
    if "potencia" in k and "kw" in k:
        return "potencia_kw"
    if "potencia" in k and ("_w" in k or "watt" in k):
        return "potencia_nominal_w"
    if ("diametro" in k or "bitola" in k) and ("liquido" in k or "liquid" in k):
        return "diametro_tubo_liquido"
    if ("diametro" in k or "bitola" in k) and ("gas" in k or "succao" in k or "vapor" in k):
        return "diametro_tubo_gas"
    if ("comprimento" in k or "distancia" in k) and ("tubo" in k or "tubul" in k) and (
        "max" in k or "maximo" in k
    ):
        return "comprimento_maximo_tubulacao_m"
    if ("desnivel" in k or "altura" in k) and ("max" in k or "maximo" in k) and (
        "unidade" in k or "tubo" in k or "desnivel" in k
    ):
        return "altura_maxima_desnivel_m"
    if "altura" in k and "instal" in k and ("min" in k or "minima" in k):
        return "altura_instalacao_minima_m"
    if ("dimens" in k or "medida" in k) and ("interna" in k or "evapor" in k):
        return "dimensoes_interna_mm"
    if ("dimens" in k or "medida" in k) and ("externa" in k or "condens" in k):
        return "dimensoes_externa_mm"
    if "peso" in k and ("interna" in k or "evapor" in k):
        return "peso_interna_kg"
    if "peso" in k and ("externa" in k or "condens" in k):
        return "peso_externa_kg"
    if ("furo" in k or "orificio" in k) and ("parede" in k or "diametro" in k):
        return "diametro_furo_parede_mm"
    if k in {"frequencia", "tipo_frequencia", "modo_operacao"}:
        return "tecnologia"
    return None


def _apply_torque_flange_mapping(next_data: dict[str, Any]) -> None:
    """torque_conexao_flange_6_35… → torque_liquido; 9_52 → torque_gas."""
    for key in list(next_data.keys()):
        k = key.lower().replace(".", "_")
        if "torque" not in k:
            continue
        value = _as_text(next_data.get(key))
        if not value:
            continue
        is_liquid = any(x in k for x in ("6_35", "635", "1_4", "1/4")) or bool(
            re.search(r"\b6[\s._-]?35\b", k)
        )
        is_gas = any(x in k for x in ("9_52", "952", "3_8", "3/8")) or bool(
            re.search(r"\b9[\s._-]?52\b", k)
        )
        if is_liquid:
            if not _as_text(next_data.get("torque_liquido_nm")):
                next_data["torque_liquido_nm"] = value
            if not _as_text(next_data.get("diametro_tubo_liquido")):
                next_data["diametro_tubo_liquido"] = "6.35 mm"
            if key != "torque_liquido_nm" and _as_text(next_data.get("torque_liquido_nm")):
                next_data.pop(key, None)
            continue
        if is_gas:
            if not _as_text(next_data.get("torque_gas_nm")):
                next_data["torque_gas_nm"] = value
            if not _as_text(next_data.get("diametro_tubo_gas")):
                next_data["diametro_tubo_gas"] = "9.52 mm"
            if key != "torque_gas_nm" and _as_text(next_data.get("torque_gas_nm")):
                next_data.pop(key, None)


def _apply_cable_derived_fields(next_data: dict[str, Any]) -> None:
    """'3V X 1,5 mm², H07RN-F' → bitola 1.5 + tipo H07RN-F."""
    cabo = _as_text(next_data.get("cabo_alimentacao"))
    if not cabo:
        return
    if not _as_text(next_data.get("bitola_minima_mm2")):
        m = re.search(r"(\d+[.,]\d+|\d+)\s*mm", cabo, flags=re.IGNORECASE)
        if m:
            next_data["bitola_minima_mm2"] = m.group(1).replace(",", ".")
    if not _as_text(next_data.get("tipo_cabo_alimentacao")):
        m = re.search(r"\b(H0\d[A-Z]{2}-[A-Z]|HO\d[A-Z]{2}-[A-Z]|PP)\b", cabo, flags=re.IGNORECASE)
        if m:
            token = m.group(1).upper()
            next_data["tipo_cabo_alimentacao"] = "PP" if token.startswith("PP") else token
        elif re.search(r"\bpp\b|\b3\s*vias?\b|\b3v\b", cabo, flags=re.IGNORECASE):
            next_data["tipo_cabo_alimentacao"] = "PP"


def _infer_from_model_and_context(next_data: dict[str, Any]) -> None:
    modelo = _as_text(next_data.get("modelo_do_equipamento") or next_data.get("modelo")).upper()
    ctx = " ".join(_as_text(v) for v in next_data.values()).lower()

    if not _as_text(next_data.get("tipo_equipamento")):
        inferred = _infer_tipo_equipamento(ctx)
        if inferred:
            next_data["tipo_equipamento"] = inferred
        elif (
            re.match(r"^AR\d{2}[A-Z]", modelo)
            or re.match(r"^GWH\d", modelo)
            or re.match(r"^GWC\d", modelo)
            or re.match(r"^PAC\d", modelo)
            or (
                (_as_text(next_data.get("diametro_tubo_liquido")) or _as_text(next_data.get("diametro_tubo_gas")))
                and "btu" in _as_text(next_data.get("capacity")).lower()
            )
        ):
            next_data["tipo_equipamento"] = "Hi-Wall"

    if not _as_text(next_data.get("tecnologia")):
        if re.search(r"\binverter\b|\bwind[\s-]?free\b|\bdigital\s*inverter\b|\binv\b", ctx):
            next_data["tecnologia"] = "Inverter"
        elif re.search(r"\bon[-\s/]?off\b|\bconvencional\b|\bfixed[\s-]?speed\b", ctx):
            next_data["tecnologia"] = "On-Off"
        elif re.match(r"^AR\d{2}[TCVXH]", modelo):
            next_data["tecnologia"] = "Inverter"
        elif re.match(r"^PAC\d+I", modelo) or "IQ" in modelo:
            next_data["tecnologia"] = "Inverter"


def normalize_ac_technical_data(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Unifica aliases/nomes livres da IA nas chaves canônicas do formulário."""
    if not raw:
        return {}
    next_data: dict[str, Any] = {}
    for key, value in raw.items():
        text = _as_text(value)
        if text:
            next_data[str(key)] = text if not isinstance(value, (int, float, bool)) else value

    for alias, canonical in list(AC_TECHNICAL_KEY_ALIASES.items()):
        if alias not in next_data:
            continue
        alias_val = _as_text(next_data.get(alias))
        if not alias_val:
            next_data.pop(alias, None)
            continue
        if alias == "alimentacao" and canonical == "voltage" and _as_text(next_data.get("voltage")):
            continue
        canon_val = _as_text(next_data.get(canonical))
        value = _normalize_tecnologia(alias_val) if canonical == "tecnologia" else alias_val
        if not canon_val:
            next_data[canonical] = value
        if _as_text(next_data.get(canonical)):
            next_data.pop(alias, None)

    for key in list(next_data.keys()):
        canonical = _semantic_canonical(key)
        if not canonical or key == canonical:
            continue
        value = _as_text(next_data.get(key))
        if not value:
            next_data.pop(key, None)
            continue
        if not _as_text(next_data.get(canonical)):
            next_data[canonical] = (
                _normalize_tecnologia(value) if canonical == "tecnologia" else value
            )
        if _as_text(next_data.get(canonical)):
            next_data.pop(key, None)

    _apply_torque_flange_mapping(next_data)
    _apply_cable_derived_fields(next_data)

    if not _as_text(next_data.get("tecnologia")) and _as_text(next_data.get("frequencia")):
        next_data["tecnologia"] = _normalize_tecnologia(str(next_data["frequencia"]))
        next_data.pop("frequencia", None)
    elif _as_text(next_data.get("tecnologia")):
        next_data["tecnologia"] = _normalize_tecnologia(str(next_data["tecnologia"]))

    if not _as_text(next_data.get("tipo_equipamento")):
        inferred = _infer_tipo_equipamento(_as_text(next_data.get("tipo_instalacao")))
        if inferred:
            next_data["tipo_equipamento"] = inferred

    if not _as_text(next_data.get("voltage")) and _as_text(next_data.get("alimentacao")):
        next_data["voltage"] = next_data["alimentacao"]
        next_data.pop("alimentacao", None)

    _infer_from_model_and_context(next_data)
    return next_data
