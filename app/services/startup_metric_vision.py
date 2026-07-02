"""Extração de medições de startup (garantia) a partir de fotos de instrumentos."""

from __future__ import annotations

import re
from typing import Any

from app.services.equipment_label_vision import _extract_label_from_images

STARTUP_METRIC_PROMPTS: dict[str, str] = {
    "pressao_trabalho_psi": """Você é um técnico de HVAC analisando a foto de um manômetro (alta/baixa) ou visor digital durante o startup.
Leia APENAS a pressão de trabalho/carga exibida (em PSI ou bar).

Retorne SOMENTE um JSON válido (sem markdown):
{
  "extracted_value": "String numérica ou null (ex: 115, 120, 68)",
  "unidade": "psi|bar|kpa|null",
  "confianca": "alta|media|baixa"
}

Regras:
- Priorize leitura em PSI; se o visor mostrar apenas bar, converta para PSI (1 bar ≈ 14.5 PSI) ou retorne o valor em bar com unidade bar.
- Foque na pressão de carga/trabalho, não vácuo.
- Não invente valores que não apareçam na imagem.""",
    "tensao_volts": """Você é um técnico de HVAC analisando a foto de um multímetro ou pinça amperímetro medindo tensão elétrica.
Leia APENAS a tensão exibida (em volts V).

Retorne SOMENTE um JSON válido (sem markdown):
{
  "extracted_value": "String numérica ou null (ex: 220, 127, 380)",
  "unidade": "V|volts|null",
  "confianca": "alta|media|baixa"
}

Regras:
- Leia o valor principal no visor (CA/CC conforme indicado no aparelho).
- Não invente valores que não apareçam na imagem.""",
    "corrente_compressor_amperes": """Você é um técnico de HVAC analisando a foto de um multímetro, pinça amperímetro ou visor medindo corrente do compressor.
Leia APENAS a corrente elétrica exibida (em amperes A).

Retorne SOMENTE um JSON válido (sem markdown):
{
  "extracted_value": "String numérica ou null (ex: 4.2, 8.5, 12)",
  "unidade": "A|amperes|null",
  "confianca": "alta|media|baixa"
}

Regras:
- Use vírgula ou ponto decimal conforme o visor; normalize para formato decimal com ponto.
- Não invente valores que não apareçam na imagem.""",
    "temperatura_insuflamento_c": """Você é um técnico de HVAC analisando a foto de um termômetro infravermelho, termômetro de palheta ou sensor medindo temperatura de insuflamento (ar saindo).
Leia APENAS a temperatura exibida (em °C).

Retorne SOMENTE um JSON válido (sem markdown):
{
  "extracted_value": "String numérica ou null (ex: 12, 8.5, 15)",
  "unidade": "C|°C|null",
  "confianca": "alta|media|baixa"
}

Regras:
- Temperatura de insuflamento/ar de saída do evaporador.
- Não invente valores que não apareçam na imagem.""",
    "temperatura_retorno_c": """Você é um técnico de HVAC analisando a foto de um termômetro infravermelho, termômetro de palheta ou sensor medindo temperatura de retorno (ar entrando no evaporador).
Leia APENAS a temperatura exibida (em °C).

Retorne SOMENTE um JSON válido (sem markdown):
{
  "extracted_value": "String numérica ou null (ex: 24, 22, 26)",
  "unidade": "C|°C|null",
  "confianca": "alta|media|baixa"
}

Regras:
- Temperatura de retorno/ar de entrada no evaporador.
- Não invente valores que não apareçam na imagem.""",
}

VALID_STARTUP_METRIC_KEYS = frozenset(STARTUP_METRIC_PROMPTS.keys())


def _normalize_numeric_extraction(raw: dict[str, Any]) -> dict[str, str | None]:
    def s(key: str) -> str | None:
        val = raw.get(key)
        if val is None:
            return None
        text = str(val).strip()
        return text or None

    value = s("extracted_value")
    if value:
        digits = re.sub(r"[^\d.,\-]", "", value).replace(",", ".")
        try:
            num = float(digits)
            value = str(int(num)) if num == int(num) else str(round(num, 2))
        except ValueError:
            pass

    return {
        "extracted_value": value,
        "unidade": s("unidade"),
        "confianca": s("confianca"),
    }


async def extract_startup_metric_from_image(
    *,
    metric_key: str,
    image_bytes: bytes | None,
    image_content_type: str | None,
    image_filename: str | None,
    claude_api_key: str | None = None,
    claude_model: str | None = None,
) -> dict[str, str | None]:
    key = (metric_key or "").strip().lower()
    prompt = STARTUP_METRIC_PROMPTS.get(key)
    if not prompt:
        raise ValueError(f"Métrica de startup inválida: {metric_key}")

    empty_detail = "Envie a foto do instrumento de medição."
    return await _extract_label_from_images(
        prompt=prompt,
        normalize=_normalize_numeric_extraction,
        evaporator_bytes=image_bytes,
        evaporator_content_type=image_content_type,
        evaporator_filename=image_filename,
        condenser_bytes=None,
        condenser_content_type=None,
        condenser_filename=None,
        claude_api_key=claude_api_key,
        claude_model=claude_model,
        empty_detail=empty_detail,
    )
