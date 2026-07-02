"""Modelos de mensagem preventiva (até 4 por tenant, nomes editáveis)."""

from __future__ import annotations

import json
import re
from types import SimpleNamespace
from typing import Any

from models import Tenant

MAX_PREVENTIVE_MESSAGE_MODELS = 4
_LEGACY_RETURNING_ID = "returning"
_LEGACY_FIRST_ID = "first"

_DEFAULT_RETURNING_BODY = (
    "Olá, {cliente}! Notamos que faz {intervalo} desde a última manutenção do seu "
    "{equipamento} ({marca_modelo}). Vamos agendar a próxima preventiva?"
)
_DEFAULT_FIRST_BODY = (
    "Olá, {cliente}! Tudo bem? Está na hora da primeira higienização completa do seu "
    "{equipamento}. A limpeza regular garante eficiência energética e qualidade do ar. "
    "Vamos agendar?"
)


def _tenant_automation_defaults(tenant: Tenant) -> dict[str, Any]:
    return {
        "ai_message_enabled": bool(getattr(tenant, "preventive_ai_message_enabled", True)),
        "ai_message_fidelity": (
            getattr(tenant, "preventive_ai_message_fidelity", None) or "faithful"
        ),
        "auto_schedule_enabled": bool(getattr(tenant, "preventive_auto_schedule_enabled", False)),
        "action_buttons_enabled": bool(getattr(tenant, "preventive_action_buttons_enabled", False)),
        "button_schedule_enabled": bool(getattr(tenant, "preventive_button_schedule_enabled", True)),
        "button_schedule_text": (tenant.preventive_button_schedule_text or "Agendar agora").strip(),
        "button_custom_enabled": bool(getattr(tenant, "preventive_button_custom_enabled", True)),
        "button_more_text": (tenant.preventive_button_more_text or "Sim, quero saber mais").strip(),
        "button_custom_result": (
            getattr(tenant, "preventive_button_custom_result", None) or "lead"
        ),
        "button_custom_reply_text": getattr(tenant, "preventive_button_custom_reply_text", None),
        "button_custom_url": getattr(tenant, "preventive_button_custom_url", None),
        "technical_problem_hint": tenant.preventive_technical_problem_hint,
    }


def _normalize_custom_result(raw: Any) -> str:
    val = str(raw or "lead").strip().lower()
    if val in ("lead", "reply", "handoff", "url"):
        return val
    return "lead"


def _normalize_automation(row: dict[str, Any] | None, tenant: Tenant) -> dict[str, Any]:
    base = _tenant_automation_defaults(tenant)
    if not isinstance(row, dict):
        return base
    fidelity = str(row.get("ai_message_fidelity") or base["ai_message_fidelity"]).strip().lower()
    if fidelity not in ("faithful", "balanced"):
        fidelity = "faithful"
    return {
        "ai_message_enabled": bool(
            row.get("ai_message_enabled", base["ai_message_enabled"]),
        ),
        "ai_message_fidelity": fidelity,
        "auto_schedule_enabled": bool(
            row.get("auto_schedule_enabled", base["auto_schedule_enabled"]),
        ),
        "action_buttons_enabled": bool(
            row.get("action_buttons_enabled", base["action_buttons_enabled"]),
        ),
        "button_schedule_enabled": bool(
            row.get("button_schedule_enabled", base["button_schedule_enabled"]),
        ),
        "button_schedule_text": str(
            row.get("button_schedule_text") or base["button_schedule_text"],
        ).strip()[:80]
        or "Agendar agora",
        "button_custom_enabled": bool(
            row.get("button_custom_enabled", base["button_custom_enabled"]),
        ),
        "button_more_text": str(row.get("button_more_text") or base["button_more_text"]).strip()[:80]
        or "Sim, quero saber mais",
        "button_custom_result": _normalize_custom_result(
            row.get("button_custom_result", base["button_custom_result"]),
        ),
        "button_custom_reply_text": (
            str(row.get("button_custom_reply_text")).strip()[:2000]
            if row.get("button_custom_reply_text") not in (None, "")
            else base["button_custom_reply_text"]
        ),
        "button_custom_url": (
            str(row.get("button_custom_url")).strip()[:500]
            if row.get("button_custom_url") not in (None, "")
            else base["button_custom_url"]
        ),
        "technical_problem_hint": (
            str(row.get("technical_problem_hint")).strip()[:500]
            if row.get("technical_problem_hint") not in (None, "")
            else base["technical_problem_hint"]
        ),
    }


def _tenant_attachment_defaults(tenant: Tenant, *, model_id: str) -> dict[str, Any]:
    if model_id == _LEGACY_RETURNING_ID:
        s3_key = (getattr(tenant, "preventive_promo_image_s3_key", None) or "").strip() or None
        url = (tenant.preventive_promo_image_url or "").strip() or None
        return {
            "promo_image_enabled": bool(getattr(tenant, "preventive_promo_image_enabled", False)),
            "promo_image_url": url,
            "promo_image_s3_key": s3_key,
            "promo_image_mimetype": (tenant.preventive_promo_image_mimetype or "image/jpeg").strip(),
            "has_banner": bool(s3_key),
        }
    return {
        "promo_image_enabled": False,
        "promo_image_url": None,
        "promo_image_s3_key": None,
        "promo_image_mimetype": "image/jpeg",
        "has_banner": False,
    }


def _normalize_attachment(
    row: dict[str, Any] | None,
    tenant: Tenant,
    *,
    model_id: str,
) -> dict[str, Any]:
    base = _tenant_attachment_defaults(tenant, model_id=model_id)
    if not isinstance(row, dict):
        return base
    s3_key = str(row.get("promo_image_s3_key") or base["promo_image_s3_key"] or "").strip() or None
    url = str(row.get("promo_image_url") or base["promo_image_url"] or "").strip() or None
    has_banner = bool(row.get("has_banner")) if "has_banner" in row else bool(s3_key)
    return {
        "promo_image_enabled": bool(row.get("promo_image_enabled", base["promo_image_enabled"])),
        "promo_image_url": url,
        "promo_image_s3_key": s3_key,
        "promo_image_mimetype": (
            str(row.get("promo_image_mimetype") or base["promo_image_mimetype"]).strip()[:80]
            or "image/jpeg"
        ),
        "has_banner": has_banner,
    }


def _default_models_from_legacy(tenant: Tenant) -> list[dict[str, Any]]:
    returning_body = (tenant.preventive_message_template or _DEFAULT_RETURNING_BODY).strip()
    first_body = (tenant.preventive_message_template_first or _DEFAULT_FIRST_BODY).strip()
    return [
        {
            "id": _LEGACY_RETURNING_ID,
            "name": "Cliente recorrente",
            "body": returning_body,
            "automation": _tenant_automation_defaults(tenant),
            "attachment": _tenant_attachment_defaults(tenant, model_id=_LEGACY_RETURNING_ID),
        },
        {
            "id": _LEGACY_FIRST_ID,
            "name": "Primeira limpeza",
            "body": first_body,
            "automation": _tenant_automation_defaults(tenant),
            "attachment": _tenant_attachment_defaults(tenant, model_id=_LEGACY_FIRST_ID),
        },
    ]


def _sanitize_model_id(raw: str) -> str:
    slug = re.sub(r"[^a-z0-9_-]+", "", (raw or "").strip().lower())[:32]
    return slug or "modelo"


def _next_model_id(existing_ids: set[str]) -> str:
    for n in range(3, MAX_PREVENTIVE_MESSAGE_MODELS + 1):
        candidate = f"m{n}"
        if candidate not in existing_ids:
            return candidate
    for n in range(1, 100):
        candidate = f"m{n}"
        if candidate not in existing_ids:
            return candidate
    return f"m{len(existing_ids) + 1}"


def normalize_preventive_models_payload(
    models: list[dict[str, Any]] | None,
    *,
    tenant: Tenant | None = None,
) -> list[dict[str, Any]]:
    if not models:
        return []
    if tenant is None:
        raise ValueError("tenant é obrigatório para normalizar modelos preventivos.")
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in models[:MAX_PREVENTIVE_MESSAGE_MODELS]:
        if not isinstance(row, dict):
            continue
        mid = _sanitize_model_id(str(row.get("id") or ""))
        if not mid or mid in seen:
            mid = _next_model_id(seen)
        name = str(row.get("name") or "").strip()[:80] or f"Modelo {len(out) + 1}"
        body = str(row.get("body") or "").strip()[:12_000]
        automation = _normalize_automation(row.get("automation"), tenant)
        attachment = _normalize_attachment(row.get("attachment"), tenant, model_id=mid)
        out.append(
            {
                "id": mid,
                "name": name,
                "body": body,
                "automation": automation,
                "attachment": attachment,
            },
        )
        seen.add(mid)
    return out


def load_preventive_message_models(tenant: Tenant) -> list[dict[str, Any]]:
    raw = getattr(tenant, "preventive_message_models_json", None)
    if raw and str(raw).strip():
        try:
            data = json.loads(raw)
            if isinstance(data, list) and data:
                normalized = normalize_preventive_models_payload(data, tenant=tenant)
                if normalized:
                    return normalized
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    return _default_models_from_legacy(tenant)


def model_ids(tenant: Tenant) -> set[str]:
    return {m["id"] for m in load_preventive_message_models(tenant)}


def get_model_row(tenant: Tenant, model_id: str) -> dict[str, Any] | None:
    mid = (model_id or "").strip()
    for model in load_preventive_message_models(tenant):
        if model["id"] == mid:
            return model
    return None


def model_automation(tenant: Tenant, model_id: str) -> dict[str, Any]:
    row = get_model_row(tenant, model_id)
    if row and isinstance(row.get("automation"), dict):
        return _normalize_automation(row["automation"], tenant)
    return _tenant_automation_defaults(tenant)


def model_attachment(tenant: Tenant, model_id: str) -> dict[str, Any]:
    row = get_model_row(tenant, model_id)
    if row and isinstance(row.get("attachment"), dict):
        return _normalize_attachment(row["attachment"], tenant, model_id=model_id)
    return _tenant_attachment_defaults(tenant, model_id=model_id)


def model_config_namespace(tenant: Tenant, model_id: str) -> SimpleNamespace:
    """Visão unificada do modelo para funções legadas que leem atributos do tenant."""
    auto = model_automation(tenant, model_id)
    attach = model_attachment(tenant, model_id)
    return SimpleNamespace(
        preventive_ai_message_enabled=auto["ai_message_enabled"],
        preventive_ai_message_fidelity=auto["ai_message_fidelity"],
        preventive_auto_schedule_enabled=auto["auto_schedule_enabled"],
        preventive_action_buttons_enabled=auto["action_buttons_enabled"],
        preventive_button_schedule_enabled=auto["button_schedule_enabled"],
        preventive_button_schedule_text=auto["button_schedule_text"],
        preventive_button_custom_enabled=auto["button_custom_enabled"],
        preventive_button_more_text=auto["button_more_text"],
        preventive_button_custom_result=auto["button_custom_result"],
        preventive_button_custom_reply_text=auto["button_custom_reply_text"],
        preventive_button_custom_url=auto["button_custom_url"],
        preventive_technical_problem_hint=auto["technical_problem_hint"],
        preventive_promo_image_enabled=attach["promo_image_enabled"],
        preventive_promo_image_url=attach["promo_image_url"],
        preventive_promo_image_s3_key=attach["promo_image_s3_key"],
        preventive_promo_image_mimetype=attach["promo_image_mimetype"],
    )


def tenant_default_template_model_id(tenant: Tenant) -> str:
    preferred = (getattr(tenant, "preventive_default_template_model_id", None) or "").strip()
    ids = model_ids(tenant)
    if preferred and preferred in ids:
        return preferred
    legacy = (getattr(tenant, "preventive_default_template_kind", None) or "returning").strip().lower()
    if legacy == "first" and _LEGACY_FIRST_ID in ids:
        return _LEGACY_FIRST_ID
    if _LEGACY_RETURNING_ID in ids:
        return _LEGACY_RETURNING_ID
    models = load_preventive_message_models(tenant)
    return models[0]["id"] if models else _LEGACY_RETURNING_ID


def normalize_preventive_model_id(tenant: Tenant, value: str | None) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    ids = model_ids(tenant)
    if raw in ids:
        return raw
    lowered = raw.lower()
    if lowered in ids:
        return lowered
    if lowered == "first" and _LEGACY_FIRST_ID in ids:
        return _LEGACY_FIRST_ID
    if lowered == "returning" and _LEGACY_RETURNING_ID in ids:
        return _LEGACY_RETURNING_ID
    return None


def tenant_preventive_template_body(tenant: Tenant, *, model_id: str) -> str:
    for model in load_preventive_message_models(tenant):
        if model["id"] == model_id:
            return model["body"]
    if model_id == _LEGACY_FIRST_ID:
        return (tenant.preventive_message_template_first or _DEFAULT_FIRST_BODY).strip()
    return (tenant.preventive_message_template or _DEFAULT_RETURNING_BODY).strip()


def _sync_legacy_tenant_columns(tenant: Tenant, models: list[dict[str, Any]]) -> None:
    """Mantém colunas legadas alinhadas ao modelo returning (compatibilidade)."""
    returning = next((m for m in models if m["id"] == _LEGACY_RETURNING_ID), models[0] if models else None)
    if not returning:
        return
    tenant.preventive_message_template = returning.get("body") or None
    auto = returning.get("automation") if isinstance(returning.get("automation"), dict) else {}
    attach = returning.get("attachment") if isinstance(returning.get("attachment"), dict) else {}
    tenant.preventive_ai_message_enabled = bool(auto.get("ai_message_enabled", True))
    tenant.preventive_ai_message_fidelity = auto.get("ai_message_fidelity") or "faithful"
    tenant.preventive_auto_schedule_enabled = bool(auto.get("auto_schedule_enabled", False))
    tenant.preventive_action_buttons_enabled = bool(auto.get("action_buttons_enabled", False))
    tenant.preventive_button_schedule_enabled = bool(auto.get("button_schedule_enabled", True))
    tenant.preventive_button_schedule_text = auto.get("button_schedule_text") or "Agendar agora"
    tenant.preventive_button_custom_enabled = bool(auto.get("button_custom_enabled", True))
    tenant.preventive_button_more_text = auto.get("button_more_text") or "Sim, quero saber mais"
    tenant.preventive_button_custom_result = auto.get("button_custom_result") or "lead"
    tenant.preventive_button_custom_reply_text = auto.get("button_custom_reply_text")
    tenant.preventive_button_custom_url = auto.get("button_custom_url")
    tenant.preventive_technical_problem_hint = auto.get("technical_problem_hint")
    tenant.preventive_promo_image_enabled = bool(attach.get("promo_image_enabled", False))
    tenant.preventive_promo_image_url = attach.get("promo_image_url")
    tenant.preventive_promo_image_s3_key = attach.get("promo_image_s3_key")
    tenant.preventive_promo_image_mimetype = attach.get("promo_image_mimetype") or "image/jpeg"
    first = next((m for m in models if m["id"] == _LEGACY_FIRST_ID), None)
    if first:
        tenant.preventive_message_template_first = first.get("body") or None


def sync_preventive_models_to_tenant(
    tenant: Tenant,
    models: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    normalized = normalize_preventive_models_payload(models, tenant=tenant)
    if not normalized:
        normalized = _default_models_from_legacy(tenant)
    tenant.preventive_message_models_json = json.dumps(normalized, ensure_ascii=False)
    _sync_legacy_tenant_columns(tenant, normalized)
    default_id = tenant_default_template_model_id(tenant)
    if default_id not in {m["id"] for m in normalized}:
        default_id = normalized[0]["id"]
    tenant.preventive_default_template_model_id = default_id
    if default_id == _LEGACY_FIRST_ID:
        tenant.preventive_default_template_kind = "first"
    else:
        tenant.preventive_default_template_kind = "returning"
    return normalized


def update_model_attachment(
    tenant: Tenant,
    model_id: str,
    *,
    patch: dict[str, Any],
) -> list[dict[str, Any]]:
    models = load_preventive_message_models(tenant)
    updated: list[dict[str, Any]] = []
    found = False
    for model in models:
        if model["id"] != model_id:
            updated.append(model)
            continue
        found = True
        attachment = _normalize_attachment(
            {**(model.get("attachment") or {}), **patch},
            tenant,
            model_id=model_id,
        )
        updated.append({**model, "attachment": attachment})
    if not found:
        raise ValueError(f"Modelo '{model_id}' não encontrado.")
    return sync_preventive_models_to_tenant(tenant, updated)


def preventive_model_options(tenant: Tenant) -> list[dict[str, str]]:
    return [
        {"id": m["id"], "name": m["name"], "label": m["name"]}
        for m in load_preventive_message_models(tenant)
    ]
