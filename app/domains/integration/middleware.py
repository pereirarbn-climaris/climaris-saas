"""Middleware de autenticação para comunicação segura com ERPs de fabricantes."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.domains.integration.auth.mtls import MtlsAuthProvider
from app.domains.integration.auth.oauth2 import OAuth2AuthProvider
from models import IntegrationAuthMode, ManufacturerIntegrationProfile


class IntegrationAuthMiddleware:
    """
    Aplica credenciais (mTLS / OAuth2 / API key) antes do transporte HTTP.

    Usado pelo ``IntegrationGateway`` e injetável em clientes HTTP customizados.
    """

    def __init__(self, db: Session, *, tenant_id: int) -> None:
        self._providers = {
            IntegrationAuthMode.MTLS.value: MtlsAuthProvider(),
            IntegrationAuthMode.OAUTH2.value: OAuth2AuthProvider(db, tenant_id=tenant_id),
        }

    def apply_headers(
        self,
        headers: dict[str, str],
        *,
        profile: ManufacturerIntegrationProfile,
    ) -> dict[str, str]:
        auth_mode = (
            profile.auth_mode.value if hasattr(profile.auth_mode, "value") else str(profile.auth_mode)
        )
        if auth_mode == IntegrationAuthMode.API_KEY.value:
            config = profile.config_json or {}
            api_key = config.get("api_key")
            if api_key:
                header_name = config.get("api_key_header") or "X-API-Key"
                return {**headers, header_name: str(api_key)}
            return headers

        provider = self._providers.get(auth_mode)
        if provider is None:
            return headers
        return provider.apply(headers, profile=profile)

    def build_transport_options(self, profile: ManufacturerIntegrationProfile) -> dict[str, Any]:
        """Opções extras para o cliente HTTP (ex.: contexto SSL mTLS)."""
        auth_mode = (
            profile.auth_mode.value if hasattr(profile.auth_mode, "value") else str(profile.auth_mode)
        )
        if auth_mode != IntegrationAuthMode.MTLS.value:
            return {}
        provider = self._providers.get(auth_mode)
        if provider is None:
            return {}
        try:
            ssl_context = provider.build_ssl_context(profile)  # type: ignore[union-attr]
            return {"ssl_context": ssl_context}
        except NotImplementedError:
            return {}
