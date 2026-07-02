"""Autenticação OAuth2 para ERPs de fabricantes."""

from __future__ import annotations

from sqlalchemy.orm import Session

from models import ManufacturerIntegrationProfile


class OAuth2AuthProvider:
    """Injeta Bearer token OAuth2 no header da requisição."""

    def __init__(self, db: Session, *, tenant_id: int) -> None:
        self.db = db
        self.tenant_id = tenant_id

    def apply(self, headers: dict[str, str], *, profile: ManufacturerIntegrationProfile) -> dict[str, str]:
        out = dict(headers)
        token = self._resolve_access_token(profile)
        if token:
            out["Authorization"] = f"Bearer {token}"
        return out

    def _resolve_access_token(self, profile: ManufacturerIntegrationProfile) -> str | None:
        """Fase 2: buscar/renovar token via ``secrets_ref`` ou tabela de tokens."""
        config = profile.config_json or {}
        return config.get("access_token") or None
