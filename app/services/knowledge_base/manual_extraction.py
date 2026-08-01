"""Extração estruturada (via IA) de dados de equipamentos e códigos de erro a partir de manuais técnicos.

Complementa a indexação RAG (`ingestion.py`, usada pela Iris para responder perguntas livres):
aqui o objetivo é obter um JSON estruturado para (1) pré-preencher o cadastro de modelos no
catálogo (marca, modelo, capacidade, tensão, fluido, especificações técnicas — o máximo possível
que o manual permitir) e (2) alimentar uma tabela de códigos de erro/falha para consulta rápida
e confiável da Iris em campo, sem depender apenas de busca semântica por chunks.

Fluxo: download do PDF no S3 → extração de texto (PyMuPDF, reaproveitado de `pdf_extract.py`) →
lote(s) de texto → chamada à Claude por lote com um prompt de extração → merge programático dos
lotes → persistência em `EquipmentManual.extraction_result` + `EquipmentManualErrorCode`.

A extração é sempre uma *sugestão*: a criação de itens no catálogo exige confirmação humana
(tela de revisão no admin), evitando duplicados/erros de OCR indo direto para produção.
"""

from __future__ import annotations

import concurrent.futures
import json
import logging
import re
import ssl
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import (
    MANUAL_EXTRACTION_CHARS_PER_BATCH,
    MANUAL_EXTRACTION_MAX_BATCHES,
    MANUAL_EXTRACTION_MAX_OUTPUT_TOKENS,
    MANUAL_EXTRACTION_MODEL,
    MANUAL_EXTRACTION_WEB_ENRICHMENT_ENABLED,
    MANUAL_EXTRACTION_WEB_ENRICHMENT_MAX_ITEMS,
    MANUAL_EXTRACTION_WEB_ENRICHMENT_MAX_SEARCHES_PER_ITEM,
)
from app.platform_credentials import resolve_claude_api_key, resolve_claude_model
from app.services.knowledge_base.pdf_extract import extract_pdf_pages
from app.services.s3 import download_manual_pdf_bytes
from models import EquipmentManual, EquipmentManualErrorCode, ManualExtractionStatus

logger = logging.getLogger("erp.knowledge_base.manual_extraction")

_extraction_lock = threading.Lock()
_active_extractions: set[str] = set()

_SYSTEM_PROMPT = """Você é um engenheiro especialista em HVAC-R (ar-condicionado, climatizadores evaporativos, \
refrigeração comercial) lendo manuais técnicos (instalação, usuário e/ou serviço) para alimentar:
1) o catálogo de equipamentos de uma empresa de manutenção (Climaris);
2) a Iris, assistente de IA que ajuda técnicos em campo.

Extraia o MÁXIMO de informação útil e verificável do texto fornecido. Retorne SOMENTE um JSON \
válido (sem markdown, sem texto fora do JSON), seguindo EXATAMENTE este formato:

{
  "documento": {
    "tipo_manual": "instalacao|usuario|servico|combinado|datasheet|desconhecido",
    "resumo": "resumo de 1-2 frases do que o documento cobre"
  },
  "equipamentos": [
    {
      "marca": "string ou null",
      "modelo": "nome/código comercial único (se não houver evap/cond separados) ou null",
      "modelo_evaporadora": "código da unidade interna, ou null se não for split",
      "modelo_condensadora": "código da unidade externa, ou null se não for split",
      "categoria_sugerida": "ar_condicionado|climatizador|geladeira|freezer|camara_fria|outro",
      "component_type_sugerido": "UNICO|EVAPORADORA_CONDENSADORA",
      "capacidade": "ex: 9000 BTUs, 60000 m³/h — com unidade",
      "fluido_refrigerante": "ex: R-410A, R-32, R-22 ou null",
      "tensao": "ex: 220V, 220V/380V ou null",
      "tecnologia": "Inverter|On-Off ou null",
      "especificacoes_tecnicas": {
        "chave_livre_em_snake_case": "valor com unidade quando aplicável — inclua TUDO que encontrar. \
Prefira estas chaves canônicas quando existirem no texto: \
corrente_nominal_a, potencia_nominal_w, disjuntor_recomendado_a, bitola_minima_mm2, \
cabo_alimentacao, cabo_interligacao, cabo_comunicacao, \
diametro_tubo_liquido, diametro_tubo_gas, comprimento_maximo_tubulacao_m, \
comprimento_minimo_tubo_m, altura_maxima_desnivel_m, carga_refrigerante_fabrica_kg, \
adicao_carga_gas_por_metro, isolamento_termico_minimo_mm, torque_liquido_nm, torque_gas_nm, \
pressao_teste_estanqueidade_psi, vacuo_especificado_umhg, \
dimensoes_interna_mm, dimensoes_externa_mm, peso_interna_kg, peso_externa_kg, \
volume_ventilacao_m3_h, nivel_ruido_evaporadora_db, nivel_ruido_condensadora_db, \
grau_protecao_ip, altura_instalacao_minima_m, distancia_minima_parede_mm, \
diametro_furo_parede_mm, comprimento_maximo_mangueira_drenagem_m. \
Também inclua demais dados encontrados (COP/EER, pressões, faixa de temperatura, etc.). \
Use apenas o que estiver no texto — não invente."
      },
      "confianca": "alta|media|baixa",
      "paginas_origem": [1, 2]
    }
  ],
  "codigos_erro": [
    {
      "codigo": "ex: E1, F5, P0, Er3 — como aparece no manual",
      "titulo": "nome curto da falha",
      "descricao": "o que o código indica",
      "causa_provavel": "causa(s) mais provável(is) ou null",
      "acao_recomendada": "o que o técnico deve verificar/fazer ou null",
      "pagina_origem": 12
    }
  ],
  "avisos": ["limitações da extração deste trecho, ex: 'tabela de códigos pode estar incompleta'"]
}

Regras importantes:
- Não invente dados que não estejam no texto. Use null quando não encontrar.
- Se o manual descrever múltiplos modelos (ex: "Manual unificado" com vários códigos), gere UM item \
em "equipamentos" para cada modelo distinto encontrado.
- Se não for possível distinguir evaporadora/condensadora, use apenas "modelo".
- "especificacoes_tecnicas" deve ter chaves em snake_case, minúsculas, sem acento.
- Se o trecho não tiver equipamentos ou códigos de erro identificáveis, retorne listas vazias.
- Nunca escreva texto fora do JSON."""


@dataclass
class ManualExtractionResult:
    documento: dict[str, Any] = field(default_factory=dict)
    equipamentos: list[dict[str, Any]] = field(default_factory=list)
    codigos_erro: list[dict[str, Any]] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)
    model_used: str = ""
    batches: int = 0
    text_chars: int = 0


def _split_text_into_batches(text: str, *, max_chars: int, max_batches: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    batches: list[str] = []
    start = 0
    length = len(text)
    while start < length and len(batches) < max_batches:
        end = min(start + max_chars, length)
        if end < length:
            # evita cortar no meio de uma palavra/linha
            newline = text.rfind("\n", start + int(max_chars * 0.6), end)
            if newline > start:
                end = newline
        batches.append(text[start:end])
        start = end
    return batches


def _extract_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    candidates = [cleaned]
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match and match.group(0) != cleaned:
        candidates.append(match.group(0))

    last_exc: Exception | None = None
    for candidate in candidates:
        # strict=False: aceita caracteres de controle "crus" (ex: quebra de linha literal)
        # dentro de strings — o modelo às vezes gera descrições multi-linha sem escapar \n,
        # o que quebra o parser estrito do json padrão mas é seguro de aceitar aqui.
        for strict in (True, False):
            try:
                parsed = json.loads(candidate, strict=strict)
            except json.JSONDecodeError as exc:
                last_exc = exc
                continue
            if isinstance(parsed, dict):
                return parsed
            last_exc = ValueError("JSON retornado deve ser um objeto.")

    # Tenta reparar a partir do texto "cru" (cleaned), não do candidato recortado pela regex
    # acima: aquele corta agressivamente até o ÚLTIMO "}" do texto inteiro, o que descarta
    # dados válidos quando a resposta foi cortada no meio de uma chave/objeto (max_tokens).
    # O reparo por profundidade de chaves encontra um ponto de corte seguro mais tardio.
    for candidate in (cleaned, candidates[-1]):
        repaired = _repair_truncated_json(candidate)
        if repaired is not None:
            return repaired

    raise ValueError(f"Resposta da IA não contém JSON válido ({last_exc}).") from last_exc


def _repair_truncated_json(text: str) -> dict[str, Any] | None:
    """Recuperação best-effort para JSON cortado no limite de max_tokens.

    Localiza o último ponto "seguro" (fim de um item de lista/objeto já completo, fora de
    uma string) e fecha as chaves/colchetes ainda abertos até ali — assim aproveitamos os
    equipamentos/códigos de erro já extraídos em vez de descartar o lote inteiro.
    """
    stack: list[str] = []
    in_string = False
    escape = False
    last_safe_cut: int | None = None
    for i, ch in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            continue
        if ch in "{[":
            stack.append(ch)
        elif ch in "}]":
            if stack:
                stack.pop()
            last_safe_cut = i + 1
    if last_safe_cut is None or last_safe_cut >= len(text):
        return None

    truncated = text[:last_safe_cut].rstrip()
    if truncated.endswith(","):
        truncated = truncated[:-1]

    depth: list[str] = []
    in_string = False
    escape = False
    for ch in truncated:
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            continue
        if ch in "{[":
            depth.append(ch)
        elif ch in "}]":
            if depth:
                depth.pop()

    closers = {"{": "}", "[": "]"}
    candidate = truncated + "".join(closers[c] for c in reversed(depth))
    try:
        parsed = json.loads(candidate, strict=False)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _call_claude_extraction(*, api_key: str, model: str, user_message: str) -> dict[str, Any]:
    payload = {
        "model": model,
        "max_tokens": MANUAL_EXTRACTION_MAX_OUTPUT_TOKENS,
        "temperature": 0,
        "system": _SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_message}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=240) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.warning("manual_extraction_http_error status=%s body=%s", exc.code, body[:800])
        raise RuntimeError(f"Falha ao consultar a IA (HTTP {exc.code}).") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError("Não foi possível conectar à API de IA.") from exc

    parts = [b.get("text", "") for b in data.get("content") or [] if isinstance(b, dict) and b.get("type") == "text"]
    joined = "\n".join(parts).strip()
    if not joined:
        raise RuntimeError("Resposta vazia da IA.")
    stop_reason = data.get("stop_reason")
    try:
        parsed = _extract_json_object(joined)
    except ValueError:
        logger.warning(
            "manual_extraction_json_parse_failed stop_reason=%s len=%s tail=%r",
            stop_reason,
            len(joined),
            joined[-500:],
        )
        raise
    if stop_reason == "max_tokens":
        avisos = parsed.setdefault("avisos", [])
        if isinstance(avisos, list):
            avisos.append(
                "Resposta da IA foi cortada por limite de tamanho — parte do trecho pode não "
                "ter sido analisada. Alguns equipamentos/códigos podem estar faltando ou incompletos."
            )
        logger.warning("manual_extraction_max_tokens_truncated len=%s", len(joined))
    return parsed


_ENRICHMENT_SYSTEM_PROMPT = """Você pesquisa na internet, em sites OFICIAIS de fabricantes de HVAC-R \
(ex: samsung.com, lg.com, electrolux.com.br, midea.com, gree.com, philco.com.br, springer.com.br, \
carrier.com.br, daikin.com.br, elgin.com.br etc.), a nomenclatura comercial completa e especificações \
de um equipamento a partir de um código parcial extraído de um manual técnico (manuais geralmente \
trazem só o código-base, sem o sufixo completo de linha/cor/região que aparece no site oficial).

Retorne SOMENTE um JSON válido (sem markdown, sem texto fora do JSON) neste formato:
{
  "modelo_completo": "código comercial completo do equipamento (preencha sempre que encontrar, mesmo se o equipamento tiver unidades evaporadora e condensadora — nesse caso é o código único da linha) — ou null",
  "modelo_evaporadora_completo": "preencha SÓ se a evaporadora tiver um código comercial PRÓPRIO e diferente do 'modelo_completo' (splits com peças vendidas separadamente) — ou null",
  "modelo_condensadora_completo": "preencha SÓ se a condensadora tiver um código comercial PRÓPRIO e diferente do 'modelo_completo' (splits com peças vendidas separadamente) — ou null",
  "capacidade": "ex: 9000 BTU/h — só se encontrar oficialmente, ou null",
  "fluido_refrigerante": "ex: R-32 — só se encontrar oficialmente, ou null",
  "tensao": "ex: 220V — só se encontrar oficialmente, ou null",
  "tecnologia": "Inverter|On-Off — OBRIGATÓRIO quando a página oficial indicar (Digital Inverter, WindFree, Inverter, On-Off/Fixed) — ou null",
  "tipo_equipamento": "Hi-Wall|Piso Teto|Cassete|Duto|Janela|Chiller|VRF|Outro — OBRIGATÓRIO quando a página indicar (split hi-wall, wall-mounted, etc.) — ou null",
  "fonte_url": "URL da página oficial do fabricante usada como fonte, ou null",
  "confianca": "alta|media|baixa"
}

Regras importantes:
- Preencha um campo somente se tiver certeza razoável, baseado numa fonte OFICIAL do fabricante \
(não use lojas, marketplaces, blogs ou fóruns como fonte).
- Sempre tente obter "tecnologia" e "tipo_equipamento" — são fundamentais para o cadastro.
- "fonte_url" deve apontar para o domínio oficial do fabricante.
- Nunca invente. Se a busca não encontrar informação confiável para um campo, retorne null nesse campo.
- Se não encontrar nada confiável, retorne todos os campos como null e "confianca": "baixa".
- Nunca escreva texto fora do JSON."""


def _needs_web_enrichment(item: dict[str, Any]) -> bool:
    """Decide se vale a pena gastar uma busca web para completar este equipamento.

    Critério: falta marca não dá pra buscar; caso contrário, dispara quando falta uma spec
    básica (capacidade/fluido/tecnologia/tipo), a confiança da extração do manual é baixa, ou o código do
    modelo parece parcial (curto demais para ser a nomenclatura comercial completa).
    """
    if not (item.get("marca") or "").strip():
        return False
    if not item.get("capacidade"):
        return True
    if not item.get("fluido_refrigerante"):
        return True
    if not item.get("tecnologia"):
        return True
    specs = item.get("especificacoes_tecnicas") if isinstance(item.get("especificacoes_tecnicas"), dict) else {}
    if not item.get("tecnologia") and not (specs or {}).get("tecnologia"):
        return True
    if not (specs or {}).get("tipo_equipamento") and not item.get("tipo_equipamento"):
        # tipo pode vir só nas specs livres
        return True
    if (item.get("confianca") or "").strip().lower() == "baixa":
        return True
    for key in ("modelo", "modelo_evaporadora", "modelo_condensadora"):
        val = (item.get(key) or "").strip()
        if val and len(val) <= 9:
            return True
    return False


def _call_claude_web_enrichment(*, api_key: str, model: str, item: dict[str, Any]) -> dict[str, Any] | None:
    marca = (item.get("marca") or "").strip()
    if not marca:
        return None
    codigo = " / ".join(
        p for p in (item.get("modelo"), item.get("modelo_evaporadora"), item.get("modelo_condensadora")) if p
    ) or "(código não identificado no manual)"
    categoria = item.get("categoria_sugerida") or "ar-condicionado"
    specs = item.get("especificacoes_tecnicas") if isinstance(item.get("especificacoes_tecnicas"), dict) else {}
    faltando = [
        label
        for key, label in (
            ("capacidade", "capacidade (BTU/h)"),
            ("fluido_refrigerante", "fluido refrigerante"),
            ("tensao", "tensão"),
            ("tecnologia", "tecnologia (Inverter ou On-Off)"),
        )
        if not item.get(key)
    ]
    if not (specs or {}).get("tipo_equipamento") and not item.get("tipo_equipamento"):
        faltando.append("tipo de equipamento (Hi-Wall, Cassete, Piso Teto, etc.)")
    # Sempre reforça tecnologia/tipo mesmo se já listados — a página oficial costuma ter
    if "tecnologia (Inverter ou On-Off)" not in faltando:
        faltando.append("tecnologia (Inverter ou On-Off) — confirme na página")
    if "tipo de equipamento (Hi-Wall, Cassete, Piso Teto, etc.)" not in faltando:
        faltando.append("tipo de equipamento (Hi-Wall, Cassete, Piso Teto, etc.) — confirme na página")
    user_message = (
        f"Equipamento: {categoria}, marca {marca}, código parcial extraído do manual técnico: {codigo}.\n"
        "Busque no site oficial do fabricante a nomenclatura comercial completa deste modelo"
        + (f" e as seguintes especificações: {', '.join(faltando)}." if faltando else ".")
    )

    payload = {
        "model": model,
        "max_tokens": 2048,
        "temperature": 0,
        "system": _ENRICHMENT_SYSTEM_PROMPT,
        "tools": [
            {
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": MANUAL_EXTRACTION_WEB_ENRICHMENT_MAX_SEARCHES_PER_ITEM,
            }
        ],
        "messages": [{"role": "user", "content": user_message}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.warning("manual_extraction_web_enrichment_http_error status=%s body=%s", exc.code, body[:500])
        return None
    except urllib.error.URLError as exc:
        logger.warning("manual_extraction_web_enrichment_network_error error=%r", exc)
        return None

    parts = [b.get("text", "") for b in data.get("content") or [] if isinstance(b, dict) and b.get("type") == "text"]
    joined = "\n".join(parts).strip()
    if not joined:
        return None
    try:
        return _extract_json_object(joined)
    except ValueError:
        logger.warning("manual_extraction_web_enrichment_json_parse_failed tail=%r", joined[-300:])
        return None


def _apply_enrichment(item: dict[str, Any], enrichment: dict[str, Any]) -> str | None:
    """Mescla os dados achados via busca web no item, só preenchendo o que faltava.

    Retorna uma mensagem de aviso resumindo o que mudou (para o admin revisar), ou None se a
    busca não trouxe nada aproveitável.
    """
    changed: list[str] = []
    specs = item.setdefault("especificacoes_tecnicas", {}) or {}
    item["especificacoes_tecnicas"] = specs

    modelo_completo = (enrichment.get("modelo_completo") or "").strip()
    evap_completo = (enrichment.get("modelo_evaporadora_completo") or "").strip()
    cond_completo = (enrichment.get("modelo_condensadora_completo") or "").strip()
    evap_short = (item.get("modelo_evaporadora") or "").strip()
    cond_short = (item.get("modelo_condensadora") or "").strip()

    if modelo_completo and not evap_short and not cond_short:
        item["modelo"] = modelo_completo
        specs["modelo_comercial_completo"] = modelo_completo
        changed.append(f"modelo completo: {modelo_completo}")
    elif modelo_completo and evap_short and evap_short == cond_short:
        # High-wall/piso-teto etc.: o mesmo código físico aparece duplicado nos campos
        # evaporadora/condensadora — o "modelo_completo" único encontrado vale para os dois.
        item["modelo_evaporadora"] = modelo_completo
        item["modelo_condensadora"] = modelo_completo
        specs["modelo_comercial_completo"] = modelo_completo
        changed.append(f"modelo completo: {modelo_completo}")
    if evap_completo and evap_short and evap_completo != modelo_completo:
        item["modelo_evaporadora"] = evap_completo
        specs["modelo_evaporadora_completo"] = evap_completo
        changed.append(f"evaporadora: {evap_completo}")
    if cond_completo and cond_short and cond_completo != modelo_completo:
        item["modelo_condensadora"] = cond_completo
        specs["modelo_condensadora_completo"] = cond_completo
        changed.append(f"condensadora: {cond_completo}")

    for key, label in (
        ("capacidade", "capacidade"),
        ("fluido_refrigerante", "fluido"),
        ("tensao", "tensão"),
        ("tecnologia", "tecnologia"),
    ):
        if not item.get(key) and enrichment.get(key):
            item[key] = enrichment[key]
            changed.append(f"{label}: {enrichment[key]}")

    tipo_eq = (enrichment.get("tipo_equipamento") or "").strip()
    if tipo_eq and not (specs.get("tipo_equipamento") or "").strip():
        specs["tipo_equipamento"] = tipo_eq
        changed.append(f"tipo: {tipo_eq}")

    tech = (enrichment.get("tecnologia") or item.get("tecnologia") or "").strip()
    if tech and not (specs.get("tecnologia") or "").strip():
        specs["tecnologia"] = tech

    fonte = (enrichment.get("fonte_url") or "").strip()
    if fonte:
        specs["fonte_pesquisa_web"] = fonte

    if not changed:
        return None
    marca = item.get("marca") or ""
    modelo_label = item.get("modelo") or item.get("modelo_evaporadora") or "?"
    fonte_txt = f" (fonte: {fonte})" if fonte else ""
    return f"{marca} {modelo_label}: {', '.join(changed)} — completado via busca no site oficial{fonte_txt}."


def _enrich_equipamentos_via_web(
    equipamentos: list[dict[str, Any]], *, api_key: str, model: str
) -> list[str]:
    """Completa nomenclatura/specs incompletas buscando nos sites oficiais dos fabricantes.

    Roda em paralelo (thread pool) porque cada busca é uma chamada de rede independente à
    Claude — sequencial poderia levar minutos em manuais com muitos modelos incompletos.
    """
    avisos: list[str] = []
    if not MANUAL_EXTRACTION_WEB_ENRICHMENT_ENABLED or MANUAL_EXTRACTION_WEB_ENRICHMENT_MAX_ITEMS <= 0:
        return avisos

    candidates = [item for item in equipamentos if _needs_web_enrichment(item)]
    if not candidates:
        return avisos
    selected = candidates[:MANUAL_EXTRACTION_WEB_ENRICHMENT_MAX_ITEMS]
    if len(candidates) > len(selected):
        avisos.append(
            "Limite de buscas em sites oficiais atingido neste manual — alguns equipamentos "
            "podem continuar com nomenclatura/specs incompletas."
        )

    def _run(item: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None]:
        try:
            return item, _call_claude_web_enrichment(api_key=api_key, model=model, item=item)
        except Exception:
            logger.exception(
                "manual_extraction_web_enrichment_item_failed item=%s",
                item.get("modelo") or item.get("modelo_evaporadora"),
            )
            return item, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(selected))) as pool:
        for item, enrichment in pool.map(_run, selected):
            if not enrichment:
                continue
            note = _apply_enrichment(item, enrichment)
            if note:
                avisos.append(note)
    return avisos


def _norm_key(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _merge_equipamentos(batches: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    merged: dict[tuple[str, str, str], dict[str, Any]] = {}
    order: list[tuple[str, str, str]] = []
    for batch in batches:
        for item in batch:
            if not isinstance(item, dict):
                continue
            key = (
                _norm_key(item.get("marca")),
                _norm_key(item.get("modelo")),
                _norm_key(item.get("modelo_evaporadora")) + "|" + _norm_key(item.get("modelo_condensadora")),
            )
            if key == ("", "", "|"):
                continue
            if key not in merged:
                merged[key] = dict(item)
                order.append(key)
                continue
            existing = merged[key]
            for field_name, value in item.items():
                if field_name == "especificacoes_tecnicas":
                    continue
                if not existing.get(field_name) and value:
                    existing[field_name] = value
            spec_existing = dict(existing.get("especificacoes_tecnicas") or {})
            for spec_key, spec_val in (item.get("especificacoes_tecnicas") or {}).items():
                spec_existing.setdefault(spec_key, spec_val)
            existing["especificacoes_tecnicas"] = spec_existing
            pages_existing = set(existing.get("paginas_origem") or [])
            pages_existing.update(item.get("paginas_origem") or [])
            existing["paginas_origem"] = sorted(pages_existing)

    result = [merged[key] for key in order]
    for item in result:
        _fill_unified_modelo(item)
    return result


def _fill_unified_modelo(item: dict[str, Any]) -> None:
    """Preenche o campo único "modelo" quando evaporadora/condensadora saíram com o mesmo código.

    A IA às vezes duplica o único código comercial encontrado nos dois campos de split em vez de
    reconhecer que é uma unidade única (ex: high-wall) — sem isso o campo "modelo" fica vazio e o
    cadastro no catálogo perde a nomenclatura no campo principal.
    """
    if item.get("modelo"):
        return
    evap = (item.get("modelo_evaporadora") or "").strip()
    cond = (item.get("modelo_condensadora") or "").strip()
    if evap and evap == cond:
        item["modelo"] = evap


def _merge_codigos_erro(batches: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for batch in batches:
        for item in batch:
            if not isinstance(item, dict):
                continue
            code = _norm_key(item.get("codigo"))
            if not code:
                continue
            if code not in merged:
                merged[code] = dict(item)
                order.append(code)
                continue
            existing = merged[code]
            for field_name in ("titulo", "descricao", "causa_provavel", "acao_recomendada", "pagina_origem"):
                new_val = item.get(field_name)
                old_val = existing.get(field_name)
                if new_val and (not old_val or len(str(new_val)) > len(str(old_val))):
                    existing[field_name] = new_val
    return [merged[code] for code in order]


def run_manual_extraction(pdf_text: str, *, api_key: str, model: str) -> ManualExtractionResult:
    """Executa a extração (com batching se necessário) sobre o texto já extraído do PDF."""
    if not pdf_text.strip():
        raise ValueError("Manual sem texto extraível.")

    text_batches = _split_text_into_batches(
        pdf_text,
        max_chars=MANUAL_EXTRACTION_CHARS_PER_BATCH,
        max_batches=MANUAL_EXTRACTION_MAX_BATCHES,
    )

    documento: dict[str, Any] = {}
    equipamentos_batches: list[list[dict[str, Any]]] = []
    codigos_batches: list[list[dict[str, Any]]] = []
    avisos: list[str] = []
    total_batches = len(text_batches)
    if len(pdf_text) > MANUAL_EXTRACTION_CHARS_PER_BATCH * MANUAL_EXTRACTION_MAX_BATCHES:
        avisos.append(
            "Manual muito extenso — apenas parte do conteúdo foi analisada pela IA. "
            "Revise os dados manualmente."
        )

    for idx, batch_text in enumerate(text_batches, start=1):
        prefix = ""
        if total_batches > 1:
            prefix = f"[Trecho {idx} de {total_batches} do manual]\n\n"
        user_message = f"{prefix}Texto extraído do manual técnico:\n\n{batch_text}"
        try:
            parsed = _call_claude_extraction(api_key=api_key, model=model, user_message=user_message)
        except Exception as exc:
            logger.warning(
                "manual_extraction_batch_failed batch=%s/%s error=%r", idx, total_batches, exc
            )
            avisos.append(f"Falha ao processar trecho {idx}/{total_batches}: {exc}")
            continue
        if not documento and isinstance(parsed.get("documento"), dict):
            documento = parsed["documento"]
        equipamentos_batches.append(
            [e for e in (parsed.get("equipamentos") or []) if isinstance(e, dict)]
        )
        codigos_batches.append(
            [c for c in (parsed.get("codigos_erro") or []) if isinstance(c, dict)]
        )
        avisos.extend(str(a) for a in (parsed.get("avisos") or []) if a)

    equipamentos = _merge_equipamentos(equipamentos_batches)
    codigos_erro = _merge_codigos_erro(codigos_batches)

    if not equipamentos and not codigos_erro:
        raise RuntimeError(
            "A IA não conseguiu identificar equipamentos nem códigos de erro neste manual."
        )

    if equipamentos:
        try:
            avisos.extend(_enrich_equipamentos_via_web(equipamentos, api_key=api_key, model=model))
        except Exception:
            logger.exception("manual_extraction_web_enrichment_failed")

    return ManualExtractionResult(
        documento=documento,
        equipamentos=equipamentos,
        codigos_erro=codigos_erro,
        avisos=avisos,
        model_used=model,
        batches=total_batches,
        text_chars=len(pdf_text),
    )


def _persist_error_codes(db: Session, *, manual_id, tenant_id: int, codigos_erro: list[dict[str, Any]]) -> int:
    db.execute(
        delete(EquipmentManualErrorCode).where(
            EquipmentManualErrorCode.manual_id == manual_id,
            EquipmentManualErrorCode.tenant_id == tenant_id,
        )
    )
    saved = 0
    for item in codigos_erro:
        code = str(item.get("codigo") or "").strip()
        if not code:
            continue
        pagina = item.get("pagina_origem")
        try:
            pagina_int = int(pagina) if pagina is not None else None
        except (TypeError, ValueError):
            pagina_int = None
        db.add(
            EquipmentManualErrorCode(
                tenant_id=tenant_id,
                manual_id=manual_id,
                code=code[:40],
                title=str(item.get("titulo") or "").strip()[:200],
                description=str(item.get("descricao") or "").strip(),
                probable_cause=(str(item.get("causa_provavel")).strip() if item.get("causa_provavel") else None),
                recommended_action=(
                    str(item.get("acao_recomendada")).strip() if item.get("acao_recomendada") else None
                ),
                pagina_origem=pagina_int,
            )
        )
        saved += 1
    return saved


def extract_manual_structured_data(
    db: Session,
    *,
    manual_id,
    tenant_id: int,
) -> EquipmentManual:
    """Baixa o PDF, extrai texto, chama a IA e persiste o resultado no manual + códigos de erro.

    Observação: o endpoint que dispara a extração já marca `extraction_status = PROCESSING`
    antes de agendar esta função em background (para o polling do frontend refletir o estado
    imediatamente) — por isso NÃO reaproveitamos esse campo aqui para decidir se já há uma
    extração em andamento. A proteção contra execução concorrente para o mesmo manual é feita
    por `_active_extractions` em `schedule_manual_extraction`.
    """
    manual = db.execute(
        select(EquipmentManual).where(
            EquipmentManual.id == manual_id,
            EquipmentManual.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if manual is None:
        raise ValueError("Manual não encontrado.")

    manual.extraction_status = ManualExtractionStatus.PROCESSING.value
    manual.extraction_error = None
    db.flush()

    try:
        api_key = resolve_claude_api_key(db)
        if not api_key:
            raise RuntimeError(
                "Chave da API Claude não configurada. Configure em Operação → Chaves APIs."
            )
        model = resolve_claude_model(db) or MANUAL_EXTRACTION_MODEL

        pdf_bytes = download_manual_pdf_bytes(manual.s3_url, db=db)
        pages = extract_pdf_pages(pdf_bytes)
        full_text = "\n\n".join(f"[Página {p.page_num}]\n{p.text}" for p in pages)

        result = run_manual_extraction(full_text, api_key=api_key, model=model)

        error_codes_saved = _persist_error_codes(
            db, manual_id=manual_id, tenant_id=tenant_id, codigos_erro=result.codigos_erro
        )

        manual.extraction_result = {
            "documento": result.documento,
            "equipamentos": result.equipamentos,
            "avisos": result.avisos,
            "model_used": result.model_used,
            "batches": result.batches,
            "text_chars": result.text_chars,
            "error_codes_count": error_codes_saved,
        }
        manual.extraction_status = ManualExtractionStatus.READY.value
        manual.extraction_error = None
        manual.extracted_at = datetime.now(timezone.utc)
        db.flush()
        logger.info(
            "manual_extraction_ready manual_id=%s tenant_id=%s equipamentos=%s codigos_erro=%s batches=%s",
            manual_id,
            tenant_id,
            len(result.equipamentos),
            error_codes_saved,
            result.batches,
        )
        return manual
    except Exception as exc:
        db.rollback()
        manual.extraction_status = ManualExtractionStatus.FAILED.value
        manual.extraction_error = str(exc)[:2000]
        # commit imediato: o chamador (`schedule_manual_extraction._run`) também faz
        # rollback em caso de exceção, o que apagaria este status se fosse só flush().
        db.commit()
        logger.exception("manual_extraction_failed manual_id=%s", manual_id)
        raise


def schedule_manual_extraction(*, manual_id, tenant_id: int) -> bool:
    """Roda a extração em background (mesmo padrão de `schedule_manual_ingestion`)."""
    key = str(manual_id)
    with _extraction_lock:
        if key in _active_extractions:
            return False
        _active_extractions.add(key)

    def _run() -> None:
        from app.database import SessionLocal

        db = SessionLocal()
        try:
            extract_manual_structured_data(db, manual_id=manual_id, tenant_id=tenant_id)
            db.commit()
        except Exception:
            # `extract_manual_structured_data` já persiste (commit) o status FAILED antes de
            # relançar a exceção — aqui só evitamos deixar a sessão em estado inconsistente.
            db.rollback()
            logger.exception("manual_extraction_background_thread_failed manual_id=%s", manual_id)
        finally:
            db.close()
            with _extraction_lock:
                _active_extractions.discard(key)

    threading.Thread(target=_run, daemon=True, name=f"kb-extract-{key[:8]}").start()
    return True
