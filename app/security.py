import os
import secrets
import string
import base64
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from cryptography.fernet import Fernet
from passlib.context import CryptContext

from app.config import JWT_EXPIRE_MINUTES


JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_BOOTSTRAP_TOKEN = os.getenv("JWT_BOOTSTRAP_TOKEN", "bootstrap-change-me")
PLATFORM_API_CREDENTIALS_KEY = os.getenv("PLATFORM_API_CREDENTIALS_KEY", "").strip()
_ENC_PREFIX = "enc:v1:"

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict[str, Any], expires_minutes: int | None = None) -> str:
    expires_delta = timedelta(minutes=expires_minutes or JWT_EXPIRE_MINUTES)
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def generate_temporary_password(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _resolve_platform_credentials_fernet_key() -> bytes:
    if PLATFORM_API_CREDENTIALS_KEY:
        return PLATFORM_API_CREDENTIALS_KEY.encode("utf-8")
    # Fallback determinístico para não quebrar ambientes antigos sem variável dedicada.
    digest = hashlib.sha256(JWT_SECRET_KEY.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _platform_credentials_fernet() -> Fernet:
    return Fernet(_resolve_platform_credentials_fernet_key())


def encrypt_platform_secret(value: str) -> str:
    token = _platform_credentials_fernet().encrypt(value.encode("utf-8")).decode("utf-8")
    return _ENC_PREFIX + token


def decrypt_platform_secret(value: str) -> str:
    # Compatibilidade: valores antigos em texto puro.
    if not value.startswith(_ENC_PREFIX):
        return value
    raw = value[len(_ENC_PREFIX) :]
    return _platform_credentials_fernet().decrypt(raw.encode("utf-8")).decode("utf-8")
