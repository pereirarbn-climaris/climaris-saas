"""Armazenamento local de logos do catálogo de bancos (plataforma)."""

from __future__ import annotations

import os
import secrets
from io import BytesIO
from pathlib import Path

from PIL import Image

UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", "var/uploads")).resolve()


def bank_catalog_upload_dir() -> Path:
    p = UPLOAD_ROOT / "finance_bank_catalog"
    p.mkdir(parents=True, exist_ok=True)
    return p


def new_logo_token() -> str:
    return secrets.token_urlsafe(24)[:64].replace(".", "_")


def logo_file_path(token: str) -> Path:
    return bank_catalog_upload_dir() / f"{token}.webp"


def process_and_save_bank_logo(raw: bytes) -> tuple[str, int]:
    """Redimensiona, grava WebP e devolve (token, tamanho em bytes)."""
    im = Image.open(BytesIO(raw))
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA")
    im.thumbnail((256, 256))
    buf = BytesIO()
    im.save(buf, format="WEBP", quality=85)
    data = buf.getvalue()
    token = new_logo_token()
    path = logo_file_path(token)
    path.write_bytes(data)
    return token, len(data)


def delete_logo_file(token: str | None) -> None:
    if not token:
        return
    path = logo_file_path(token)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
