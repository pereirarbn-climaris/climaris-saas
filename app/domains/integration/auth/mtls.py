"""Autenticação mTLS para ERPs de fabricantes."""

from __future__ import annotations

from typing import Any

from models import ManufacturerIntegrationProfile


class MtlsAuthProvider:
    """
    Resolve contexto SSL cliente a partir do perfil.

    Reutiliza padrão de ``app/nfse_pfx_ssl.py`` — secrets via ``secrets_ref``.
    """

    def apply(self, headers: dict[str, str], *, profile: ManufacturerIntegrationProfile) -> dict[str, str]:
        out = dict(headers)
        out.setdefault("X-Integration-Auth", "mtls")
        return out

    def build_ssl_context(self, profile: ManufacturerIntegrationProfile) -> Any:
        """Fase 2: carregar PFX/PEM a partir de ``profile.secrets_ref``."""
        raise NotImplementedError("mTLS SSL context — implementar na Fase 2 com secrets_ref")
