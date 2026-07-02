"""Extração do valor de vácuo (microns) a partir de foto do manômetro/vacuômetro."""

from __future__ import annotations

import re
from typing import Any

from app.services.equipment_label_vision import _extract_label_from_images

VACUUM_EXTRACTION_PROMPT = """Você é um técnico de HVAC analisando a foto de um manômetro/vacuômetro digital ou analógico durante o vácuo da linha.
Leia APENAS o valor de vácuo final ou atual exibido no aparelho (em microns, micra ou µ).

Retorne SOMENTE um JSON válido (sem markdown):
{
  "vacuo_final_microns": "String numérica ou null (ex: 250, 300, 450)",
  "unidade": "microns|micra|µ|mbar|inHg|null",
  "confianca": "alta|media|baixa"
}

Regras:
- Priorize leitura em microns/micra/µ.
- Se o visor mostrar apenas mbar ou inHg, converta mentalmente para microns quando possível ou retorne null.
- Não invente valores que não apareçam na imagem.
- Ignore pressão positiva de carga; foque no vácuo (valores típicos 100–1000 µ)."""


def _normalize_vacuum_extraction(raw: dict[str, Any]) -> dict[str, str | None]:
    def s(key: str) -> str | None:
        val = raw.get(key)
        if val is None:
            return None
        text = str(val).strip()
        return text or None

    microns = s("vacuo_final_microns")
    if microns:
        digits = re.sub(r"[^\d.,]", "", microns).replace(",", ".")
        try:
            num = float(digits)
            if num > 0:
                microns = str(int(num)) if num == int(num) else str(num)
        except ValueError:
            pass

    return {
        "vacuo_final_microns": microns,
        "unidade": s("unidade"),
        "confianca": s("confianca"),
    }


async def extract_vacuum_gauge_from_image(
    *,
    image_bytes: bytes | None,
    image_content_type: str | None,
    image_filename: str | None,
    claude_api_key: str | None = None,
    claude_model: str | None = None,
) -> dict[str, str | None]:
    return await _extract_label_from_images(
        prompt=VACUUM_EXTRACTION_PROMPT,
        normalize=_normalize_vacuum_extraction,
        evaporator_bytes=image_bytes,
        evaporator_content_type=image_content_type,
        evaporator_filename=image_filename,
        condenser_bytes=None,
        condenser_content_type=None,
        condenser_filename=None,
        claude_api_key=claude_api_key,
        claude_model=claude_model,
        empty_detail="Envie a foto do manômetro/vacuômetro.",
    )
