"""Gateway de integração — resolve adapter + autenticação por perfil de fabricante."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.integration.base import IntegrationAdapter, IntegrationRequest, IntegrationResponse
from app.domains.integration.middleware import IntegrationAuthMiddleware
from app.domains.integration.protocols.json_rest import JsonRestAdapter
from app.domains.integration.protocols.xml_edi import XmlEdiAdapter
from models import IntegrationProtocol, ManufacturerIntegrationProfile

logger = logging.getLogger("erp.integration.gateway")

_PROTOCOL_ADAPTERS: dict[str, type[IntegrationAdapter]] = {
    IntegrationProtocol.JSON_REST.value: JsonRestAdapter,
    IntegrationProtocol.XML_EDI.value: XmlEdiAdapter,
}


class IntegrationGateway:
    """
    Ponto único de saída para ERPs de fabricantes.

    Fase 2: conectar transporte HTTP real; hoje resolve adapter + credenciais.
    """

    def __init__(self, db: Session, *, tenant_id: int) -> None:
        self.db = db
        self.tenant_id = tenant_id
        self._auth = IntegrationAuthMiddleware(db, tenant_id=tenant_id)

    def get_profile(self, profile_id: UUID) -> ManufacturerIntegrationProfile | None:
        return self.db.execute(
            select(ManufacturerIntegrationProfile).where(
                ManufacturerIntegrationProfile.id == profile_id,
                ManufacturerIntegrationProfile.tenant_id == self.tenant_id,
                ManufacturerIntegrationProfile.is_active.is_(True),
            )
        ).scalar_one_or_none()

    def resolve_adapter(self, profile: ManufacturerIntegrationProfile) -> IntegrationAdapter:
        protocol = (
            profile.protocol.value if hasattr(profile.protocol, "value") else str(profile.protocol)
        )
        adapter_cls = _PROTOCOL_ADAPTERS.get(protocol)
        if adapter_cls is None:
            raise ValueError(f"Protocolo não suportado: {protocol}")
        return adapter_cls(config=profile.config_json or {})

    def prepare_transport(
        self,
        profile: ManufacturerIntegrationProfile,
        request: IntegrationRequest,
    ) -> dict[str, Any]:
        adapter = self.resolve_adapter(profile)
        body, headers = adapter.serialize_request(request)
        headers = self._auth.apply_headers(headers, profile=profile)
        url = adapter.build_url((profile.base_url or "").rstrip("/"), request.operation)
        transport_options = self._auth.build_transport_options(profile)
        return {
            "url": url,
            "method": "POST",
            "body": body,
            "headers": headers,
            "adapter": adapter,
            "transport_options": transport_options,
        }

    def dispatch(
        self,
        profile_id: UUID,
        request: IntegrationRequest,
        *,
        transport: Any | None = None,
    ) -> IntegrationResponse:
        """
        Despacha requisição ao fabricante.

        ``transport`` é injetável para testes; produção usará cliente HTTP com mTLS/OAuth2.
        """
        profile = self.get_profile(profile_id)
        if profile is None:
            return IntegrationResponse(success=False, error_message="Perfil de integração não encontrado.")

        prepared = self.prepare_transport(profile, request)
        adapter: IntegrationAdapter = prepared["adapter"]

        if transport is None:
            logger.info(
                "integration dispatch placeholder tenant=%s profile=%s op=%s url=%s",
                self.tenant_id,
                profile.profile_code,
                request.operation,
                prepared["url"],
            )
            return IntegrationResponse(
                success=False,
                error_message="Transporte HTTP não configurado (Fase 2).",
            )

        raw = transport.send(
            url=prepared["url"],
            method=prepared["method"],
            body=prepared["body"],
            headers=prepared["headers"],
        )
        return adapter.deserialize_response(
            status_code=raw.get("status_code", 0),
            body=raw.get("body", ""),
            headers=raw.get("headers") or {},
        )
