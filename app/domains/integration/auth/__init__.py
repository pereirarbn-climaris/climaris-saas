"""Provedores de autenticação para integrações com fabricantes."""

from app.domains.integration.auth.mtls import MtlsAuthProvider
from app.domains.integration.auth.oauth2 import OAuth2AuthProvider

__all__ = ["MtlsAuthProvider", "OAuth2AuthProvider"]
