from __future__ import annotations

import json
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import (
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USE_SSL,
    SMTP_USE_STARTTLS,
    SMTP_USERNAME,
    SMTP_ALLOW_DB_OVERRIDE,
)
from app.security import decrypt_platform_secret
from models import PlatformApiCredential


@dataclass
class SmtpRuntimeConfig:
    host: str
    port: int
    username: str
    password: str
    from_email: str
    from_name: str
    use_starttls: bool
    use_ssl: bool


def _to_bool(value: object, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return default


def _to_int(value: object, default: int) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return default
    return default


def _resolve_smtp_runtime_config(db: Session | None = None) -> SmtpRuntimeConfig:
    cfg = SmtpRuntimeConfig(
        host=SMTP_HOST,
        port=SMTP_PORT,
        username=SMTP_USERNAME,
        password=SMTP_PASSWORD,
        from_email=SMTP_FROM_EMAIL,
        from_name=SMTP_FROM_NAME,
        use_starttls=SMTP_USE_STARTTLS,
        use_ssl=SMTP_USE_SSL,
    )
    if db is None or not SMTP_ALLOW_DB_OVERRIDE:
        return cfg

    row = db.execute(select(PlatformApiCredential).where(PlatformApiCredential.provider_slug == "smtp")).scalar_one_or_none()
    if row is None:
        return cfg

    extra: dict[str, object] = {}
    if row.extra_config_json:
        try:
            parsed = json.loads(row.extra_config_json)
            if isinstance(parsed, dict):
                extra = parsed
        except json.JSONDecodeError:
            extra = {}

    if isinstance(row.api_base_url, str) and row.api_base_url.strip():
        cfg.host = row.api_base_url.strip()
    if "port" in extra:
        cfg.port = _to_int(extra.get("port"), cfg.port if cfg.port > 0 else 587)
    if isinstance(extra.get("username"), str):
        cfg.username = str(extra.get("username")).strip()
    if isinstance(extra.get("from_email"), str):
        cfg.from_email = str(extra.get("from_email")).strip()
    if isinstance(extra.get("from_name"), str):
        cfg.from_name = str(extra.get("from_name")).strip()
    if row.api_key_secret:
        cfg.password = decrypt_platform_secret(row.api_key_secret)
    cfg.use_starttls = _to_bool(extra.get("use_starttls"), cfg.use_starttls)
    cfg.use_ssl = _to_bool(extra.get("use_ssl"), cfg.use_ssl)
    return cfg


def smtp_is_configured(db: Session | None = None) -> bool:
    """True se host e remetente estão definidos após resolver .env e override no banco (mesma lógica de send_email)."""
    cfg = _resolve_smtp_runtime_config(db)
    if not (cfg.host and str(cfg.host).strip() and cfg.from_email and str(cfg.from_email).strip()):
        return False
    if cfg.port < 1 or cfg.port > 65535:
        return False
    return True


def send_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    db: Session | None = None,
) -> None:
    cfg = _resolve_smtp_runtime_config(db)
    if not cfg.host or not cfg.from_email:
        raise RuntimeError("SMTP não configurado. Defina SMTP no SaaS (/operacao/chaves-api) ou no .env.")
    if cfg.port < 1 or cfg.port > 65535:
        raise RuntimeError("SMTP configurado com porta inválida.")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{cfg.from_name} <{cfg.from_email}>"
    msg["To"] = to_email
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    if cfg.use_ssl:
        with smtplib.SMTP_SSL(cfg.host, cfg.port, timeout=15) as client:
            if cfg.username:
                client.login(cfg.username, cfg.password)
            client.send_message(msg)
        return

    with smtplib.SMTP(cfg.host, cfg.port, timeout=15) as client:
        if cfg.use_starttls:
            client.starttls()
        if cfg.username:
            client.login(cfg.username, cfg.password)
        client.send_message(msg)
