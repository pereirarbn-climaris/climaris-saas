"""Mensagens amigáveis para falhas de envio WhatsApp (Evolution API)."""

from __future__ import annotations

import json
import re

_WHATSAPP_TEMPLATE_LABELS: dict[str, str] = {
    "appointment_reminder": "lembrete de agendamento",
    "preventive_maintenance": "lembrete de manutenção preventiva",
    "broadcast_campaign": "campanha",
    "campaign_media": "campanha com mídia",
}


def whatsapp_template_label(template_key: str | None) -> str:
    key = (template_key or "mensagem").strip()
    if key in _WHATSAPP_TEMPLATE_LABELS:
        return _WHATSAPP_TEMPLATE_LABELS[key]
    if key.startswith("appointment_reminder"):
        return "lembrete de agendamento"
    return key.replace("_", " ")


def _format_br_phone(digits: str) -> str:
    cleaned = re.sub(r"\D", "", digits or "")
    if len(cleaned) == 13 and cleaned.startswith("55"):
        return f"({cleaned[2:4]}) {cleaned[4:9]}-{cleaned[9:]}"
    if len(cleaned) == 11:
        return f"({cleaned[0:2]}) {cleaned[2:7]}-{cleaned[7:]}"
    if len(cleaned) == 10:
        return f"({cleaned[0:2]}) {cleaned[2:6]}-{cleaned[6:]}"
    return cleaned or digits


def _extract_whatsapp_number(raw: str) -> str | None:
    match = re.search(r'"number"\s*:\s*"(\d+)"', raw)
    if match:
        return _format_br_phone(match.group(1))
    match = re.search(r"\b(55\d{10,11})\b", raw)
    if match:
        return _format_br_phone(match.group(1))
    match = re.search(r"para (\d{10,13})", raw, flags=re.IGNORECASE)
    if match:
        return _format_br_phone(match.group(1))
    return None


def humanize_whatsapp_send_error(raw: str | None) -> str:
    text = (raw or "").strip()
    if not text:
        return "Erro desconhecido ao enviar a mensagem."

    lowered = text.lower()
    if "exists" in lowered and "false" in lowered:
        number = _extract_whatsapp_number(text)
        if number:
            return (
                f"O número {number} não está cadastrado no WhatsApp. "
                "Confira o WhatsApp do cliente no cadastro e tente novamente."
            )
        return (
            "O número do cliente não está cadastrado no WhatsApp. "
            "Confira o cadastro e tente novamente."
        )

    if "sem conexão com evolution api" in lowered:
        return (
            "Sem conexão com o servidor WhatsApp. "
            "Verifique se a instância está conectada em Integrações → WhatsApp."
        )

    if "não configurad" in lowered:
        return "WhatsApp não configurado. Conecte a instância em Integrações → WhatsApp."

    if "evolution api retornou http 400" in lowered or "bad request" in lowered:
        number = _extract_whatsapp_number(text)
        if number:
            return (
                f"O WhatsApp recusou o envio para {number}. "
                "Verifique se o número está correto e ativo no WhatsApp."
            )
        return (
            "O WhatsApp recusou o envio (número inválido ou instância desconectada). "
            "Verifique o cadastro do cliente e a conexão da instância."
        )

    if "evolution api retornou http 5" in lowered:
        return "O servidor WhatsApp está indisponível no momento. Tente novamente em alguns minutos."

    if "evolution api" in lowered or text.startswith("{"):
        try:
            payload = json.loads(text[text.find("{") :] if "{" in text else text)
            if isinstance(payload, dict):
                response = payload.get("response")
                if isinstance(response, dict):
                    message = response.get("message")
                    if isinstance(message, list) and message:
                        first = message[0]
                        if isinstance(first, dict) and first.get("exists") is False:
                            number = _extract_whatsapp_number(json.dumps(first))
                            if number:
                                return (
                                    f"O número {number} não está cadastrado no WhatsApp. "
                                    "Confira o WhatsApp do cliente no cadastro."
                                )
        except Exception:
            pass
        return (
            "Não foi possível enviar pelo WhatsApp. "
            "Verifique o número do cliente e se a instância está conectada."
        )

    if len(text) > 220:
        return text[:217] + "..."
    return text
